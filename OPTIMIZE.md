# OPTIMIZE: eShareGoal, whole codebase

Phase 1 plan, 2026-11-06. No code changed. Focus: all. Ponytail: full.
To apply: `/fs:optimize apply O-7 O-9 …`. Rows with `Behavior change: y` run only when named.

**The tree moved during this audit.** Another worker added email and password sign-in at about 17:30 (`app/sign-in`, `app/pending`, `lib/server/accounts.ts`, `app/actions/auth.ts`, `drizzle/0005`, a working Sign out, `requireViewer` on the pages). The rows and line numbers use the tree as it stood at about 17:35. The sign-in code itself was not audited. The bundle and query numbers come from a scratch copy taken before those edits.

## Measurements
All taken in a scratch copy. The dev server on :3000 and `.data/dev` were not touched.

| What | Result | How |
|---|---|---|
| Client JS on any `/design-preview/[screen]` | **9 chunks, 1,114 KB raw, 335 KB gzip** | Client reference manifest, gzip of each chunk |
| Same for `/signup`; for `/` | 223 KB / 75 KB; 183 KB / 60 KB | Same |
| Largest chunk | 696 KB raw, 197 KB gzip: holds recharts and the screens together | Same |
| One review poll, `goalImported` | 6 queries, plus 1 for the viewer = **7 per poll** | Drizzle logger, in-memory PGlite, seed data |
| Poll payload | Seed: 307 B. 1 year (36 records, 12 queued): 12.3 KB. 5 years (180, 60): **60.9 KB**. 1,000 records: 298.7 KB | `JSON.stringify` of the result |
| Query time at 1,000 records | 149 ms in total; 8 ms for the `knownKeys` records query (uses `record_goal_idx`) | `performance.now`, `EXPLAIN ANALYZE` |
| Payload a Member receives at 1,000 records | 1,000 records, 2,417 keys, 242.9 KB | Called as seed-billy |
| Polling timers on `/loan` as Owner | **3**: sidebar badge, bell, goal card (4 with the mobile sheet open) | Code reading, not a browser count |

Caveats: `next build` could not fetch Google Fonts from the sandbox and reported an error, but it emitted all chunks, so treat sizes as close rather than exact. The scan for unused exports used a local script, because the one-off `knip` run was refused.

Three timers × 7 queries is 21 queries a minute per open Owner tab. Query time is not the problem at this size. The cost is that traffic never stops: a tab left open keeps Neon's compute from scaling to zero, and each poll is a Vercel invocation.

## Ranked plan
Impact and Risk: H, M, L. Effort: S under 2 hours, M about a day, L several days. Security rows (`flag`) come first and go to `/fs:security`; the rest are ranked by impact ÷ effort.

