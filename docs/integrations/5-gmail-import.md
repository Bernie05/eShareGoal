# 5. Gmail import

**Status: connecting and Run now are built; automatic runs are not.** Connect, Change inbox, Disconnect, Test connection and a
job's **Run now** are real once the Google keys are set and the inbox has signed in. Jobs do not run on their schedule yet, because
jobs and workflows are still saved in the browser, where a server timer cannot see them. IMAP is still simulated.
The connection has not been tried against a real Google account yet.

## What it does

An Owner connects the inbox that receives bank and e-wallet alerts. On a schedule, the app reads new alerts, turns each into
a deposit using a workflow, and assigns it to a member.

It reads emails only. It has no access to a bank account, and it depends on the bank sending those emails.

## Two ways to connect

An API key cannot read Gmail. Google requires the mailbox owner's permission. Clicking **Connect** on the Gmail row opens a
dialog that chooses the inbox, in one of two ways:

| | Google sign-in (OAuth) | IMAP + app password |
|---|---|---|
| Setup | Owner clicks and allows read-only access | Owner makes an app password in their Google Account |
| Google's review | **Required** to open to the public | None |
| Needs | Google Cloud setup below | 2-Step Verification on the account |
| Access | Read-only | Full mailbox access for that password |
| Best for | Going public | Your own inbox, testing, a small group |

## What you need (Google sign-in)

- The Google Cloud project from [Google sign-in](3-google-sign-in.md).
- [Scheduled jobs](6-scheduled-jobs.md), so imports run while you are away.

## Steps (Google sign-in)

1. In Google Cloud, open **APIs & Services → Library** and enable the **Gmail API**.
2. On the OAuth consent screen, add the scope `https://www.googleapis.com/auth/gmail.readonly`.
3. On your OAuth client, add these under **Authorized redirect URIs**:

   ```
   http://localhost:3000/api/gmail/callback
   https://YOUR-DOMAIN/api/gmail/callback
   ```

4. While testing, add your Gmail address under **Test users**.
5. Add the keys to `.env.local`, and to Vercel. Gmail uses the same client as Google sign-in. Restart the server afterwards.

   ```bash
   AUTH_GOOGLE_ID="...apps.googleusercontent.com"
   AUTH_GOOGLE_SECRET="..."
   TOKEN_ENCRYPTION_KEY="..."   # run: openssl rand -base64 32. Your local .env.local already has one.
   ```

   On Vercel, also set `AUTH_URL` to your web address, because the redirect address is built from it.

Keep `TOKEN_ENCRYPTION_KEY` safe and unchanged. If it changes, saved connections stop opening and each Owner must sign in again.

## Steps (IMAP + app password)

1. Turn on 2-Step Verification on the Google account.
2. Create an app password in Google Account → Security.
3. Click **Connect** on the Gmail row, choose **Use an app password instead** and paste it. For now this is only a simulation;
   the real IMAP connection is not built.

## Check it works

On the goal, open **Goal setup → Integrations**.

1. On the Gmail row, click **Connect**. If the dialog says **Simulated**, the keys are not set or the server was not restarted.
2. Pick an inbox from the list, or **Use another account** to see the Google accounts in your browser. Then allow access on Google's page.
3. You return to the goal with Gmail **Active**, your address shown and the connection panel open.
4. Click **Test connection**. It checks Google, your sign-in, read access and your label, then lists your 5 latest emails
   (sender and subject only; nothing is saved).
5. When the test passes, a confirmation email goes to the connected inbox. It is sent by [Resend](4-resend-email.md), not Gmail,
   because this connection is read-only. Without Resend set up, the test still passes and says the email was not sent.

The address linked is the one you choose on Google's page, even if you clicked a different one in the dialog.

The list in the dialog shows your account's email and the inboxes you linked to goals. The app cannot read which Google accounts
are in your browser; only Google's page can, which is why **Use another account** goes there.

Several goals can read the same inbox. **Disconnect** and **Change inbox** only cancel the access at Google when no other goal
still reads that inbox, because cancelling cuts off every goal using that account.

In development (`AUTH_DEV_BYPASS=true`), inboxes in the list link at once without Google's page. One that has signed in before
keeps reading real mail, even after **Disconnect**. The others are simulated. **Use another account** still opens Google, which
is how an inbox signs in the first time. Production ignores all of this and always signs in with Google.

Common errors:

- `redirect_uri_mismatch`: the address in step 3 does not match exactly.
- `access_denied` or "app is blocked": your Gmail is not on the **Test users** list.
- "Gmail API is not turned on": repeat step 1.

## Running an import job

On a job, click **Run now**. The server searches the inbox with the workflow's Where, reads up to the newest 50 matches, and shows
what it found. The workflow runs on the server, so only the values it reads reach the browser, never the email. Nothing is saved
until you send the payments to Import review or add them to the goal. Only the person who linked the inbox can run this.

Each payment is handled once. Run now, Confirm in Import review and the timer all check the goal's records and review queue by
reference and by Gmail message, and the database refuses a second copy. A deleted or rejected payment does not come back.

The queue is saved in the database. Owners see waiting payments on the header bell, the Import review link and the goal page. The timer
adds payments with a member straight to the records; one with no member waits in the queue until an Owner picks one or a payer rule matches.

For a real bank alert, open **Goal setup → Scheduled jobs → New scheduled job**, paste the alert as the sample email, add its target fields and use **Test on Gmail**.

## Transfer cards

Each person can list the cards or accounts they send from, under **Payment cards** in the account menu. A System Admin can also manage them in
**Users**. Only the last 3 or 4 digits are kept, as bank alerts show them, never a full number.

When an import job reads an account ending from an email, it uses a payer rule first, then the cards of that goal's members.
If two members share an ending, nothing is assigned and an Owner maps it, because a few digits are not unique.

For now cards are saved in the browser, like the other preview lists.

## Watch out: Google's rules

This is the hardest integration to take public. Plan for it early.

- `gmail.readonly` is a **restricted** scope, Google's strictest level. An app that stores this data on a server is
  expected to pass full verification and a yearly security assessment (CASA) by an approved company. That costs money and
  takes time. Confirm the current rules on Google's page before you plan around it.
- **Testing mode stops working every 7 days.** In Testing, Google's permission expires after 7 days, so the Owner must
  reconnect each week. Fine for a trial, not for daily use.
- An unverified app is capped at 100 users.
- Only ask for `gmail.readonly`. Adding more access later can trigger a new review.
- **Before going live:** the Gmail routes check that someone is signed in, but not yet that they own that goal. That check comes
  when the screens move to the database. Until then, use this on your own computer only.
- Bank emails contain personal data. Keep only what a record needs, and never keep the access token in the browser.

**My suggestion:** start with IMAP for your own family group. Go through Google's review only if the app opens to the public.

## Official docs

- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
