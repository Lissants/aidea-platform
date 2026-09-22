/**
 * A minimal, hand-rolled stand-in for the subset of the Supabase JS client
 * used by our service-layer functions (`.from(table).select/insert/update/
 * delete/eq/single/maybeSingle`, plus `.rpc(name, params)`). It is NOT a
 * Postgres emulator — there is no RLS, no real SQL, no transactions. It
 * exists so integration tests can exercise the actual app-code path
 * (auth gating, Zod parsing, request shaping, response handling) in
 * lib/services/*.ts without a live Supabase project, which this sandbox
 * does not have.
 *
 * `rpcHandlers` lets each test encode the DOCUMENTED CONTRACT of the
 * Postgres function being called (fn_submit_vote, fn_route_reviewer,
 * fn_publish_batch, ...) as plain JS, so the integration test can assert
 * the service function reacts correctly to both a success and a
 * rejection from that contract. It does not verify the SQL itself is
 * correct — that requires running the migrations against a real
 * Postgres/Supabase project (see ASSUMPTIONS.md).
 */

export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;
export type RpcHandler = (params: Record<string, any>, tables: Tables) => { data?: unknown; error?: { message: string } | null };

function matches(row: Row, filters: [string, string, unknown][]): boolean {
  return filters.every(([col, op, val]) => {
    if (op === 'eq') return row[col] === val;
    if (op === 'in') return Array.isArray(val) && val.includes(row[col]);
    if (op === 'not_null') return row[col] !== null && row[col] !== undefined;
    return true;
  });
}

export function createFakeSupabase(tables: Tables, rpcHandlers: Record<string, RpcHandler> = {}) {
  function builder(table: string) {
    const filters: [string, string, unknown][] = [];

    const api: any = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push([col, 'eq', val]);
        return api;
      },
      in(col: string, vals: unknown[]) {
        filters.push([col, 'in', vals]);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      insert(rows: Row | Row[]) {
        const arr = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: r.id ?? cryptoRandomId(), ...r }));
        tables[table] = [...(tables[table] ?? []), ...arr];
        const lastInserted = arr;
        return {
          select() {
            return {
              async single() {
                return { data: lastInserted[0], error: null };
              },
              async maybeSingle() {
                return { data: lastInserted[0] ?? null, error: null };
              },
            };
          },
          then(resolve: (v: { data: Row[]; error: null }) => void) {
            resolve({ data: lastInserted, error: null });
          },
        };
      },
      update(patch: Row) {
        return {
          eq(col: string, val: unknown) {
            filters.push([col, 'eq', val]);
            return this;
          },
          then(resolve: (v: { error: null }) => void) {
            const rows = (tables[table] ?? []).filter((r) => matches(r, filters));
            rows.forEach((r) => Object.assign(r, patch));
            resolve({ error: null });
          },
        };
      },
      delete() {
        return {
          eq(col: string, val: unknown) {
            tables[table] = (tables[table] ?? []).filter((r) => r[col] !== val);
            return Promise.resolve({ error: null });
          },
        };
      },
      async maybeSingle() {
        const rows = (tables[table] ?? []).filter((r) => matches(r, filters));
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = (tables[table] ?? []).filter((r) => matches(r, filters));
        return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'Row not found' } };
      },
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        const rows = (tables[table] ?? []).filter((r) => matches(r, filters));
        resolve({ data: rows, error: null });
      },
    };

    return api;
  }

  return {
    from: builder,
    async rpc(name: string, params: Record<string, any>) {
      const handler = rpcHandlers[name];
      if (!handler) throw new Error(`fake-supabase: no rpc handler registered for "${name}"`);
      return handler(params, tables);
    },
  };
}

function cryptoRandomId(): string {
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