| O-# | Lens | file:line | Finding | Fix | Impact | Effort | Risk | Behavior change (y/n) | Status |
|---|---|---|---|---|---|---|---|---|---|
| O-1 | flag | `app/api/gmail/connect/route.ts:14`, `lib/server/gmail.ts:86` | Any active account can link its own inbox to any goal. `finishGmailSignIn` overwrites the connection with no Owner check, so the timer then reads that inbox and can add invented payments | `/fs:security`: check the goal's Owner in connect and again in the callback | H | S | L | y | done |
| O-2 | flag | `app/actions/gmail.ts:19`, `lib/server/gmail.ts:133` | `gmailDisconnectAction` has no role check. Any active account can cut a goal's inbox and revoke its access at Google | `/fs:security`: Owner check inside `disconnectGmail` | H | S | L | y | done |
| O-3 | flag | `app/actions/gmail.ts:11`, `lib/server/gmail.ts:230` | `gmailTestAction` passes no viewer. Any active account can read the inbox address plus sender and subject of its latest 5 emails, and trigger the confirmation email | `/fs:security`: same check as O-2 | H | S | L | y | done |
| O-4 | flag | `lib/server/import-review.ts:129`, `lib/server/import-setup.ts:51`, `lib/server/gmail.ts:104` | `goalImported` and `goalJobs` use the group role, not `canViewGoal`. Any group member, even one outside the goal, receives every member's payments, which contradicts the rule at `components/screens/screens.tsx:233-234`. `gmailStatus` returns the address of any goal | `/fs:security`: use `canViewGoal`, and send a Member only their own records | H | S | M | y | done |
| O-5 | flag | `next.config.ts:3` | No security headers or CSP, and no `proxy.ts` (one sits in `archive/backend-ui/`) | `/fs:security` | M | S | M | y | flag |
| O-6 | flag | `lib/constants.ts:22-24` | `BABYLYN_EMAIL`, `BILLY_EMAIL` and `SAMPLE_INBOX` look like real Gmail addresses and were found in 2 client chunks | `/fs:security`: swap for `example.com` in sample data | L | S | L | y | flag |
| O-7 | perf | `components/app/import-review.tsx:50-53` | Every `useReviewQueue` mount starts its own 60s timer: 3 identical requests a minute on `/loan` (5 call sites) | Move one timer into `imported-records.ts`, started by the first subscriber and stopped by the last | H | S | L | n | done |
| O-8 | perf | `components/app/import-review.tsx:50`, `:161-163` | Polling also runs in hidden tabs and for Members, who have no queue (`PendingImportsCard` calls the hook before its `owner` check) | Poll only for an Owner and only while visible; refresh once on `visibilitychange` | H | S | L | y | |
| O-9 | perf | `lib/server/import-review.ts:137`, `:131-138` | Each poll re-sends all records and all keys. `keys` is read only by Run now (`import-jobs.tsx:312`). Deleted rows are fetched, then filtered in JS | Poll a queue-only action; fetch `keys` when a run starts; put `isNull(deletedAt)` in the SQL. Should drop 7 queries to 4 | H | S | L | n | done in part: `keys` and `isNull(deletedAt)` only. The poll keeps `records`, because open screens read them from it, so Owner queries went 8 to 6, not to 4 |
| O-10 | perf | `app/design-preview/[screen]/` | No `loading.tsx`. Per the Next docs (`prefetching.md`), a dynamic route without one is not prefetched, so each click waits on a full server render with no feedback | Add `loading.tsx` using the existing `LoadingState` | M | S | L | y | |
| O-11 | robustness | `app/` | No `error.tsx` anywhere. `getGroupSettings` (`lib/view-as-server.ts:67`) touches the DB, so a DB failure takes down screens that are otherwise sample data | Add `app/design-preview/error.tsx` using the existing `ErrorState` | M | S | L | y | |
| O-12 | robustness | `lib/server/import-review.ts:94-108` | `decideReview` checks status, then writes in separate steps with no transaction. A stale Reject can overwrite a Confirm and leave the record behind | One transaction, `update … where status = expected returning`, with `addImported` taking `tx` | H | S | M | n | done |
| O-13 | robustness | `lib/server/core.ts:47` | Resend `fetch` has no timeout, unlike `google()`. A hang stalls the overdue job, sign-up and invites | `AbortSignal.timeout(MAIL_TIMEOUT_MS)`, constant in `lib/constants.ts` | M | S | L | y | |
| O-14 | robustness | `components/app/imported-records.ts:31` | A failed refresh deletes good cached data, so Car Credit totals silently drop to sample-only on next render | Keep the previous data; only clear the `at` timestamp | M | S | L | y | |
| O-15 | best practice | `lib/db/index.ts:21` | Neon `Pool` has no `error` listener and no connection timeout, so a dropped idle socket can crash the process and a cold start can hang. No `engines` field, though the driver needs Node 22+ for a global `WebSocket` | Add `pool.on("error", …)`, `connectionTimeoutMillis`, `engines` | M | S | L | n | |
| O-16 | structure | `app/actions/dev.ts:12`, `components/app/view-as.tsx:67` | `viewAsAction` has no callers, so the View as switch never changes the server's viewer. That is why `!devBypass &&` skips roles at 5 sites (`import-review.ts:88,130`, `import-setup.ts:45,56`, `app/actions/jobs.ts:10`) | Make the switch call `viewAsAction`, then remove the 5 skips, so dev exercises real permissions | M | S | M | y (dev only) | |
| O-17 | structure | `lib/server/import-review.ts:126-130`, `lib/server/import-setup.ts:39-46`, `:52-56` | The same "entry → goal → role" lookup is written 3 times, which is how O-4 slipped in | One `timerGoalAccess(viewer, entry)` in `dal.ts`; apply with O-4 | M | S | M | n | done |
| O-18 | structure | `lib/server/import-setup.ts:5`, `lib/view-as-server.ts:10` | Production code imports `lib/db/seed.ts` for ids, loading the fictional people. Seed never runs in production, so Neon has no Car Credit goal: the timer does nothing and every real user is `guest` (`view-as-server.ts:23`) | Move the ids to `lib/constants.ts` now; decide how the first real goal is created (see O-29) | M | S | L | n | |
| O-19 | maintainability | `lib/server/imports.ts:25`, `lib/server/overdue.ts:36`, `lib/server/gmail.ts:148,259`, `components/app/view-as.tsx:67,87,147,148`, `components/app/reminders.tsx:24`, `app/actions/dev.ts:17` | House rule: inline `"sv-SE"` (an `ISO_DATE_LOCALE` exists), `3800`, the cookie max-age in 4 places, `"family"` at 6+ sites, `maxResults: "5"` | Add `MAX_COOKIE_CHARS`, `COOKIE_MAX_AGE`, `FAMILY_GROUP`, `GMAIL_TEST_EMAILS` | L | S | L | n | |
| O-20 | over-engineering | `components/ui/select.tsx`, `separator.tsx`, `progress.tsx`, `components/screens/notifications.tsx:54`, `components/app/workflow-store.ts:28-33`, `lib/import-workflows.ts:348`, `lib/server/dev.ts:26`, `lib/server/dal.ts:60`, `lib/screens.ts:29`, `lib/db/schema.ts:218-224` | No callers: 3 UI files (about 250 lines), `unreadIn`, the test-email store, `maskPrivate`, `devPeople`, `canViewGroup`, `ScreenSlug`, and 7 relations (0 uses of `db.query`) | **Archive to `archive/` first**, then delete. Skip `devPeople` if O-16 uses it. Drop `STORAGE.testEmails` and `TEST_EMAIL_LIMIT` too | L | S | L | n | |
| O-21 | over-engineering | `components/app/import-review.tsx:32-41`, `lib/constants.ts:28`, `components/app/card-editor.tsx:16-22` | One-time browser migrations (`handOver`, `RETIRED_DEMO_GROUP`, `KNOWN_CARDS`). `handOver` is checked from every mounted hook | Confirm each browser has migrated, **archive to `archive/` first**, delete | L | S | L | n | |
| O-22 | best practice | `app/design-preview/layout.tsx:6`, `lib/constants.ts:5`, `app/page.tsx:5` | Now that pages require sign-in, `/design-preview` is the real app, still titled "Design preview" and marked noindex | Rename via `BASE_PATH` and move the folder | L | S | M | y (URLs) | |
| O-23 | perf | `app/design-preview/[screen]/page.tsx` | One page imports all 18 screens and recharts, so every screen loads 1,114 KB against 183 KB for `/` | `next/dynamic` per screen in the `switch`, chart components first. No redesign. Re-measure with the same script | H | M | M | y (brief loading on first open) | |
| O-24 | robustness | `components/app/view-as.tsx:145-149` | Each cookie is capped at 3,800 characters, but nothing caps the total. Seven `writeCookie` stores can reach 26 KB, past Node's 16 KB header limit, returning 431 on every request until cookies are cleared. `esg-group-settings` fills fastest | Store group settings in the DB (`import_setup`, new key), behind an Owner check; add a total budget to `writeCookie` | M | M | M | y | |
| O-25 | robustness | `lib/server/goals.ts:36-219` (9), `lib/server/groups.ts:95-242` (7), `lib/server/gmail.ts:95,120,138`, `lib/server/admin.ts:43,70`, `lib/server/import-review.ts:40,102` | Write and `audit()` run in separate steps at 23 sites, so a failed audit leaves a change with no trail | Helper that runs both in one transaction (`audit` already takes `tx`) | M | M | M | n | |
| O-26 | robustness | `lib/server/imports.ts:39`, `app/api/jobs/gmail-import/route.ts`, `app/api/jobs/overdue/route.ts` | A non-`UserError` in one job aborts the remaining jobs and the report. No `maxDuration` on either cron route, though a run can read 50 emails | Per-job try/catch reporting `skipped`, and an explicit `maxDuration` | M | S | L | y | |
| O-27 | best practice | `components/app/imported-records.ts:17`, `components/screens/import-jobs.tsx:306` | Reads use a Server Action. Next dispatches these one at a time per client (`server-actions.md`), so a slow Gmail read queues Confirm clicks and polls, and the `Promise.all` here runs in series | Move the read to a GET Route Handler; keep actions for writes. Do after O-7 and O-9 | M | M | L | n | |
| O-28 | robustness | `lib/demo-data.ts:7` | `TODAY` is fixed at module load, so a tab or warm server left past midnight shows wrong due dates and reminders. 36 uses in `app` and `components` | Change to a `today()` function | M | M | L | y | |
| O-29 | data integrity | `components/screens/transaction-form.tsx:116`, `components/app/approvals.tsx:86`, `components/app/car-credit.ts:45-53`, `components/app/loan-details.tsx:79`, `lib/server/overdue.ts:46` | Manual records, approved submissions, edits and loan terms stay in one browser, but the overdue check reads the DB. **A payment an Owner approved in the app is invisible to it, so the Member can get a false overdue email.** Other Owners never see it either. Covers the "edits and deletes of imported transactions" limit | Wire to the 28 existing actions (0 callers today; `archive/backend-ui/` has DB-backed screens to reuse). Keep the screens as they are. Start with edit and delete of imported records, then records, then submissions (receipt images need storage), then terms → `goal_member.share` | H | L | H | y | |
| O-30 | robustness | `lib/server/goals.ts:86` | `getGoal` totals come from `limit(1000)` rows, so totals go wrong past 1,000 records | SQL aggregates, before O-29 wires it up | L | S | L | n | |
| O-31 | patterns | `components/app/custom-jobs.ts`, `nudges.ts`, `email-store.ts`, `reminders.tsx:93-98`, `records.tsx` | Five hand-written localStorage stores repeat `listStore` in `local-list.ts` | Reuse `listStore` for what remains after O-29 | L | M | M | n | |
| O-32 | robustness | `lib/server/overdue.ts:48`, `lib/db/schema.ts:210` | `noticed` loads every notice for a goal with no suitable index (seq scan). `import_review.status` is free text while every other status is an enum | Add `(goal_id, action)` index and a status enum or CHECK. Reversible migration | L | S | L | n | |
| O-33 | maintainability | `lib/server/admin.ts:62`, `lib/server/imports.ts:24`, `app/api/jobs/gmail-import/route.ts:7` | With JWT sessions, deleting `session` rows does nothing, though the comment says it signs people out (the real guard is `getViewer` reading status). "Dry run writes nothing" is untrue: `gmail.ts:204` still writes a `gmail.read` audit row | Remove the delete and update its test; correct the comment or skip that audit row when dry | L | S | L | n | |
| O-34 | maintainability | `components/screens/goal-page.tsx`, `import-jobs.tsx`, `app/design-preview/[screen]/page.tsx` | 555 and 487 lines with 59 and 34 lines over 200 characters (longest 596); an 18-case `switch` | Split only when next changed for another reason. O-23 will shrink the `switch` | L | M | M | n | |
| O-35 | maintainability | `lib/server/import-setup.ts:15`, `lib/server/import-review.ts`, `components/app/import-review.tsx:21` | Car Credit is special-cased throughout (`TIMER_GOALS`, `CAR_CREDIT_ENTRY`, `isServer`) | Replace with real goal ids as part of O-29. Not worth doing alone | M | L | H | y | |

