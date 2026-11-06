import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// The app's database.
// - Production and shared environments: Neon (DATABASE_URL = the pooled connection string), over the serverless driver
//   (WebSocket pool, so transactions work: e.g. accepting an invitation adds the member and closes it together).
// - Local development without any setup: DATABASE_URL="pglite:./.data/dev" runs an embedded Postgres stored in that folder.
//   It is migrated on first use and, when empty, filled with the development seed (lib/db/seed.ts). Never in production.
// - Tests (scripts/test-backend.ts) put a database in globalThis.__esgDb before importing anything that uses this.
// Call `await ensureDb()` before the first query of a request (the data access layer does, in getViewer).
export type Db = NeonDatabase<typeof schema>;
type Global = { __esgDb?: Db; __esgDbReady?: Promise<Db> };
const g = globalThis as Global;

async function open(): Promise<Db> {
  if (g.__esgDb) return g.__esgDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  if (!url.startsWith("pglite:")) return drizzle(new Pool({ connectionString: url }), { schema });
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("The local development database cannot run in production. Set DATABASE_URL to Neon.");
  const [{ PGlite }, { drizzle: pglite }, { migrate }, { seed }, { count }] = await Promise.all([
    import("@electric-sql/pglite"), import("drizzle-orm/pglite"), import("drizzle-orm/pglite/migrator"), import("./seed"), import("drizzle-orm"),
  ]);
  const dir = url.slice("pglite:".length);
  await (await import("node:fs/promises")).mkdir(dir, { recursive: true }); // PGlite does not create parent folders
  const local = pglite(new PGlite(dir), { schema });
  await migrate(local, { migrationsFolder: "drizzle" });
  const [{ n }] = await local.select({ n: count() }).from(schema.users);
  if (!n && process.env.DEV_SEED !== "false") console.info("[db] local database is empty: seeded", await seed(local));
  return local as unknown as Db; // same query API; Neon's type is used across the app
}

/** The database, opened once per server process (the dev server reloads modules, so it is kept on globalThis). */
export function ensureDb(): Promise<Db> {
  g.__esgDbReady ??= open().then((d) => (g.__esgDb = d)).catch((e) => { g.__esgDbReady = undefined; throw e; });
  return g.__esgDbReady;
}

/** The opened database, for services. ensureDb() must have run first in this request (it has, after getViewer). */
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    const d = g.__esgDb;
    if (!d) throw new Error("Database used before ensureDb(): call getViewer() (or await ensureDb()) first.");
    const v = Reflect.get(d, prop);
    return typeof v === "function" ? v.bind(d) : v;
  },
});
export { schema };
