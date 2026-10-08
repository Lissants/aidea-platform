# Security

## Authorization is enforced in the server code (no RLS)

The platform runs on SQL Server 2019, and the app connects with a single database login. The database therefore has no per-user identity and no row-level security.

Every row-level rule that Supabase's RLS used to enforce is now applied by the server-side code before a query reaches the database. `supabase/migrations/0099_rls.sql`, `0013` and `0014` are kept only as the specification for those rules, along with `supabase/RLS_TEST_MATRIX.md`. The rules cover ownership, team membership, "mentor sees only their own assignments", "published-only" reads for participants, and so on.

- **`lib/permissions/scopes.ts`** holds the translated rules.
  - SQL predicates are ANDed into reads: `ideaReadFilter`, `ideaDetailReadFilter`, `reviewAssignmentReadFilter`, `reviewReadFilter` and `profileReadFilter`.
  - Single-row checks are used before mutations: `canEditIdeaDraft`, `isAssignedMentor` and `canReadIdea`.
  - Every Server Action and Route Handler in `lib/services/*` and `app/**` uses these helpers or an equivalent explicit condition. Examples are `WHERE created_by = @uid AND status = 'draft'` and `notifications WHERE user_id = @uid`.
  - Admin-only operations check `isAdmin(user.roles)`.
- **Server Actions are public endpoints.** Every exported `'use server'` function can be called directly by any signed-in browser, not just by the page that uses it. Each one therefore re-checks the session and role itself. Read actions return empty results to callers who aren't entitled to them.
- **`lib/permissions/index.ts`'s `can()`** is the role-level UX layer: it hides navigation items and gates pages. It must never be the only protection for a mutation.
- **Participant-facing reads** of screening, qualifier and final-presentation outcomes return only published rows for the caller's own or team ideas. They select only the outcome columns. `internal_reason`, `decided_by`, `final_score` and `overall_comment` are never read for non-admins. This closes the column-exposure gap the Postgres design had (see "Known limitations" history in `ASSUMPTIONS.md`).

Race-sensitive or multi-table transitions run as stored procedures, each inside one transaction with row locks (`UPDLOCK`):
- `usp_submit_idea` and `usp_route_reviewer`
- `usp_submit_review` and `usp_reopen_review`
- `usp_publish_batch`
- `usp_submit_vote` and `usp_vote_tallies`

