# 9. Google Sheets

**Status: not built yet.** The Connect button on a goal is a simulation. This one is optional.

## What it does

Copies a goal's records to a Google Sheet and updates it daily, so the group can keep its own copy or make its own reports.

## What you need

- The Google Cloud project from [Google sign-in](3-google-sign-in.md).
- [Scheduled jobs](6-scheduled-jobs.md) for the daily update. Once a day fits the free plan.

## Steps

These are for when it is built.

1. In Google Cloud, open **APIs & Services → Library** and enable the **Google Sheets API**.
2. On the OAuth consent screen, add the scope `https://www.googleapis.com/auth/drive.file`.
3. Each Owner then clicks **Connect** on the goal and allows access. Their permission is stored encrypted with
   `TOKEN_ENCRYPTION_KEY`, the same key as [Gmail import](5-gmail-import.md).

## Check it works

Connect a goal, then check that a sheet appears in that Owner's Google Drive with the goal's records.

## Watch out

- Use `drive.file`. It reaches only the files the app itself creates or the person opens with it, and it is
  **non-sensitive**, so it needs only Google's basic checks.
- The wider `spreadsheets` scope is sensitive and would add a review for no benefit.
- A sheet is a copy. If someone edits it, the change does not come back into the app.
- Anyone the sheet is shared with sees those records, so remind Owners to check who has access.

## Official docs

- [Choose Google Sheets API scopes](https://developers.google.com/workspace/sheets/api/scopes)
