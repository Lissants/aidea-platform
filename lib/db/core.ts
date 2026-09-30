/**
 * lib/db/core.ts — SQL Server access (replaces lib/supabase/*).
 *
 * Deliberately NOT marked `server-only` so tsx scripts (migrate/seed) and
 * vitest can import it; app code should import from `@/lib/db`, which adds
 * the `server-only` guard on top of this module.
 *
 * Drivers (MSSQL_DRIVER):
 *   - `msnodesqlv8` (default on Windows): ODBC + Windows Integrated auth,
 *     works over shared memory / named pipes, so a default local SQL Server
 *     install needs no TCP or SQL-login setup.
 *   - `tedious`: pure-JS TDS over TCP with a SQL login (Docker / Linux).
 *
 * Row normalization keeps the shapes the Supabase-era code expects:
 *   - UNIQUEIDENTIFIER values come back lowercase (SQL Server returns them
 *     uppercase; the app compares ids with ===).
 *   - DATETIME/DATETIMEOFFSET values come back as ISO-8601 strings, not Date.
 *   - JSON columns listed in JSON_COLUMNS are parsed.
 */
import type * as MSSQL from 'mssql';

export type Params = Record<string, unknown>;
type Driver = typeof MSSQL;

const JSON_COLUMNS = new Set(['prior_value', 'new_value']);
const GUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

type DbGlobal = { __aideaDb?: Promise<{ driver: Driver; pool: MSSQL.ConnectionPool }> };
const g = globalThis as DbGlobal;

function envBool(name: string, fallback: boolean) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

function driverName(): 'msnodesqlv8' | 'tedious' {
  const d = process.env.MSSQL_DRIVER;
  if (d === 'msnodesqlv8' || d === 'tedious') return d;
  return process.platform === 'win32' ? 'msnodesqlv8' : 'tedious';
}

async function connect(): Promise<{ driver: Driver; pool: MSSQL.ConnectionPool }> {
  const name = driverName();
  const database = process.env.MSSQL_DATABASE || 'aidea';
  const pool = { max: Number(process.env.MSSQL_POOL_MAX || 10), min: 0, idleTimeoutMillis: 30_000 };

  if (name === 'msnodesqlv8') {
    const driver = ((await import('mssql/msnodesqlv8')) as any).default as Driver;
    const connectionString =
      process.env.MSSQL_CONNECTION_STRING ||
      [
        `Driver={${process.env.MSSQL_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server'}}`,
        `Server=${process.env.MSSQL_SERVER || '.'}`,
        `Database=${database}`,
        process.env.MSSQL_USER
          ? `Uid=${process.env.MSSQL_USER};Pwd=${process.env.MSSQL_PASSWORD ?? ''}`
          : 'Trusted_Connection=yes',
        `Encrypt=${envBool('MSSQL_ENCRYPT', true) ? 'yes' : 'no'}`,
        `TrustServerCertificate=${envBool('MSSQL_TRUST_CERT', true) ? 'yes' : 'no'}`,
      ].join(';') + ';';
    const p = new driver.ConnectionPool({ connectionString, pool } as any);
    await p.connect();
    return { driver, pool: p };
  }

  const driver = ((await import('mssql')) as any).default as Driver;
  const p = new driver.ConnectionPool({
    server: process.env.MSSQL_SERVER || 'localhost',
    port: Number(process.env.MSSQL_PORT || 1433),
    database,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    pool,
    options: {
      encrypt: envBool('MSSQL_ENCRYPT', true),
      trustServerCertificate: envBool('MSSQL_TRUST_CERT', true),
    },
  });
  await p.connect();
  return { driver, pool: p };
}

/** Singleton pool, cached on globalThis so dev hot-reloads don't leak pools. */
export function getPool() {
  if (!g.__aideaDb) {
    g.__aideaDb = connect().catch((err) => {
      g.__aideaDb = undefined;
      throw err;
    });
  }
  return g.__aideaDb;
}

