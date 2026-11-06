# Integrations

Every outside service eShareGoal uses, and how to connect each one. Each service has its own short file with the same
sections: what it does, what you need, the steps, the settings, how to check it works, and what to watch out for.

> **Secrets go in `.env.local` on your computer and in Vercel's settings. Never in git, never in chat, never in a screenshot.**
> If a key leaks, make a new one at the provider and delete the old one.

## At a glance

| # | Service | What it does | Needed for | Status | Cost to start |
|---|---|---|---|---|---|
| 1 | [Neon](1-neon-database.md) | Cloud database | Going live | **Ready to connect** | Free |
| 2 | [Vercel](2-vercel-hosting.md) | Hosts the app online | Going live | **Ready to connect** | Free |
| 3 | [Google sign-in](3-google-sign-in.md) | "Continue with Google" | Real accounts | **Code ready**, needs the sign-in page back | Free |
| 4 | [Resend](4-resend-email.md) | Sends emails and sign-in links | Invitations, reminders | **Ready to connect** | Free, needs a domain for real emails |
| 5 | [Gmail import](5-gmail-import.md) | Reads bank alert emails into deposits | Automatic deposits | **Connecting built**, importing not yet | Free to test, Google review to go public |
| 6 | [Scheduled jobs](6-scheduled-jobs.md) | Runs imports and reminders on a timer | Gmail import, reminders | Not built yet | Free for once a day |
| 7 | [Receipt storage](7-receipt-storage.md) | Keeps uploaded receipt images | Member submissions | Not built yet | Free to start |
| 8 | [Google Calendar](8-google-calendar.md) | Adds due dates to a calendar | Optional | Not built yet | Free |
| 9 | [Google Sheets](9-google-sheets.md) | Copies records to a sheet | Optional | Not built yet | Free |

**What the status means**

- **Ready to connect:** the code exists. Add the settings and it works.
- **Code ready:** the backend works, but a screen it needs is set aside for now.
- **Not built yet:** the screens show a simulated version. Setting up the account does nothing until the backend for it
  is built (phase 2), so you can wait. The file explains what will be needed.

## What this changes today

The app still shows the **design preview on sample data**. Connecting Neon, Google or Resend does not change what you
see on screen until the screens are connected to the backend. The sign-in page and `proxy.ts` (which sends signed-out
people to it) are set aside in `archive/backend-ui/`.

You do not need any of these accounts to run the app on your computer. See
[Quick start](../configuration.md#quick-start-no-accounts-needed).

## Suggested order

1. **Neon**, so the database exists in the cloud.
2. **Vercel**, so the app is online and you have a real web address. Google and Resend need that address.
3. **Google sign-in**, so real people can make accounts.
4. **Resend**, so invitations and sign-in links are delivered.
5. **Receipt storage and scheduled jobs**, when those features are built.
6. **Gmail import**, last. It has the longest approval process on Google's side.
7. **Calendar and Sheets**, only if you want them.

## All settings in one place

| Setting | Service | Where it goes | Status |
|---|---|---|---|
| `DATABASE_URL` | Neon | `.env.local`, Vercel | In use |
| `DATABASE_URL_UNPOOLED` | Neon | `.env.local`, Vercel | In use |
| `AUTH_SECRET` | Sign-in | `.env.local`, Vercel | In use |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in | `.env.local`, Vercel | In use |
| `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` | Resend | `.env.local`, Vercel | In use |
| `ADMIN_EMAILS` | Sign-in | `.env.local`, Vercel | In use |
| `TOKEN_ENCRYPTION_KEY` | Gmail, Calendar, Sheets | `.env.local`, Vercel | In use |
| `CRON_SECRET` | Scheduled jobs | Vercel | Planned |
| `BLOB_READ_WRITE_TOKEN` | Receipt storage | `.env.local`, Vercel | Planned |

**Planned** names may change when the feature is built. The development-only settings (`AUTH_DEV_BYPASS` and others) are
in [configuration.md](../configuration.md#environment-variables). Never set those on Vercel.

Limits and prices below were checked in November 2026. Providers change them, so check the linked page before you rely on one.
