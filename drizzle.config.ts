import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Migrations: `npm run db:generate` writes SQL to drizzle/ from lib/db/schema.ts; `npm run db:migrate` applies it.
// Uses the direct (unpooled) connection when set, as Neon recommends for schema changes.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
  strict: true,
});
