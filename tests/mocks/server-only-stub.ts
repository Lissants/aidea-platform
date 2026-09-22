// Test-only stub for the `server-only` package. The real package throws
// unconditionally outside a "react-server" bundler condition, which vitest
// doesn't set — so lib modules marked `import 'server-only'` (by design,
// per lib/supabase/admin.ts's own doc comment) would otherwise fail to
// import at all in a plain Node test run. Aliased in vitest.config.ts.
export {};
