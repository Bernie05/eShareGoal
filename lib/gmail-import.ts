// The sample inbox Gmail import reads in the preview (no Gmail is read). FICTIONAL emails from a bank and an e-wallet.
// How emails are found, checked and read into JSON is an import workflow (lib/import-workflows.ts).

export type SampleEmail = { id: string; from: string; to: string; subject: string; received: string; body: string };

export const SAMPLE_EMAILS: SampleEmail[] = [
  { id: "msg-demo-7f3a", from: "notify@example-bank.test", to: "Bernie Santos <bernie.family@example.test>", subject: "Transfer Received", received: "2026-10-24 09:12",
    body: "Hi! You received PHP 12,000.00 via InstaPay.\nTransfer From: BERNARDO SANTOS\nFrom Account: ****4821\nReference No.: DEMO-BE2410\nDate: Oct 24, 2026 09:12 AM" },
  { id: "msg-demo-2c91", from: "notify@example-bank.test", to: "Bernie Santos <bernie.family@example.test>", subject: "Transfer Received", received: "2026-10-23 17:40",
    body: "Hi! You received PHP 8,000.00 via InstaPay.\nTransfer From: BABYLYN SANTOS\nFrom Account: ****7710\nReference No.: DEMO-BA2310\nDate: Oct 23, 2026 05:40 PM" },
  { id: "msg-demo-91e0", from: "no-reply@example-wallet.test", to: "bernie.family@example.test", subject: "You have received money", received: "2026-10-22 19:03",
    body: "You have received PHP 1,000.00 from WILLIAM S.\nSender mobile: 0917•••3302\nRef. No. WLT-55102231\nThank you for using Example Wallet." },
  { id: "msg-demo-aa10", from: "notify@example-bank.test", to: "Bernie Santos <bernie.family@example.test>", subject: "Transfer Received", received: "2026-10-20 08:05",
    body: "Hi! You received PHP 6,000.00 via PESONet.\nTransfer From: WILLIAM SANTOS\nFrom Account: ****3302\nReference No.: DEMO-BI2010\nDate: Oct 20, 2026 08:05 AM" },
  { id: "msg-demo-c4d2", from: "notify@example-bank.test", to: "Bernie Santos <bernie.family@example.test>", subject: "Transfer Received", received: "2026-10-18 12:30",
    body: "Hi! You received PHP 1,500.00 via InstaPay.\nTransfer From: MARIA DELA CRUZ\nFrom Account: ****5566\nReference No.: DEMO-MD1810\nDate: Oct 18, 2026 12:30 PM" },
  { id: "msg-demo-77ab", from: "no-reply@example-wallet.test", to: "bernie.family@example.test", subject: "You have sent money", received: "2026-10-16 11:20",
    body: "You have sent PHP 300.00 to SARI-SARI STORE.\nRef. No. WLT-55100017" },
  { id: "msg-demo-be05", from: "notify@example-bank.test", to: "Bernie Santos <bernie.family@example.test>", subject: "Your October statement is ready", received: "2026-10-15 07:00",
    body: "Your e-statement for October is ready. Log in to view it. This is not a transfer." },
  { id: "msg-demo-0f77", from: "promo@example-shop.test", to: "subscribers@example-shop.test", subject: "Transfer Received? Big sale inside", received: "2026-10-14 10:00",
    body: "Huge discounts this weekend only!" },
];

/** ISO date (yyyy-mm-dd) an email was received, for the record it becomes. */
export const isoDate = (e: SampleEmail) => e.received.slice(0, 10);
