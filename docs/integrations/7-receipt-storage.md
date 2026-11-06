# 7. Receipt storage

**Status: not built yet.** Receipts are saved inside your browser today, so only that browser can see them. The service is
not chosen yet; Vercel Blob is the simplest fit because the app will already be on Vercel.

## What it does

Keeps the receipt images members attach to a transaction, and email template images, so the Owner can see them from any
device. The database stores only a link to each file.

## What you need

- The app on [Vercel](2-vercel-hosting.md).

## Steps (Vercel Blob)

These are for when uploads are built.

1. In your Vercel project, open **Storage → Create → Blob**.
2. Connect it to the project. Vercel adds the token to the project's settings.
3. To use it on your computer, copy the token into `.env.local`:

   ```bash
   BLOB_READ_WRITE_TOKEN="..."
   ```

## Check it works

Upload a receipt in the app, then find the file under **Storage** in Vercel.

## Watch out

- **Receipts are private financial documents.** Only people in that goal should be able to open one. Make sure of this
  before going live; a file with a public link can be seen by anyone who gets the link. Check Vercel's private storage
  options at that point.
- Free plan: about 1 GB of storage and 2,000 operations a month. Vercel does not charge you for going over, but Blob stops
  working until the limit resets.
- Keep the app shrinking images before upload, as it already does, to stay within those limits.

## Official docs

- [Vercel Blob limits and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
