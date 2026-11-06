# eShareGoal

Shared goals, group funds and loan tracking for families, friends and teams. Next.js 16, Postgres (Neon) with Drizzle,
Auth.js.

## Getting started

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL="pglite:./.data/dev", AUTH_SECRET, AUTH_DEV_BYPASS=true
npm run dev                  # http://localhost:3000
```

The local database is created, migrated and seeded on first start. With the development bypass there is no sign-in:
switch people with **View as** in the sidebar. Neon, Google sign-in, email and deploying: see [docs/configuration.md](docs/configuration.md).

## Sign-in toggle

`AUTH_DEV_BYPASS` in `.env.local` decides whether you sign in:

| Value | What happens |
|---|---|
| `true` | No sign-in. Switch people with **View as** in the header. |
| `false` | Sign-in works as in production. Use this to test sign-up, approval and sign-out. |

Restart `npm run dev` after changing it. Production always signs in, whatever the value says. New accounts wait for a
System Admin under **Users**, so list your own email in `ADMIN_EMAILS` and sign in with Google or an email link: that proves
the inbox is yours, and the account becomes an active System Admin. A password sign-up proves nothing, so it never does.

## Where things are

| Path | What |
|---|---|
| `app/(app)/` | Signed-in pages: dashboard, groups, goals, admin users |
| `app/actions/` | Server Actions the pages call |
| `lib/server/` | Server rules: who may read or change what (`dal.ts`), groups, goals, admin |
| `lib/db/` | Database schema, connection and development seed |
| `drizzle/` | SQL migrations |
| `scripts/` | Seed and backend tests (`npm run test:backend`) |
| `archive/design-preview/` | The earlier clickable design preview, kept for reuse on this machine only (git-ignored, not built) |