These are defined in `db/migrations/0003_procedures.sql`. Each takes an explicit `@actor_id` (the signed-in user's id, passed by the server) and re-checks that the actor may perform the transition:
- only the owner can submit an idea;
- only the assigned reviewer can submit a review;
- only admins can reopen reviews, publish, or see unpublished tallies.

The procedures are defense in depth on top of the service-layer checks. Every transactional procedure rolls back in `CATCH` before re-throwing, so a failure never leaves an open transaction on a pooled connection.

Queries are always parameterized (`@name` parameters through `lib/db`). The data layer rejects any identifier that isn't a plain name, and never concatenates user input into SQL.

## Database credentials

- **Local development and Windows self-hosting:** Windows Integrated authentication (`msnodesqlv8` over shared memory). No password is stored anywhere. The app runs with the rights of the Windows account it runs under, so a Windows service needs its own database access (see `SELF_HOSTING_WINDOWS.md` §9c).
- **Server and Docker:** a dedicated least-privilege SQL login such as `aidea_app` with `db_datareader`, `db_datawriter` and `GRANT EXECUTE`. It has no DDL rights. Migrations run separately with a `db_owner` account. The password lives only in the server environment (`MSSQL_PASSWORD`), never in the image or the repo.
- **Browser:** no database credential ever reaches the browser. Nothing database-related is prefixed `NEXT_PUBLIC_`.

## Auth model

**Sessions.** The session is an app-owned, HS256-signed JWT in the `aidea_session` cookie (`lib/auth/session-cookie.ts`).
- The cookie is `httpOnly` and `SameSite=Lax`. It is `Secure` in production. `SESSION_COOKIE_SECURE=false` turns that off for a plain-HTTP intranet deployment; prefer HTTPS where possible, because the cookie then travels unencrypted on the network.
- Each token lasts 8 hours, and `proxy.ts` re-issues it after an hour of use.
- It carries only the user id and email. Roles are always re-read from SQL by `getCurrentUser()`, so revoking a role takes effect on the next request.
- `SESSION_SECRET` (32 characters or more) is required in production. Rotating it signs everyone out.

**Email and password.**
- Passwords are bcrypt-hashed in `users.password_hash`.
- Sign-in attempts are throttled per email, and a failed sign-in takes the same time whether or not the email exists.
- Sign-in is gated by `ALLOWED_EMAIL_DOMAIN`, and deactivated profiles are refused.

**Microsoft Entra ID SSO (optional).**
- It uses the authorization-code flow with PKCE and a `state` check (`@azure/msal-node`).
- It checks the tenant (`tid` must equal `MICROSOFT_TENANT_ID`) and the email domain.
- It links to an existing account by Entra `oid`, then by email. Otherwise it provisions a new profile with `SSO_DEFAULT_ROLES`.

**Magic-link sign-in** was removed with Supabase Auth.

**Profile search.** `/api/profiles/search` backs both the Team Leader and the Team member pickers in the idea wizard. Any signed-in user can call it, and it returns only id, full name and email (top 10 matches, at least 2 characters).

**Route protection.**
- `proxy.ts` redirects signed-out visitors to `/sign-in`. It only verifies the cookie signature and makes no database call.
- The `(admin)`, `(mentor)` and `(participant)` layouts check roles server-side.
- `redirect_to` only accepts same-origin paths.

## User management and the Developer role

Accounts sit on one tier: User < Mentor < Admin < Developer. `employee_voter` is an extra that tier changes never touch. All changes go through `lib/services/users.ts`, which re-checks the caller on every action and applies `canManageUser()` (`lib/permissions`).

| Actor | Can manage |
| --- | --- |
| Developer | every tier, including other admins and Developers |
| Admin | User and Mentor accounts only. Cannot create, promote, demote, reset or remove an admin or Developer. |
| Mentor / User | nobody |

- A Developer passes every admin check: `isAdmin()` in the app and `dbo.fn_has_role(u, 'admin')` in SQL (migration `0005`). The "Routing required" notification (`0003_procedures.sql`) still goes to `admin` role holders only, so a Developer who isn't also an Admin doesn't receive it.
- Server-enforced locks: you cannot change, deactivate, delete or reset your own account here; the last active Developer and the last active admin-level account cannot be demoted, deactivated or deleted.
- "Remove" means deactivate (`profiles.active = 0`), which blocks sign-in on the next request and keeps history. Permanent delete works only for accounts with no ideas, votes, reviews, decisions or audit entries, because those foreign keys do not cascade.
- Created and reset accounts get a temporary password shown once, `users.must_change_password = 1`, and are redirected to `/profile/password` by every layout until they choose their own (12+ characters).
- Every create, tier change, deactivate/reactivate, reset and delete is written to the audit log (`entity_type = 'users'`). Passwords are never logged.
- The four platform Developers are created by `npm run db:seed` (`scripts/seed.ts`). The password is only applied when the account is first created and is hard-coded there, so treat it as compromised-by-design and change it after first sign-in.

## File uploads

- **Where files live:** showcase images, program resources, mentor photos and final presentation decks are stored on local disk under `UPLOAD_DIR` (`lib/storage/local.ts`).
- **Uploads** go through `POST /api/files/[bucket]`, which is admin-only. The one exception is final presentation decks (`idea-presentations`, 25 MB max, `.pptx` or `.pdf` checked by content). A team uploads its deck through `POST /api/ideas/[ideaId]/presentation` once its qualifier Build is published. Only the team, mentors and admins can download it.
  - Keys are server-generated (`<uuid>/<uuid>.<ext>`), and every key is validated against a strict pattern, so path traversal is impossible.
  - Showcase images are validated by their actual bytes (PNG, JPEG or WebP signature), not the browser-supplied type. The limit is 5 MB.
  - Program resources are limited to 10 MB, and HTML, SVG, script and executable types are refused.
- **Serving** goes through `GET /api/files/[bucket]/[...key]`.
  - Showcase images are public, as the old public bucket was. Program resources require a signed-in session.
  - Responses send `X-Content-Type-Options: nosniff` and a sandboxing `Content-Security-Policy`. Anything that isn't an image, PDF or plain text is served as an attachment.

## Publication gating ("Save ≠ Finalize ≠ Publish")

Every admin decision screen (Screening, Qualifier, Project Mentor Assignment, Final Presentation, Showcase Content), and Voting Management too, separates three distinct actions:

1. **Save:** a working draft. It stays editable and isn't visible to anyone outside the admin or mentor working on it.
2. **Finalize** (where applicable, e.g. Qualifier and Final Presentation): locks the assessment's content as complete. It is still not visible to the participant.
3. **Publish:** a separate, batched action with an explicit confirmation (`ConfirmDialog` requires typing "PUBLISH").
   - It sets `published = 1` through `usp_publish_batch`, which is admin-only.
   - It is the ONLY thing that makes a decision visible to anyone else. Every participant- and voter-facing query filters on `published = 1`, so an unpublished row is never returned to them.

Voting results follow the same principle:
- `voting_periods.results_published` gates the Results page.
- `usp_vote_tallies` refuses to return tallies for an unpublished period to anyone except an admin.
- Individual ballots are only ever read back for the voter themselves.

## Known limitations

- **Email is not actually sent** in this build. The only implementation in `lib/email/adapter.ts` queues to `email_outbox` (status `pending`) and logs to the console.
- **The voting-notifications cron route is not scheduled anywhere in this repo.** It is protected by `CRON_SECRET`. See `COMPANY_SERVER_DEPLOYMENT.md` §4 (Linux cron) or `SELF_HOSTING_WINDOWS.md` §9d (Windows Task Scheduler) for scheduling it.
- **No column-level redaction in the audit log viewer.** It shows the full `prior_value`/`new_value` JSON to any admin, including internal-only fields such as `internal_reason`.
- **Sign-in throttling is per process and in memory.** Put a shared rate limiter (or the reverse proxy's) in front if the app ever runs as multiple replicas.
- **No database-level safety net.** Because authorization lives in the application, a new query that forgets its scope filter would not be caught by the database. Review new data-access code against `lib/permissions/scopes.ts`. The integration tests (`tests/integration/`) exercise the ownership and locking rules against real SQL.
