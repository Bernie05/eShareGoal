# 3. Google sign-in

**Status: code ready.** The backend is built. The "Continue with Google" button is on the sign-in page, which is set aside
in `archive/backend-ui/` until the screens are connected. You can create the keys now, but there is no button to click yet.

## What it does

Lets people sign in with their Google account. It only shares their name, email and picture. It gives no access to Gmail;
that is a separate permission on the same Google client ([Gmail import](5-gmail-import.md)).

## What you need

- A Google account.
- Your web address from [Vercel](2-vercel-hosting.md). You can add it later and start with localhost.

## Steps

1. Open the [Google Cloud console](https://console.cloud.google.com) and create a project named `eShareGoal`.
2. Go to **APIs & Services → OAuth consent screen**. Fill in the app name and support email, and add the scopes `openid`,
   `email` and `profile`.
3. Go to **Credentials → Create credentials → OAuth client ID**, and choose **Web application**.
4. Under **Authorized redirect URIs**, add both of these:

   ```
   http://localhost:3000/api/auth/callback/google
   https://YOUR-DOMAIN/api/auth/callback/google
   ```

5. Copy the client ID and secret into `.env.local`, and into Vercel:

   ```bash
   AUTH_GOOGLE_ID="...apps.googleusercontent.com"
   AUTH_GOOGLE_SECRET="..."
   ```

6. When you are ready for everyone, set the consent screen's publishing status to **In production**. While it is in
   **Testing**, only the test users you list can sign in.

## Check it works

Open http://localhost:3000/api/auth/providers. The list should include `google`.

A person's first sign-in creates an account in **Pending review**, and a System Admin approves it. Emails in `ADMIN_EMAILS`
become System Admins straight away, when Google vouches for the address. An address Google has not verified cannot sign in.

## Watch out

- The error `redirect_uri_mismatch` means the address in step 4 does not match exactly. Check `http` or `https`, the domain,
  and for a trailing slash.
- The client secret is shown in the console once you create it. Keep it out of git.

## Official docs

- [Auth.js Google provider](https://authjs.dev/getting-started/providers/google)
- [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