## Suggested order
1. **Security first:** O-1 to O-4, with O-17, through `/fs:security`.
2. **Quick wins, no behavior change:** O-7, O-9, O-12, O-15, O-18.
3. **Small and visible:** O-8, O-10, O-11, O-13, O-14, O-16.
4. **Separate decisions:** O-23 (biggest perf gain) and O-29 (biggest data risk; needs a plan of its own).

## Known limits, where each one landed
| Limit | Result |
|---|---|
| Car Credit only server-backed goal | O-18, O-29, O-35 |
| Screens mix sample data and browser storage | O-29 |
| Edits and deletes of imported records are browser-only | O-29, first step |
| Sign out does nothing | **Fixed by the in-flight work** (`components/app/shell.tsx:281`), hidden while the dev toggle is on |
| Bell ignores "New import candidates" | Not an optimize item: `ApprovalsBell` never reads `notify.imports` (`components/app/approvals.tsx:270`). Small product fix. Confirm the intent before changing it |
| `devBypass` skips role checks | O-16, O-17 |
| `dry` cron route | Keep: tests depend on it (`scripts/test-backend.ts:348`). Fix the comment, O-33 |
| 3,800-character cookie cap | O-24 |
| `useImported` polling | Confirmed: O-7, O-8, O-9 |

## Looked at and left alone
- **Cache Components and `use cache`:** every page is per-user and cookie-driven, so there is little to cache. Adopting it would require `partialPrefetching` and a migration.
- **More caching (Redis, CDN), queues:** query time is 149 ms at 1,000 records. Cutting the requests is enough.
- **`db` Proxy and `ensureDb`:** odd but justified by PGlite's async start.
- **Overdue N+1 (3 queries per loan), sequential imports, `revokeUser` loop:** few rows, daily job. Revisit past about 20 loan goals.
- **`lib/server/{goals,groups,admin}.ts`:** no screen calls them yet, but they are tested and O-29 needs them. Do not delete.
- **Extra indexes on foreign keys:** no table is big enough. Revisit around 10,000 rows.
- **`shadcn` as a dependency:** looks like a dev tool, but `app/globals.css:3` imports its CSS.
- **`components/ui/chart.tsx:83` inline type:** vendored shadcn code.

## Archive note
`archive/` is git-ignored, so archived files are not in git history either. Back it up separately if you want it kept. Only the three `components/ui` files in O-20 are committed and unmodified.
