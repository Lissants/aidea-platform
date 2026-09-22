# Security

## Row Level Security is the real authorization boundary

Every table has RLS enabled (`supabase/migrations/0099_rls.sql`), and every policy there is what actually decides who can read or write a row. `lib/permissions/index.ts`'s `can()` function is a **UX/defense-in-depth mirror** of that policy set — it hides nav items and gates pages/server actions before a request even reaches the database — but it is explicitly documented in that file as non-authoritative. If `can()` and an RLS policy ever disagree, the RLS policy wins, because Postgres enforces it regardless of what application code does or forgets to do.

Race-sensitive or multi-table transitions (submitting an idea, routing a reviewer, submitting/reopening a review, publishing a batch, casting a vote) are never re-implemented as a sequence of application-code writes. They go through `SECURITY DEFINER` Postgres functions (`fn_submit_idea`, `fn_route_reviewer`, `fn_submit_review`, `fn_reopen_review`, `fn_publish_batch`, `fn_submit_vote`, `fn_vote_tallies`) that lock the relevant rows and perform the whole transition inside one transaction. Application code only ever calls these via `supabase.rpc(...)` — it never hand-rolls the equivalent multi-step UPDATE sequence, which would be exposed to lost-update races under concurrent access.

## Service-role key handling

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely and is treated accordingly:

- Read only in `lib/supabase/admin.ts`, which is the **only** file allowed to construct a service-role client, and every call site using it is enumerated in that file's own doc comment (currently: the seed script, and the `voting-notifications` cron route, which runs with no end-user session so there is nothing else to authenticate against besides `CRON_SECRET`).
- Never sent to the browser — it is not prefixed `NEXT_PUBLIC_`, so Next.js's build tooling itself would refuse to inline it into a client bundle even by mistake.
- Every other server action and Route Handler uses the caller's own session-bound client (`lib/supabase/server.ts`), so RLS still applies to it exactly as it would to that user's own request.

## Auth model

- Supabase Auth, email/password and magic link, both gated to `ALLOWED_EMAIL_DOMAIN` (checked at sign-up/sign-in time).
- Session cookies are set/read via `@supabase/ssr`'s server client (`lib/supabase/server.ts`) and refreshed in `middleware.ts`.
- `middleware.ts` performs an edge-level route-prefix check (participant/mentor/admin/shared prefixes) as the first line of defense, redirecting unauthenticated visitors to `/sign-in` and unauthorized roles to `/access-denied`. Every `(admin)`/`(mentor)`/`(participant)` route group's `layout.tsx` repeats the same check server-side — the middleware check is a fast-path, not the only check, precisely so a middleware matcher mistake can't become an access-control hole.

## Publication gating ("Save ≠ Finalize ≠ Publish")

Every admin decision screen (Screening, Qualifier, Project Mentor Assignment, Final Presentation, Showcase Content) and Voting Management separate three distinct actions:

1. **Save** — a working draft, editable, not visible to anyone outside the admin/mentor working on it.
2. **Finalize** (where applicable, e.g. Qualifier/Final Presentation) — locks the assessment's content as complete, still not visible to the participant.
3. **Publish** — a separate, explicitly confirmed (`ConfirmDialog` with a typed "PUBLISH" confirmation), batched action that flips `published = true` and is the ONLY thing that makes a decision visible to anyone else. This is enforced by RLS, not just hidden by the UI: the underlying tables' SELECT policies for participants/voters explicitly require `published = true` (see `0099_rls.sql`, and the participant-facing SELECT policies added in `0014_participant_safe_view_rls_fix.sql`) — a participant querying the base table directly, bypassing the UI entirely, still cannot see an unpublished row.

Voting results follow the same principle: `voting_periods.results_published` gates the participant-facing Results page and `fn_vote_tallies` itself refuses to return tallies for an unpublished period to anyone except an admin session (`0010_fn_vote_tallies_admin_bypass.sql`) — live vote counts are visible to admins only, by design, and never to voters before publication.

## Known limitations

- **`ideas_participant_view`'s column exposure is row-level, not column-level.** The participant-facing SELECT policies added on `screening_decisions`/`qualifier_assessments`/`final_presentation_assessments` (`0014_participant_safe_view_rls_fix.sql`) necessarily grant row-level access to the whole row once `published = true`, not just the specific columns the view selects. Postgres/Supabase has no per-context column-level RLS (the same DB role serves every request), so a participant who queries the base table directly instead of going through the intended view would also see `internal_reason` / `final_score` / `overall_comment` on their own idea's already-published row. This is an accepted tradeoff consistent with the platform's original design intent (security-barrier views over column-level policies), not something column-level GRANTs can close in Postgres without per-role database users, which this platform's shared-Supabase-role model doesn't use. If this needs tightening later, the real fix is splitting those tables into a public-safe table and an admin-only table joined 1:1, not a policy change.
- **Email is not actually sent** in this build — `lib/email/adapter.ts`'s only implementation queues to `email_outbox` (status `pending`) and `console.log`s. Wiring a real SMTP/Microsoft Graph adapter is a documented TODO in that file; the interface is already in place so that's a drop-in swap, not a refactor.
- **The voting-notifications cron route is not scheduled anywhere in this repo** — `app/api/cron/voting-notifications/route.ts` exists, is `CRON_SECRET`-protected, and works correctly when hit, but actually triggering it on a schedule (Vercel Cron, a company cron daemon, etc.) is a deployment-time configuration step documented in `VERCEL_DEPLOYMENT.md` / `COMPANY_SERVER_DEPLOYMENT.md`, not something this codebase can self-schedule.
- **No column-level audit-log redaction UI.** The Audit Log viewer shows the full `prior_value`/`new_value` JSON diff to any admin. Since `audit_logs` itself is admin-only (RLS), this is consistent with "admins can see everything admins could already see via the underlying tables" — but it does mean an internal-only field like `internal_reason` shows up in the audit trail for any admin, not just the one who made the decision. This is intentional (audit trails need to be complete for the audience that can see them at all) but worth naming explicitly.
