# Configuration

How to run eShareGoal locally and how to configure each service it uses. All settings live in environment variables:
`.env.local` on your machine (never committed), and the hosting provider's settings in production.

**Connecting an outside service?** See [Integrations](integrations/README.md): one short guide per service, with what
works today and what is not built yet.

- [Quick start (no accounts needed)](#quick-start-no-accounts-needed)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Sign-in](#sign-in)
- [System Admins](#system-admins)
- [Email](#email)
- [Commands](#commands)
- [Deploying to Vercel](#deploying-to-vercel)
- [Security checklist](#security-checklist)

## Quick start (no accounts needed)

```bash
npm install
cp .env.example .env.local   # then set the three values below
npm run dev                  # http://localhost:3000
```

Minimum `.env.local` for local development:

```bash
DATABASE_URL="pglite:./.data/dev"   # embedded Postgres in .data/dev
AUTH_SECRET="…"                      # any long random string: npx auth secret
AUTH_DEV_BYPASS=true                 # no sign-in screen; switch people with View as
```

> **Current state:** the app shows the original design preview (sample data). The backend below (database, sign-in,
> permissions, Server Actions in `app/actions`) is built and tested (`npm run test:backend`) but not wired to the screens
> yet. The database screens built in phase 1, the sign-in page, View as and `proxy.ts` are set aside in
> `archive/backend-ui/` as a reference. The sign-in, bypass and View as notes below apply once the screens use the backend.

On first start the app creates the local database, runs the migrations and loads the development seed. The seeded people:

| Person | Email | Use it to try |
|---|---|---|
| Sam Admin | admin@example.com | System Admin: every group (view only), Users, dashboard numbers |
| Bernz | bernz@example.com | Owner of Family, Member of Friends |
| Babylyn | babylyn@example.com | Member of Family (all goals) |
| Billy | billy@example.com | Member of Family, Car Credit only; has asked to join Family Fitness |
| Carla | carla@example.com | Owner of Friends |
| Dino | dino@example.com | Member of Friends |
| Ella | ella@example.com | Invited to Family, not joined yet |
| Nico Santos | nico@example.com | New account waiting for review |

To start over, stop the server and delete the `.data` folder. The next start seeds it again.

## Environment variables

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | Always | `pglite:./.data/dev` for the local database, or Neon's **pooled** connection string. |
| `DATABASE_URL_UNPOOLED` | Neon | Neon's **direct** connection string, used by migrations. |
| `AUTH_SECRET` | Always | Signs the session cookie. Generate with `npx auth secret`. Different in each environment. |
| `AUTH_URL` | Production, optional | The app's public URL, e.g. `https://esharegoal.vercel.app`. Vercel sets it automatically. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | For Google sign-in | OAuth client from Google Cloud. The button appears once set. |
| `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` | For email sign-in and emails | Resend API key and the sender address. Without them, invitation emails are only logged. |
| `ADMIN_EMAILS` | Production | Comma-separated emails that become System Admins once the inbox is proven (Google or an email link). A password sign-up does not count. |
| `AUTH_DEV_BYPASS` | Development only | `true` skips sign-in and shows **View as** in the sidebar. Ignored in production. |
| `AUTH_DEV_AS` | Optional, development | Who you are before switching (a user id, e.g. `seed-bernz`). Default: the first System Admin. |
| `AUTH_DEV_LOGIN` | Development only | `true` shows the developer sign-in on `/sign-in` (when not bypassing). Ignored in production. |
| `DEV_SEED` | Optional | `false` starts the local database empty instead of with the seed. |

## Database

The app uses Postgres through Drizzle. The schema is in `lib/db/schema.ts`; migrations are SQL files in `drizzle/`.

**Local (default).** `DATABASE_URL="pglite:./.data/dev"` runs an embedded Postgres (PGlite) inside the dev server. Migrated
and seeded automatically. It refuses to run in production. Only one process can open it at a time: stop `npm run dev`
before using `npm run db:studio` on it.

**Neon (shared development, preview, production).**

1. Create a project at [neon.tech](https://neon.tech) (region close to your users, e.g. Singapore).
2. **Connect** → copy the pooled string into `DATABASE_URL` and the direct one into `DATABASE_URL_UNPOOLED`.
3. Create the tables: `npm run db:migrate`.
4. Development branch only: add demo data with `npm run db:seed -- --yes`. It refuses to run against production.

Use a separate Neon branch for development and previews, and never seed the production branch.

**Changing the schema.** Edit `lib/db/schema.ts`, run `npm run db:generate` to write a new migration, review the SQL in
`drizzle/`, then `npm run db:migrate`. Commit the migration with the code that needs it.

## Sign-in

Sign-in uses Auth.js (`auth.ts`). The session cookie only holds the user id; account status and site role are read from
the database on every request, so approving, rejecting or revoking someone takes effect at once.

**Google.**

1. [Google Cloud console](https://console.cloud.google.com) → APIs & Services → **OAuth consent screen**: app name,
   support email, scopes `openid`, `email`, `profile`.
2. **Credentials** → Create credentials → **OAuth client ID** → Web application.
3. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` and
   `https://<your-domain>/api/auth/callback/google`.
4. Put the client ID and secret in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

**Email link.** Set up [Email](#email); the "Email me a sign-in link" form appears once `AUTH_RESEND_KEY` is set.

**Development bypass and View as.** `AUTH_DEV_BYPASS=true` skips sign-in completely: you are the System Admin (or
`AUTH_DEV_AS`) at once. **View as** at the bottom of the sidebar (also on the waiting-for-review screen) lists everyone in
the database; pick someone to become them. The choice is kept in a cookie until you switch again, across reloads and
restarts. It overrides a real sign-in while on. Off whenever `NODE_ENV` or `VERCEL_ENV` is `production`.

**Developer sign-in.** `AUTH_DEV_LOGIN=true` lists everyone in the database on `/sign-in` and signs you in as them without a
password. It only works when neither `NODE_ENV` nor `VERCEL_ENV` is `production`. Never set it on a shared environment.

**New accounts.** Signing in for the first time creates an account in **Pending review**. A System Admin approves or
rejects it on `/admin/users`; until then the person sees the waiting screen.

## System Admins

List their emails in `ADMIN_EMAILS`. When one of them proves the inbox, with Google or an email link, the account becomes a
System Admin and is active at once. A password sign-up proves nothing: that account waits for review like any other, until an
email link is opened for it. Opening the link also ends the password, because anyone could have set it. Active accounts are
not changed by editing the list: to promote someone later, update their row (`site_role = 'admin'`, `status = 'active'`) in
the database.

System Admins see every group and goal but change nothing in them; they review, revoke and restore accounts.

## Email

Invitations, review decisions and sign-in links are sent with [Resend](https://resend.com).

1. Add and verify your domain in Resend (DNS records).
2. Create an API key → `AUTH_RESEND_KEY`.
3. `AUTH_EMAIL_FROM="eShareGoal <no-reply@your-domain.com>"`, on the verified domain.

Without a key nothing fails: emails are written to the server log instead (`[mail not sent: no AUTH_RESEND_KEY]`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run test:backend` | Server rule tests on a throwaway embedded Postgres (no setup needed) |
| `npm run db:generate` | Write a migration from changes in `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database in `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`) |
| `npm run db:seed -- --yes` | Add the demo data to a Neon development database |
| `npm run db:studio` | Browse the database in Drizzle Studio |

## Deploying to Vercel

1. Import the repository in Vercel.
2. **Settings → Environment Variables** for Production (and Preview, with its own Neon branch): `DATABASE_URL`,
   `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM`,
   `ADMIN_EMAILS`. Do not set `AUTH_DEV_BYPASS`, `AUTH_DEV_AS` or `AUTH_DEV_LOGIN`.
3. Run `npm run db:migrate` against the production database before (or as part of) the first deploy, and again whenever
   a release adds a migration.
4. Add the production URL's Google redirect URI (see [Google](#sign-in)).

## Security checklist

- `.env.local`, `.env.*` and `.data/` are in `.gitignore`. Never commit keys; if one is committed, rotate it.
- A different `AUTH_SECRET` in every environment.
- `AUTH_DEV_BYPASS` and `AUTH_DEV_LOGIN` only on your own machine.
- Production uses Neon, never `pglite:`.
- Every page and Server Action checks the signed-in user and their role on the server (`lib/server/dal.ts`); hiding a
  button is never the protection.
