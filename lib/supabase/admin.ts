import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * SERVICE-ROLE Supabase client. Bypasses RLS entirely — SERVER-ONLY, never
 * import from a Client Component or any code that ships to the browser
 * (the `server-only` import above will throw a build error if that happens).
 *
 * Every call site using this client MUST be documented here with why it
 * needs to bypass RLS:
 *
 * 1. scripts/seed.ts — creates auth.users rows and seeds demo data that
 *    RLS would otherwise block (no authenticated session exists yet).
 * 2. lib/services/publish.ts (fn_publish_batch caller) — admin publish
 *    actions that must write across screening_decisions / qualifier_
 *    assessments / final_presentation_assessments / showcase_projects
 *    regardless of row ownership. These are always gated by an
 *    is_admin() check in lib/permissions BEFORE this client is touched.
 * 3. lib/auth/session.ts (optional) — reading roles for a user during
 *    session bootstrap in contexts where cookie-based RLS lookups would
 *    be circular (documented per use, not used by default).
 * 4. app/api/cron/voting-notifications/route.ts — a scheduler calls this
 *    route with no end-user session, so it authenticates via CRON_SECRET
 *    instead and needs the service-role client to read/write
 *    voting_periods and notifications across all users.
 *
 * Do not add a new call site without adding a numbered note above.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'createAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
    );
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
