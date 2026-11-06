# 6. Scheduled jobs (cron)

**Status: the overdue check and one Gmail import are built.** `vercel.json` runs `/api/jobs/gmail-import` daily at 12:00 AM Manila,
then `/api/jobs/overdue` at 12:05 AM, so a new payment clears someone before they get a notice. There is no separate Workflows screen: an Owner or the System Admin sets everything in the job itself, by pasting a sample
email, adding target fields, checking the result object and using **Test on Gmail**. What they save (conditions, fields, payer
rules, on/off, deleted jobs) goes to the `import_setup` table, and that is what
the timer runs and the screens show. Only Car Credit runs on the timer, because it is the goal with real records. The timer runs once a night, so a
job's day counts and its time of day does not. Transfer cards are still in the browser: the timer matches payers by payer rules. Due date reminders do not run yet.

Try the import without saving anything:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/jobs/gmail-import?dry=1"
```

Without `?dry=1` it adds the payments to the goal's records. A payment needs a known member and a new confirmation number.
Anything else is counted and left for an Owner. The response has counts only, never payment details.

## Test the overdue check

1. Set `CRON_SECRET` in `.env.local`, and restart the server.
2. On the goal's **Scheduled jobs**, click **Run now** on **Overdue check**. It lists who has not paid.
3. Or call it as the scheduler would:

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/overdue
   ```

Vercel Cron does not run on your computer, so the timer itself only runs after deploying. Emails need [Resend](4-resend-email.md).
Without it, the run still lists who has not paid and says the email was not sent. A person gets one notice per month.

While developing, set `MAIL_TEST_TO` to your own address. Every email then goes to you, marked `[Test]` and naming who it was
for, and test emails do not count as a person's notice, so you can run the check again. Production ignores this setting.

## What it does

Wakes the app on a schedule to run Gmail imports, due date reminders and overdue checks, even when no
one has the app open.

## What you need

- The app on [Vercel](2-vercel-hosting.md). Vercel Cron is the planned scheduler.

## Steps

These are for when the jobs are built.

1. Add a `vercel.json` file listing the jobs. For example, every day at 1 AM UTC:

   ```json
   {
     "crons": [{ "path": "/api/jobs/run", "schedule": "0 1 * * *" }]
   }
   ```

2. Make a long random secret and add it to Vercel:

   ```bash
   CRON_SECRET="..."   # run: openssl rand -base64 32
   ```

3. Deploy. Vercel only runs cron jobs on production deployments.

Vercel sends the secret with each run, and the job checks it. Without that check, anyone who finds the address could start
the jobs. You have to add this setting yourself; Vercel does not create it.

## Check it works

In Vercel, open **Settings → Cron Jobs** to see the job, and click **Run** to start it by hand. The result shows in **Logs**.

## Watch out

- **Free plan: once a day only.** A schedule that runs more often fails when you deploy, and a job set for 1:00 can start
  any time up to 1:59.
- Hourly imports need the Pro plan or an outside scheduler that calls the same address.
- Schedules are in **UTC**. The Philippines is UTC+8, so 9:00 AM Manila is `0 1 * * *`.
- Vercel can run a job twice. The Gmail import skips anything already recorded, by reference and by Gmail message, and a unique index backs that up.

## Official docs

- [Cron job limits and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