export async function closePool() {
  const current = g.__aideaDb;
  g.__aideaDb = undefined;
  if (current) await (await current).pool.close();
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Normalized database error. `message` has ODBC "[Microsoft][...]" prefixes stripped. */
export class DbError extends Error {
  readonly number: number | undefined;
  constructor(message: string, number?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DbError';
    this.number = number;
  }
  /** Unique constraint / unique index violation. */
  get isUniqueViolation() {
    return this.number === 2627 || this.number === 2601;
  }
  /** Raised by THROW 5xxxx in our stored procedures/triggers. */
  get isAppError() {
    return this.number !== undefined && this.number >= 50000;
  }
}

function toDbError(err: unknown): DbError {
  if (err instanceof DbError) return err;
  const e = err as { message?: string; number?: number; code?: number | string; originalError?: any };
  const number =
    e?.number ??
    e?.originalError?.info?.number ??
    e?.originalError?.code ??
    (typeof e?.code === 'number' ? e.code : undefined);
  const raw = String(e?.message ?? err ?? 'Database error');
  const message = raw.replace(/^(\s*\[[^\]]*\])+\s*/, '').trim();
  return new DbError(message, typeof number === 'number' ? number : Number(number) || undefined, { cause: err });
}

// ---------------------------------------------------------------------------
// Query execution
// ---------------------------------------------------------------------------

function normalizeValue(key: string, v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    if (GUID_RE.test(v)) return v.toLowerCase();
    if (JSON_COLUMNS.has(key)) {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
  }
  if (Buffer.isBuffer(v)) return v;
  return v;
}

function normalizeRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = normalizeValue(k, v);
  return out as T;
}

/**
 * Expands array parameters into `@name_0, @name_1, ...` so callers can write
 * `WHERE id IN (@ids)`. An empty array becomes `NULL`, which matches nothing.
 */
function expandParams(text: string, params: Params): { text: string; flat: Params } {
  const flat: Params = {};
  const arrays = new Map<string, unknown[]>();
  for (const [k, v] of Object.entries(params)) {
    if (!IDENT_RE.test(k)) throw new DbError(`Invalid parameter name: ${k}`);
    if (Array.isArray(v)) arrays.set(k, v);
    else flat[k] = v;
  }
  if (arrays.size === 0) return { text, flat };
  const out = text.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (m, name: string) => {
    const arr = arrays.get(name);
    if (!arr) return m;
    if (arr.length === 0) return 'NULL';
    return arr
      .map((v, i) => {
        flat[`${name}_${i}`] = v;
        return `@${name}_${i}`;
      })
      .join(', ');
  });
  return { text: out, flat };
}

function bind(req: MSSQL.Request, driver: Driver, params: Params) {
  for (const [k, raw] of Object.entries(params)) {
    let v: unknown = raw;
    if (v === undefined) v = null;
    if (v instanceof Date) v = v.toISOString();
    if (v !== null && typeof v === 'object' && !Buffer.isBuffer(v)) v = JSON.stringify(v);
    if (v === null) req.input(k, driver.NVarChar, null);
    else if (typeof v === 'boolean') req.input(k, driver.Bit, v);
    else if (typeof v === 'number') req.input(k, Number.isInteger(v) ? driver.Int : driver.Float, v);
    else if (Buffer.isBuffer(v)) req.input(k, driver.VarBinary(driver.MAX), v);
    else req.input(k, driver.NVarChar(driver.MAX), String(v));
  }
}

type RequestFactory = () => Promise<{ driver: Driver; req: MSSQL.Request }>;

export interface Queryable {
  /** Runs a statement and returns the first result set (normalized). */
  query<T = Record<string, unknown>>(text: string, params?: Params): Promise<T[]>;
  /** First row of the first result set, or null. */
  queryOne<T = Record<string, unknown>>(text: string, params?: Params): Promise<T | null>;
  /** Runs a statement and returns the total rows affected. */
  execute(text: string, params?: Params): Promise<number>;
  /** EXEC dbo.<name> with named params; returns the first result set. */
  callProc<T = Record<string, unknown>>(name: string, params?: Params): Promise<T[]>;
  /** INSERT one row from an object. Keys must be plain column names. */
  insert(table: string, row: Params): Promise<number>;
  /** INSERT several rows (same keys as the first row). No-op for []. */
  insertMany(table: string, rows: Params[]): Promise<number>;
  /** UPDATE <table> SET <patch> WHERE <where>; where params must not collide with patch keys. */
  update(table: string, patch: Params, where: string, whereParams?: Params): Promise<number>;
}

function ident(name: string) {
  if (!IDENT_RE.test(name)) throw new DbError(`Invalid identifier: ${name}`);
  return `[${name}]`;
}

