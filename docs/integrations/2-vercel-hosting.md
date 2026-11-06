# 2. Vercel (hosting)

**Status: ready to connect.** The app builds for production, but it has not been deployed yet.

## What it does

Puts the app online at a real web address, and rebuilds it each time code is pushed to GitHub.

## What you need

- A free account at [vercel.com](https://vercel.com).
- The code on GitHub.
- [Neon](1-neon-database.md) set up first. The app cannot run on Vercel with the local database.

## Steps

1. In Vercel, click **Add New → Project** and import the GitHub repository. It detects Next.js by itself.
2. Open **Settings → Environment Variables** and add these for Production:

   | Setting | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled string |
   | `DATABASE_URL_UNPOOLED` | Neon direct string |
   | `AUTH_SECRET` | A new one. Run `npx auth secret`. Do not reuse your local one. |
   | `ADMIN_EMAILS` | Your email. You become System Admin the first time you sign in with Google or an email link. |
   | Google and Resend settings | Once you have them ([3](3-google-sign-in.md), [4](4-resend-email.md)) |

3. Before the first deploy, create the tables in the production database with `npm run db:migrate`, using that database's
   direct connection string.
4. Deploy, and note your web address, such as `https://esharegoal.vercel.app`.

## Check it works

Open the web address. The app should load with no error page. If it fails, open the deployment in Vercel and read
**Build Logs** or **Logs**.

## Watch out

- **Never** add `AUTH_DEV_BYPASS`, `AUTH_DEV_AS` or `AUTH_DEV_LOGIN` on Vercel.
- `DATABASE_URL` must be Neon. The app refuses to start in production with `pglite:`.
- Use a separate Neon branch for Preview deployments.
- After changing a setting, deploy again. Running apps do not pick it up.
- Run `npm run db:migrate` on production whenever a release adds a migration.

## Official docs

- [Hobby plan](https://vercel.com/docs/plans/hobby)
