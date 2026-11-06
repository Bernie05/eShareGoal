// Every fixed value of the app, in one place. Safe in the browser and on the server: no secrets here, those stay in .env.local.
// Sample records, people and page text are not here: they live with their data (lib/demo-data.ts and friends) or their screen.

// ---------- Paths ----------
export const BASE_PATH = "/design-preview";
export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/signup";
export const PENDING_PATH = "/pending";
/** Where people land once signed in. */
export const AFTER_SIGN_IN = `${BASE_PATH}/dashboard`;
/** Password rules, and how sign-in slows down guessing. */
export const LOGIN_LIMITS = { passwordMin: 8, passwordMax: 128, maxFailures: 5, lockMinutes: 15 };
/** Sign-in methods the server's rules tell apart (auth.ts). */
export const AUTH_PROVIDER = { password: "password", google: "google" } as const;
export const DEFAULT_APP_URL = "http://localhost:3000";
export const GMAIL_API_PATH = "/api/gmail";

// ---------- Sample data the code refers to ----------
export const CAR_CREDIT = "car-credit";
/** Car Credit's setup key: group~goal. */
export const CAR_CREDIT_ENTRY = "family~car-credit";
/** Ids of an Owner's own workflows, so they never clash with the common ones. */
export const OWN_PREFIX = "wf-own-";
export const BABYLYN_EMAIL = "xlnem3sislx1@gmail.com";
export const BILLY_EMAIL = "xlnem3sislx2@gmail.com";
export const SAMPLE_INBOX = "xlnem3sislx1@gmail.com"; // the Gmail shown as connected until a real sign-in replaces it
export const SAMPLE_INBOX_SINCE = "2026-10-01";
export const ADMIN_EMAIL = "admin@example.com";
export const FIRST_MONTH = "2025-11"; // the first month Car Credit shares count from
export const RETIRED_DEMO_GROUP = "my-walking-club-demo"; // removed, but still saved in some browsers

// ---------- Region ----------
export const LOCALE = "en-PH";
export const ISO_DATE_LOCALE = "en-CA"; // formats dates as YYYY-MM-DD
export const TIME_ZONE = "Asia/Manila";
export const CURRENCY = "PHP";

// ---------- Cookies. Never rename these: saved data is read back by name ----------
export const ACCOUNT_COOKIE = "esg-account";
export const CREATED_GOALS_COOKIE = "esg-created-goals";
export const CREATED_GROUPS_COOKIE = "esg-created-groups";
export const DEV_AS_COOKIE = "esg-dev-as";
export const EMAIL_MODE_COOKIE = "esg-email-mode";
export const GMAIL_STATE_COOKIE = "esg-gmail-state";
export const GOAL_JOINS_COOKIE = "esg-goal-joins";
export const GOAL_REQUESTS_COOKIE = "esg-goal-requests";
export const GROUP_SETTINGS_COOKIE = "esg-group-settings";
export const RETIRED_COOKIE = "esg-retired-templates";
export const TEMPLATES_COOKIE = "esg-goal-templates";

// ---------- Browser storage. Never rename these either ----------
export const STORAGE = {
  customJobs: (entry: string) => `esg-custom-jobs:${entry}`,
  emailTemplates: "esg-email-templates",
  importReview: "esg-import-review",
  importRuns: "esg-import-runs",
  importWorkflows: "esg-import-workflows",
  loanTerms: (goalId: string) => `esg-loan-terms:${goalId}`,
  nudges: `esg-nudges:${CAR_CREDIT_ENTRY}`,
  ownerWorkflows: "esg-owner-workflows",
  records: (goalId: string) => `esg-records:${goalId}`,
  remindersRead: (account: string) => `esg-reminders-read:${account}`,
  submissions: (goalId: string) => `esg-submissions:${goalId}`,
  testEmails: "esg-test-emails",
  userCards: "esg-user-cards",
  txEdits: (goalId: string) => `esg-tx-edits:${goalId}`,
} as const;
export const STORAGE_EVENTS = {
  customJobs: "esg-custom-jobs-change",
  emailTemplates: "esg-email-templates-change",
  nudges: "esg-nudges-change",
  records: "esg-records-change",
  reminders: "esg-reminders-change",
} as const;

// ---------- Limits ----------
export const INVITE_DAYS = 7;
export const MAX_BODY = 20_000;
export const MAX_CREATED_GOALS = 8;
export const MAX_CREATED_GROUPS = 5;
export const MAX_DECIDED_SUBMISSIONS = 20;
export const MAX_EMAIL_TEMPLATES = 20;
export const MAX_GOAL_REQUESTS = 6;
export const MAX_IMAGES = 3;
export const MAX_MEMBERS = 50;
export const MAX_MESSAGE = 300;
export const MAX_PROOF_UPLOAD = 10 * 1024 * 1024; // what a Member may pick; it is shrunk before saving
export const MAX_TEMPLATES = 6;
export const TEST_EMAIL_LIMIT = 20;
export const WORKFLOW_LIMITS = { condValue: 80, workflows: 20, groups: 5, conds: 12, fields: 15, pattern: 200, body: 10_000, jobs: 8, rules: 10 };

// ---------- Timing ----------
export const REMIND_DAYS = 10;
export const STEP_MS = 450; // Test connection shows one step at a time
export const GMAIL_STATE_SECONDS = 600; // how long a Gmail sign-in may take
export const KNOWN_CARDS_DONE = "esg-user-cards-known-1"; // this browser already has KNOWN_CARDS
export const MAX_USER_CARDS = 10; // transfer cards per person
export const MAX_STORED_CARDS = 500; // transfer cards kept in this browser (preview)
export const GMAIL_ACCOUNT_LIMIT = 5; // linked inboxes the Gmail link dialog suggests
export const GMAIL_IMPORT_NOTE = "Gmail import";
/** Largest single imported payment, in centavos: the same ceiling as a record typed by hand. */
export const IMPORT_AMOUNT_MAX = 100_000_000_000;
/** How often an open page checks for new payments to approve. */
export const IMPORT_REVIEW_POLL_MS = 60_000;
/** How many payments the review queue shows, newest first. */
export const REVIEW_LIST_MAX = 200;
/** How long the screens reuse the records loaded from the server before asking again. */
export const IMPORTED_RECORDS_TTL_MS = 30_000;
export const GMAIL_IMPORT_MAX = 50;
/** How far Test on Gmail looks back when a job's filter has no limit. */
export const GMAIL_TEST_DAYS = 30;
/** More new text than this at once counts as pasting a sample email, which sets the job up from it. */
export const SAMPLE_PASTE_MIN = 20; // newest emails one import job run reads
export const GMAIL_READ_BATCH = 10; // emails fetched from Google at once
export const GMAIL_SPARE_GROUP = "dev"; // development only: holds saved access no goal uses, so an inbox links again without Google
export const GMAIL_SIM_MS = 700; // how long the simulated Gmail sign-in pretends to take
export const GOOGLE_TIMEOUT_MS = 10_000;

// ---------- Outside services ----------
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const RESEND_API_URL = "https://api.resend.com/emails";
