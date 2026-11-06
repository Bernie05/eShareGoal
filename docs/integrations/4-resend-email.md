# 4. Resend (sending email)

**Status: ready to connect.** Invitations and account review emails are built. The "Email me a sign-in link" form is on the
sign-in page, which is set aside for now. The reminder emails from scheduled jobs are [not built yet](6-scheduled-jobs.md).

## What it does

Sends the app's emails: invitations, account decisions and sign-in links. Without a key nothing breaks; the app writes the
email to the server log instead (`[mail not sent: no AUTH_RESEND_KEY]`).

This is not Gmail. Resend sends mail **from** the app. [Gmail import](5-gmail-import.md) reads mail **into** the app.

## What you need

- A free account at [resend.com](https://resend.com).
- A domain you own, such as `esharegoal.com`, and access to its DNS settings. A `vercel.app` address does not work for this.

## Steps

1. In Resend, open **Domains → Add domain** and enter your domain.
2. Resend shows some DNS records. Add them where you bought the domain. They cover SPF and DKIM, which prove the mail is
   really from you.
3. Wait for **Verified**. It often takes about 15 minutes.
4. Go to **API Keys → Create API key**.
5. Add these to `.env.local`, and to Vercel:

   ```bash
   AUTH_RESEND_KEY="re_..."
   AUTH_EMAIL_FROM="eShareGoal <no-reply@your-domain.com>"
   ```

   The sender address must use the domain you verified.

## Check it works

Open http://localhost:3000/api/auth/providers. The list should include `resend`. To test delivery, open **Emails** in the
Resend dashboard after the app sends one, to see whether it was delivered.

## Watch out

- **No domain yet?** You can test with Resend's address `onboarding@resend.dev`, but it only delivers to your own Resend
  account email.
- Free plan: 100 emails a day and 3,000 a month. Sources disagree on how many domains are included, so check the pricing page.
- A domain still not verified after 72 hours is marked failed. The usual cause is records added to the main domain instead
  of the `send` subdomain, or a value copied with extra spaces or quotes.
- Resend does not create a DMARC record for you. Adding one at `_dmarc` helps keep mail out of spam.

## Official docs

- [Domains](https://resend.com/docs/dashboard/domains/introduction)
- [Domain not verifying](https://resend.com/docs/knowledge-base/what-if-my-domain-is-not-verifying)
- [Pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing)