function makeQueryable(factory: RequestFactory): Queryable {
  async function raw(text: string, params: Params = {}) {
    const { driver, req } = await factory();
    const { text: sqlText, flat } = expandParams(text, params);
    bind(req, driver, flat);
    try {
      return await req.query(sqlText);
    } catch (err) {
      throw toDbError(err);
    }
  }

  const api: Queryable = {
    async query<T>(text: string, params?: Params) {
      const res = await raw(text, params);
      return (res.recordset ?? []).map((r: Record<string, unknown>) => normalizeRow<T>(r));
    },
    async queryOne<T>(text: string, params?: Params) {
      const rows = await api.query<T>(text, params);
      return rows[0] ?? null;
    },
    async execute(text: string, params?: Params) {
      const res = await raw(text, params);
      return (res.rowsAffected ?? []).reduce((a: number, b: number) => a + b, 0);
    },
    async callProc<T>(name: string, params: Params = {}) {
      const args = Object.keys(params).map((k) => `@${k} = @${k}`).join(', ');
      return api.query<T>(`EXEC dbo.${ident(name)} ${args}`, params);
    },
    async insert(table: string, row: Params) {
      return api.insertMany(table, [row]);
    },
    async insertMany(table: string, rows: Params[]) {
      if (rows.length === 0) return 0;
      const cols = Object.keys(rows[0]);
      const params: Params = {};
      const values = rows.map((row, i) =>
        '(' +
        cols
          .map((c) => {
            params[`${c}_${i}`] = row[c];
            return `@${c}_${i}`;
          })
          .join(', ') +
        ')'
      );
      // SQL Server caps a statement at 2100 parameters; chunk large batches.
      const perChunk = Math.max(1, Math.floor(2000 / cols.length));
      let affected = 0;
      for (let start = 0; start < values.length; start += perChunk) {
        const slice = values.slice(start, start + perChunk);
        const chunkParams: Params = {};
        for (let i = start; i < start + slice.length; i++) for (const c of cols) chunkParams[`${c}_${i}`] = params[`${c}_${i}`];
        affected += await api.execute(
          `INSERT INTO ${ident(table)} (${cols.map(ident).join(', ')}) VALUES ${slice.join(', ')}`,
          chunkParams
        );
      }
      return affected;
    },
    async update(table: string, patch: Params, where: string, whereParams: Params = {}) {
      const keys = Object.keys(patch);
      if (keys.length === 0) return 0;
      const params: Params = { ...whereParams };
      const sets = keys.map((k) => {
        params[`set_${k}`] = patch[k];
        return `${ident(k)} = @set_${k}`;
      });
      return api.execute(`UPDATE ${ident(table)} SET ${sets.join(', ')} WHERE ${where}`, params);
    },
  };
  return api;
}

export const db: Queryable & {
  /** Runs `fn` inside a transaction; commits on success, rolls back on throw. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
} = {
  ...makeQueryable(async () => {
    const { driver, pool } = await getPool();
    return { driver, req: pool.request() };
  }),
  async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
    const { driver, pool } = await getPool();
    const tx = new driver.Transaction(pool);
    await tx.begin();
    // Requests on one transaction must run sequentially; callers should
    // await each tx.* call rather than Promise.all-ing them.
    const q = makeQueryable(async () => ({ driver, req: new driver.Request(tx) }));
    try {
      const result = await fn(q);
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // already rolled back by XACT_ABORT / a THROW
      }
      throw toDbError(err);
    }
  },
};

/**
 * Converts a thrown DbError into the `{ error: message }` shape Server
 * Actions already return, e.g.
 *   const r = await attempt(() => db.callProc('usp_submit_idea', {...}));
 *   if (r.error) return { error: r.error } as const;
 */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return { data: null, error: toDbError(err).message };
  }
}

/**
 * `%term%` pattern for `col LIKE @p` (replaces Supabase `.ilike`; the
 * database collation is case-insensitive). Wildcards in the term are
 * bracket-escaped (`[%]`, `[_]`, `[[]`), which needs no ESCAPE clause —
 * `ESCAPE '\'` is mangled by the ODBC driver (error 506), so don't use it.
 */
export function likeContains(term: string) {
  return `%${term.replace(/[%_[]/g, (c) => `[${c}]`)}%`;
}

/** New primary-key value. Use for inserts whose id the caller needs (tables with triggers can't use OUTPUT). */
export function newId() {
  return crypto.randomUUID();
}
