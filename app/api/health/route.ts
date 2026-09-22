import { NextResponse } from 'next/server';

/**
 * Liveness/readiness check for a company-server deployment behind Nginx
 * or a container orchestrator's health probe. Deliberately does NOT touch
 * Supabase — this reports whether the Next.js server process itself is up
 * and serving, not whether the database is reachable, so it stays cheap
 * and fast enough to poll every few seconds. See
 * COMPANY_SERVER_DEPLOYMENT.md for how this is wired into Docker/Nginx.
 */
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
