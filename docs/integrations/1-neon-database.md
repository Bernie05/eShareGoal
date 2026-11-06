# 1. Neon (cloud database)

**Status: ready to connect.** The app already works with Neon. This has not been run against a real Neon project yet, so
treat the first run as a test.

## What it does

Keeps the app's data online (accounts, groups, goals, records) so everyone sees the same thing. Today the tables exist
only on your computer, in the `.data/` folder.

## What you need

- A free account at [neon.com](https://neon.com).

## Steps

1. Create a project. Pick a region close to your users, such as Singapore.
2. Click **Connect** on the project page. You need two connection strings:
   - **Pooled** (the address contains `-pooler`): the app uses this one.
   - **Direct** (no `-pooler`): used to create and change tables.
3. Put both in `.env.local`, replacing the local `DATABASE_URL` line:

   ```bash
   DATABASE_URL="postgresql://...-pooler...neon.tech/neondb?sslmode=require"
   DATABASE_URL_UNPOOLED="postgresql://...neon.tech/neondb?sslmode=require"
   ```

4. Create the tables:

   ```bash
   npm run db:migrate
   ```

5. Add the demo data, on a **development** database only:

   ```bash
   npm run db:seed -- --yes
   ```

## Check it works

Run `npm run db:studio`, or open **Tables** in the Neon console. You should see 12 tables, such as `user`, `group`, `goal`
and `record`.

To go back to the local database, set `DATABASE_URL="pglite:./.data/dev"` and remove `DATABASE_URL_UNPOOLED`.

## Watch out

- Neon does not create the tables by itself. Run `npm run db:migrate` every time a new migration is added.
- Use a separate Neon branch for development, and never seed production.
- The first request after a quiet period is slower, because the free database sleeps when idle.
- Free plan: 0.5 GB of storage and 100 compute hours per project each month. That is plenty to start.

## Official docs

- [Connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas)
