// Fills the database in DATABASE_URL (Neon) with the development seed (lib/db/seed.ts). The local database
// (DATABASE_URL="pglite:…") seeds itself on first start, so this is only needed for a Neon development branch.
// Never for production. Run: npm run db:seed -- --yes   (safe to run again: rows with the same ids are skipped).
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as s from "../lib/db/schema";
import { seed } from "../lib/db/seed";

config({ path: ".env.local" });
if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (.env.local).");
if (url.startsWith("pglite:")) { console.log("The local database seeds itself on first start: just run npm run dev."); process.exit(0); }
if (!process.argv.includes("--yes")) { console.log("This adds demo data to the database in DATABASE_URL. Run again with --yes to continue."); process.exit(0); }

seed(drizzle(neon(url), { schema: s }) as unknown as Parameters<typeof seed>[0])
  .then((r) => console.log(`Seeded ${r.people} people, 2 groups, 4 goals and ${r.records} records.`))
  .catch((e) => { console.error(e); process.exit(1); });
