# 8. Google Calendar

**Status: not built yet.** The Connect button on a goal is a simulation. This one is optional.

## What it does

Adds a goal's due dates and deadline to a group calendar.

## What you need

- The Google Cloud project from [Google sign-in](3-google-sign-in.md).

## Steps

These are for when it is built.

1. In Google Cloud, open **APIs & Services → Library** and enable the **Google Calendar API**.
2. On the OAuth consent screen, add a Calendar scope. Pick the narrowest one that works, such as
   `https://www.googleapis.com/auth/calendar.events`.
3. Each Owner then clicks **Connect** on the goal and allows access. Their permission is stored encrypted with
   `TOKEN_ENCRYPTION_KEY`, the same key as [Gmail import](5-gmail-import.md).

## Check it works

Connect a goal, then check that its next due date appears in Google Calendar.

## Watch out

- Calendar scopes are **sensitive**, one level below Gmail's. Going public needs Google's verification, including a reason
  for each scope. Google says this usually takes 3 to 5 working days. There is no yearly security assessment.
- `calendar.events` can see and change events on all of the person's calendars, so ask for less if you can.
- Testing mode has the same 7-day expiry as Gmail.

## Official docs

- [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
