// Backend rule tests on an embedded Postgres (PGlite): no Neon, no sign-in needed. Applies the real migrations, plugs the
// database into lib/db (globalThis.__esgDb), then calls the services the app uses, as different people.
// Run: npm run test:backend
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, like } from "drizzle-orm";
import * as schema from "../lib/db/schema";

// "server-only" refuses to load outside Next's server build; in this script everything is server side, so stub it.
const req = Module.createRequire(__filename);
req.cache[req.resolve("server-only")] = { exports: {} } as NodeJS.Module;

let passed = 0, failed = 0;
const ok = (name: string, cond: unknown) => { if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); } };
async function throws(name: string, fn: () => Promise<unknown>, match: RegExp) {
  try { await fn(); failed++; console.error(`  ✗ ${name}: did not fail`); }
  catch (e) { const m = (e as Error).message; if (match.test(m)) passed++; else { failed++; console.error(`  ✗ ${name}: wrong error "${m}"`); } }
}

async function main() {
  const pg = new PGlite();
  const testDb = drizzle(pg, { schema });
  await migrate(testDb, { migrationsFolder: "drizzle" });
  (globalThis as { __esgDb?: unknown }).__esgDb = testDb;

  const groupsSvc = await import("../lib/server/groups");
  const goalsSvc = await import("../lib/server/goals");
  const admin = await import("../lib/server/admin");
  const { users, groupInvites, sessions } = schema;

  // People: three users, a System Admin, one waiting for review.
  const person = (id: string, name: string, extra: Partial<typeof users.$inferInsert> = {}) => ({ id, name, email: `${id}@example.com`, status: "active" as const, ...extra });
  await testDb.insert(users).values([person("bernz", "Bernz"), person("babylyn", "Babylyn"), person("billy", "Billy"), person("admin", "Site Admin", { siteRole: "admin" }), person("nico", "Nico", { status: "pending_review" })]);
  const V = (id: string, name: string, siteRole: "admin" | "user" = "user") => ({ id, name, email: `${id}@example.com`, siteRole, status: "active" as const });
  const bernz = V("bernz", "Bernz"), babylyn = V("babylyn", "Babylyn"), billy = V("billy", "Billy"), sa = V("admin", "Site Admin", "admin");

  console.log("Groups");
  const family = await groupsSvc.createGroup(bernz, { name: "Family", description: "Santos family" });
  ok("creator is Owner", (await groupsSvc.getGroup(bernz, family))?.role === "owner");
  await throws("System Admin cannot create groups", () => groupsSvc.createGroup(sa, { name: "Admins" }), /do not create groups/);
  await throws("duplicate group name", () => groupsSvc.createGroup(bernz, { name: "family" }), /already have a group/);
  await throws("short name", () => groupsSvc.createGroup(bernz, { name: "ab" }), /at least 3/);
  ok("non-member sees nothing", (await groupsSvc.getGroup(babylyn, family)) === null);
  ok("System Admin sees it, view only", (await groupsSvc.getGroup(sa, family))?.role === "admin");

  console.log("Goals");
  const car = await goalsSvc.createGoal(bernz, family, { name: "Car Credit", kind: "loan", measure: "money", target: 1_200_000 });
  const fit = await goalsSvc.createGoal(bernz, family, { name: "Fitness", kind: "fitness", measure: "count", scope: "each", target: 20 });
  await throws("System Admin cannot add goals", () => goalsSvc.createGoal(sa, family, { name: "X goal", kind: "custom", measure: "count" }), /Only an Owner/);

  console.log("Invitations");
  const r1 = await groupsSvc.inviteToGroup(bernz, { groupId: family, userIds: ["babylyn"] });
  const r2 = await groupsSvc.inviteToGroup(bernz, { groupId: family, emails: ["BILLY@example.com"], goalIds: [car] });
  ok("invited by user and by email", r1.invited[0] === "babylyn@example.com" && r2.invited[0] === "billy@example.com");
  const again = await groupsSvc.inviteToGroup(bernz, { groupId: family, emails: ["bernz@example.com"] });
  ok("members are skipped", again.skipped[0]?.why === "already a member");
  await throws("Members cannot invite", () => groupsSvc.inviteToGroup(babylyn, { groupId: family, emails: ["x@example.com"] }), /Only an Owner/);
  await throws("empty goal list", () => groupsSvc.inviteToGroup(bernz, { groupId: family, emails: ["z@example.com"], goalIds: [] }), /at least one goal/);
  const babInv = await groupsSvc.myInvitations(babylyn);
  ok("invitee sees the invitation", babInv.length === 1 && babInv[0].groupName === "Family" && babInv[0].goalNames === null && babInv[0].daysLeft === 7);
  await groupsSvc.respondToInvite(babylyn, babInv[0].id, true);
  await throws("cannot accept twice", () => groupsSvc.respondToInvite(babylyn, babInv[0].id, true), /no longer open/);
  const billyInv = await groupsSvc.myInvitations(billy);
  ok("goal-only invitation lists its goals", billyInv[0].goalNames?.join() === "Car Credit");
  await throws("someone else's invitation", () => groupsSvc.respondToInvite(babylyn, billyInv[0].id, true), /no longer open/);
  await groupsSvc.respondToInvite(billy, billyInv[0].id, true);

  const asBab = await groupsSvc.getGroup(babylyn, family);
  ok("member of the whole group sees every goal", asBab?.role === "member" && asBab.goals.length === 2);
  ok("members do not see others' emails", asBab?.members.filter((m) => !m.you).every((m) => m.email === null) && asBab.invites.length === 0);
  const asBilly = await groupsSvc.getGroup(billy, family);
  ok("goal-only member sees only that goal", asBilly?.goals.map((g) => g.name).join() === "Car Credit");
  ok("goal-only member cannot open other goals", (await goalsSvc.getGoal(billy, fit)) === null);

  // An invitation older than 7 days cannot be accepted.
  await groupsSvc.inviteToGroup(bernz, { groupId: family, emails: ["late@example.com"] });
  await testDb.update(groupInvites).set({ sentAt: new Date(Date.now() - 8 * 86_400_000) });
  await testDb.insert(users).values(person("late", "Late"));
  const lateInv = await groupsSvc.myInvitations(V("late", "Late"));
  ok("old invitation shows as expired", lateInv[0]?.expired === true);
  await throws("expired invitation", () => groupsSvc.respondToInvite(V("late", "Late"), lateInv[0].id, true), /expired/);
  await groupsSvc.resendInvite(bernz, lateInv[0].id);
  ok("resend renews it", (await groupsSvc.myInvitations(V("late", "Late")))[0]?.expired === false);

  console.log("Goal join requests");
  await goalsSvc.requestToJoinGoal(billy, fit);
  await throws("asking twice", () => goalsSvc.requestToJoinGoal(billy, fit), /already asked/);
  await throws("already in the goal", () => goalsSvc.requestToJoinGoal(babylyn, fit), /already take part/);
  const reqs = await goalsSvc.listJoinRequests(bernz, family);
  ok("Owner sees the request", reqs.length === 1 && reqs[0].goalName === "Fitness");
  await throws("Members cannot approve", () => goalsSvc.decideJoinRequest(babylyn, reqs[0].id, true), /Only an Owner/);
  await goalsSvc.decideJoinRequest(bernz, reqs[0].id, true);
  ok("approved member opens the goal", (await goalsSvc.getGoal(billy, fit)) !== null);

  console.log("Records");
  const rec = await goalsSvc.addRecord(bernz, car, { memberId: "billy", day: "2026-10-20", amount: 6000, direction: "in", ref: "DEMO-1", method: "Bank transfer" });
  await throws("duplicate bank reference", () => goalsSvc.addRecord(bernz, car, { memberId: "billy", day: "2026-10-21", amount: 1, direction: "in", ref: "DEMO-1" }), /already in this goal/);
  await throws("Members cannot add records", () => goalsSvc.addRecord(babylyn, car, { day: "2026-10-20", amount: 5, direction: "in" }), /Only an Owner/);
  await throws("money needs a direction", () => goalsSvc.addRecord(bernz, car, { day: "2026-10-20", amount: 5 }), /money in or money out/);
  await throws("record for an outsider", () => goalsSvc.addRecord(bernz, car, { memberId: "late", day: "2026-10-20", amount: 5, direction: "in" }), /does not take part/);
  await goalsSvc.addRecord(bernz, car, { memberId: "babylyn", day: "2026-10-22", amount: 8000, direction: "in", ref: "DEMO-2" });
  let goal = await goalsSvc.getGoal(babylyn, car);
  ok("totals in centavos", goal?.totals.net === 1_400_000 && goal.participants.find((p) => p.userId === "billy")?.total === 600_000);
  ok("progress against the target", goal?.totals.progress === 1);
  await goalsSvc.updateRecord(bernz, rec, { amount: 7000 });
  await goalsSvc.deleteRecord(bernz, rec);
  goal = await goalsSvc.getGoal(bernz, car);
  ok("deleted records leave the totals", goal?.totals.net === 800_000 && goal.records.length === 1);
  await goalsSvc.addRecord(bernz, fit, { memberId: "babylyn", day: "2026-10-22", amount: 10 });
  ok("each-goal progress is the members' average", (await goalsSvc.getGoal(bernz, fit))?.totals.progress === Math.round((50 + 0 + 0) / 3));
  await goalsSvc.setShare(bernz, car, "billy", 4000);
  ok("share saved in centavos", (await goalsSvc.getGoal(bernz, car))?.participants.find((p) => p.userId === "billy")?.share === 400_000);

  console.log("Members");
  await groupsSvc.setMemberGoals(bernz, family, "billy", null);
  ok("whole group again", (await groupsSvc.getGroup(billy, family))?.goals.length === 2);
  await throws("Members cannot remove", () => groupsSvc.removeMember(babylyn, family, "billy"), /Only an Owner/);
  await throws("creator cannot be removed", () => groupsSvc.removeMember(bernz, family, "bernz"), /Use Leave group|cannot be removed/);
  await throws("only the creator changes roles", () => groupsSvc.setMemberRole(babylyn, family, "billy", "owner"), /Only the creator/);
  await groupsSvc.setMemberRole(bernz, family, "babylyn", "owner");
  await throws("a non-creator Owner cannot remove an Owner", () => groupsSvc.removeMember(babylyn, family, "bernz"), /cannot be removed|Only the creator/);
  await groupsSvc.removeMember(bernz, family, "billy");
  ok("removed member loses access", (await groupsSvc.getGroup(billy, family)) === null && (await goalsSvc.getGoal(billy, car)) === null);
  ok("their records stay", (await goalsSvc.getGoal(bernz, car))?.records.length === 1);
  await throws("creator cannot leave", () => groupsSvc.leaveGroup(bernz, family), /cannot leave/);
  await throws("only the creator deletes", () => groupsSvc.deleteGroup(babylyn, family), /Only the person who created/);
  const found = await groupsSvc.searchPeople(bernz, family, "bi");
  ok("people search hides emails", found[0]?.name === "Billy" && found[0].email === "bi•••@example.com" && found[0].state === null);
  await throws("search needs 2 characters", () => groupsSvc.searchPeople(bernz, family, "b"), /at least 2/);

  console.log("System Admin");
  await throws("users cannot use admin tools", () => admin.listUsers(bernz), /Only a System Admin/);
  ok("lists every account", (await admin.listUsers(sa)).length === 6);
  await throws("reject needs a reason", () => admin.reviewUser(sa, "nico", false), /Say why/);
  await admin.reviewUser(sa, "nico", true);
  await groupsSvc.createGroup(bernz, { name: "Solo trip" }); // Bernz is its only Owner
  await throws("only Owner cannot be revoked", () => admin.revokeUser(sa, "bernz", "test"), /only Owner of Solo trip/);
  await testDb.insert(sessions).values({ sessionToken: "t1", userId: "billy", expires: new Date(Date.now() + 86_400_000) });
  await admin.revokeUser(sa, "billy", "Shared their account");
  ok("revoking signs them out", (await testDb.select().from(sessions)).length === 0);
  const m = await admin.adminMetrics(sa);
  ok("dashboard numbers", m.users.active === 4 && m.users.pending === 0 && m.users.revoked === 1 && m.groups === 2 && m.goals.total === 2 && m.records.moneyIn === 800_000);

  // ---------- Overdue check: the real query and rules; only the email service is faked ----------
  const overdue = await import("../lib/server/overdue");
  const { goals: goalsT, goalMembers: gm, records: recT, auditLog: logT } = schema;
  ok("no notice until the due date has passed", overdue.latestDue("2025-11-05", "2026-11-05")?.due === "2026-10-05" && overdue.latestDue("2025-11-05", "2026-11-06")?.due === "2026-11-05");
  ok("a loan's first due date has to pass first", overdue.latestDue("2026-11-05", "2026-11-20") === null);
  ok("a day 31 loan falls on the month's last day", overdue.latestDue("2026-01-31", "2026-03-05")?.due === "2026-02-28");
  ok("January looks back to December", overdue.latestDue("2025-01-05", "2026-01-02")?.due === "2025-12-05");
  const [{ status: billyWas }] = await testDb.select({ status: users.status }).from(users).where(eq(users.id, "billy"));
  await testDb.update(users).set({ status: "active" }).where(eq(users.id, "billy"));
  const [loan] = await testDb.insert(goalsT).values({ groupId: family, name: "Overdue Loan", kind: "loan", measure: "money", startsOn: "2025-11-05", createdBy: "bernz" }).returning();
  await testDb.insert(gm).values([{ goalId: loan.id, userId: "bernz", share: 100_00 }, { goalId: loan.id, userId: "babylyn", share: 60_00 }, { goalId: loan.id, userId: "billy", share: 40_00 }]);
  const pay = (memberId: string, day: string, amount: number) => ({ goalId: loan.id, memberId, day, amount, direction: "in" as const, kind: "deposit", createdBy: "bernz" });
  await testDb.insert(recT).values([pay("bernz", "2026-10-03", 100_00), pay("babylyn", "2026-10-03", 30_00), pay("billy", "2026-09-02", 40_00)]);
  const TODAY = "2026-11-05";
  const quiet = await overdue.runOverdueCheck(TODAY);
  const owes = (r: typeof quiet, who: string) => r.lines.find((l) => l.goal === "Overdue Loan" && l.member === who);
  ok("whoever paid in full is not notified", !owes(quiet, "Bernz"));
  ok("a part payment owes the rest", owes(quiet, "Babylyn")?.amount === 30_00);
  ok("last month's payment does not cover this one", owes(quiet, "Billy")?.amount === 40_00);
  ok("no email service: reported, not counted as sent", owes(quiet, "Billy")?.delivery === "not-sent" && (await testDb.select().from(logT).where(eq(logT.action, "overdue.notice"))).length === 0);
  Object.assign(process.env, { AUTH_RESEND_KEY: "re_test", AUTH_EMAIL_FROM: "eShareGoal <no-reply@example.com>" });
  const outbox: { to: string; subject: string; text: string }[] = [];
  const beforeMail = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => { if (String(u).includes("resend.com")) { outbox.push(JSON.parse(String(init?.body))); return new Response("{}"); } return beforeMail(u, init); }) as typeof fetch;
  await overdue.runOverdueCheck(TODAY);
  const toBilly = outbox.find((m) => m.to === "billy@example.com");
  ok("the email reaches who has not paid, and says what is owed", !!toBilly && outbox.every((m) => m.to !== "bernz@example.com") && /October 2026/.test(toBilly.subject) && toBilly.text.includes("₱40.00") && toBilly.text.includes("Hi Billy") && !toBilly.text.includes("{{"));
  const sentOnce = outbox.length;
  const again2 = await overdue.runOverdueCheck(TODAY);
  ok("running again sends nothing twice", outbox.length === sentOnce && owes(again2, "Billy")?.delivery === "already");
  await testDb.insert(recT).values(pay("billy", "2026-11-02", 40_00));
  ok("a late payment clears it", !owes(await overdue.runOverdueCheck(TODAY), "Billy"));

  // Test mode: everything comes to one address, says who it was for, and uses up nobody's notice.
  const NEXT = "2026-12-06";
  process.env.MAIL_TEST_TO = "me@example.com";
  outbox.length = 0;
  const trial = await overdue.runOverdueCheck(NEXT);
  ok("in test mode every email comes to the test address", outbox.length > 0 && outbox.every((m) => m.to === "me@example.com" && m.subject.startsWith("[Test]")));
  ok("and says who it was for", outbox.some((m) => m.text.includes("would have gone to billy@example.com")));
  ok("the run reports it as a test", owes(trial, "Billy")?.delivery === "test");
  const count = outbox.length;
  await overdue.runOverdueCheck(NEXT);
  ok("a test can be repeated", outbox.length === count * 2);
  process.env.VERCEL_ENV = "production";
  outbox.length = 0;
  await overdue.runOverdueCheck(NEXT);
  ok("production ignores the test address", outbox.some((m) => m.to === "billy@example.com") && !outbox.some((m) => m.to === "me@example.com"));
  delete process.env.VERCEL_ENV; delete process.env.MAIL_TEST_TO;
  await testDb.insert(recT).values({ ...pay("babylyn", "2026-11-02", 30_00), deletedAt: new Date() });
  ok("a deleted payment does not count", owes(await overdue.runOverdueCheck(TODAY), "Babylyn")?.amount === 30_00);
  await testDb.update(users).set({ status: "revoked" }).where(eq(users.id, "babylyn"));
  ok("a revoked member gets no notice", !owes(await overdue.runOverdueCheck(TODAY), "Babylyn"));
  await testDb.update(users).set({ status: "active" }).where(eq(users.id, "babylyn"));
  ok("a paused loan is skipped", await testDb.update(goalsT).set({ status: "paused" }).where(eq(goalsT.id, loan.id)).then(async () => !(await overdue.runOverdueCheck(TODAY)).lines.some((l) => l.goal === "Overdue Loan")));
  globalThis.fetch = beforeMail;
  delete process.env.AUTH_RESEND_KEY; delete process.env.AUTH_EMAIL_FROM;
  await testDb.delete(goalsT).where(eq(goalsT.id, loan.id));
  await testDb.update(users).set({ status: billyWas }).where(eq(users.id, "billy"));

  // People known by email keep their name when invited, even if the address does not spell it.
  const viewAsLib = await import("../lib/view-as");
  const constantsLib = await import("../lib/constants");
  ok("a known address shows the person's name", viewAsLib.nameFromEmail(constantsLib.BABYLYN_EMAIL) === "Babylyn" && viewAsLib.nameFromEmail(constantsLib.BILLY_EMAIL.toUpperCase()) === "Billy" && viewAsLib.nameFromEmail("ana.cruz@x.com") === "Ana Cruz");

  // ---------- Transfer cards: last 4 digits only, one person to many cards, and never a guess ----------
  const cardsLib = await import("../lib/user-cards");
  const { htmlToText: gmailHtml } = await import("../lib/server/gmail");
  const wfBase = () => ({ find: { match: [[{ field: "subject" as const, op: "contains" as const, value: "Transfer Money" }]], label: "", days: 0 } });
  const flows = await import("../lib/import-workflows");
  const held = [{ user: "Bernz", last4: "4821" }, { user: "Bernz", last4: "1111" }, { user: "Babylyn", last4: "7710" }, { user: "Billy", last4: "7710" }, { user: "Outsider", last4: "5566" }];
  const bank = flows.BUILT_IN_WORKFLOWS.find((w) => w.id === "wf-bank")!, wallet = flows.BUILT_IN_WORKFLOWS.find((w) => w.id === "wf-wallet")!;
  const byCard = flows.cardMatch(bank, held, ["Bernz", "Babylyn", "Billy"]);
  ok("only 3 or 4 digits are accepted", ["12", "12345", "12a4", "", "4111111111111111"].every((v) => cardsLib.cardError([], "Bernz", v)) && !cardsLib.cardError([], "Bernz", "1234") && !cardsLib.cardError([], "Bernz", "091"));
  ok("one person can hold many cards", cardsLib.cardsOf(held, "Bernz").join() === "4821,1111");
  ok("the same card twice is refused", /already/.test(cardsLib.cardError(held, "Bernz", "4821") ?? ""));
  ok("the card limit is enforced", /Up to/.test(cardsLib.cardError(Array.from({ length: 10 }, (_, i) => ({ user: "A", last4: `000${i}` })), "A", "9999") ?? ""));
  ok("every card of a person finds them", flows.memberFor([], { account: "4821" }, byCard) === "Bernz" && flows.memberFor([], { account: "1111" }, byCard) === "Bernz");
  ok("a 3-digit bank alert still matches the ending", flows.memberFor([], { account: "821" }, byCard) === "Bernz");
  const alert091 = [{ user: "Babylyn", last4: "091" }];
  const bpi = { ...flows.BUILT_IN_WORKFLOWS[0], ...wfBase(), fields: [{ key: "amount", label: "Amount", type: "money" as const, after: "Amount" }, { key: "account", label: "Transfer From", type: "last4" as const, after: "Transfer From", payer: true }, { key: "to", label: "Transfer To", type: "last4" as const, after: "Transfer To" }] };
  const realAlert = gmailHtml("<table><tr><td>Transaction Date and Time</td><td>Friday, Oct 30 2026; 07:56:04 PM (GMT +8)</td></tr><tr><td>Transfer From</td><td>XXXX-XXX-091 (SAVINGS ACCOUNT)</td></tr><tr><td>Transfer To</td><td>XXXX-XXX-316 (SAVINGS ACCOUNT)</td></tr><tr><td>Amount</td><td>PHP 13,013.00</td></tr></table>");
  const readAlert = flows.runWorkflow(bpi, { id: "m", from: "bank@x.test", to: "me", subject: "Transfer Money", received: "2026-10-30 19:56", body: realAlert }, bpi.find);
  ok("a real alert's masked account reads as 091", readAlert.step === 2 && readAlert.json.account === "091" && readAlert.json.to === "316" && readAlert.json.amount === 1_301_300);
  ok("and finds Babylyn, not the receiving account", readAlert.step === 2 && flows.memberFor([], readAlert.json, flows.cardMatch(bpi, alert091, ["Bernz", "Babylyn"])) === "Babylyn");
  ok("a 3-digit card fits an alert that shows 4", flows.memberFor([], { account: "4091" }, flows.cardMatch(bank, alert091, ["Babylyn"])) === "Babylyn");
  ok("a shared ending is never guessed", flows.memberFor([], { account: "7710" }, byCard) === null);
  ok("a rule settles a shared ending", flows.memberFor([{ field: "account", value: "7710", member: "Billy" }], { account: "7710" }, byCard) === "Billy");
  ok("someone outside the goal is not matched", flows.memberFor([], { account: "5566" }, byCard) === null);
  ok("a mobile ending is not read as a card", !flows.cardMatch(wallet, held, ["Bernz"]).fields.includes("mobile") && flows.cardMatch(bank, held, []).fields.join() === "account");

  // ---------- Gmail connection: Google is faked here; everything else is the real code and database ----------
  Object.assign(process.env, { AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret", TOKEN_ENCRYPTION_KEY: "k".repeat(32), AUTH_RESEND_KEY: "re_test", AUTH_EMAIL_FROM: "eShareGoal <no-reply@example.com>" });
  const gmail = await import("../lib/server/gmail");
  const { gmailConnections } = schema;
  const READ = "https://www.googleapis.com/auth/gmail.readonly";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  let google: (url: string) => Response = (url) => {
    if (url.includes("/token")) return json({ access_token: "at", refresh_token: "rt-secret", scope: READ });
    if (url.endsWith("/profile")) return json({ emailAddress: "Bernz@Gmail.com" });
    if (url.includes("/labels")) return json({ labels: [{ name: "eShareGoal" }] });
    if (url.includes("/messages?")) return json({ messages: [{ id: "m1" }], resultSizeEstimate: 12 });
    if (url.includes("/messages/m1")) return json({ internalDate: "1793361363000", payload: { headers: [{ name: "Subject", value: "Transfer Money" }, { name: "From", value: "BPI" }] } });
    return json({});
  };
  const real = globalThis.fetch;
  const mailed: { to: string }[] = [];
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => { if (String(u).includes("resend.com")) { mailed.push(JSON.parse(String(init?.body))); return json({ id: "1" }); } return google(String(u)); }) as typeof fetch;

  const sealed = gmail.encryptToken("hello");
  ok("token is encrypted", !sealed.includes("hello") && gmail.decryptToken(sealed) === "hello");
  const parts = sealed.split("."); parts[3] = Buffer.from("changed").toString("base64url");
  await throws("a changed token does not open", async () => gmail.decryptToken(parts.join(".")), /./);
  ok("next stays inside the app", gmail.safeNext("https://evil.test") === gmail.safeNext("//evil.test") && gmail.safeNext("/design-preview/group?group=family") === "/design-preview/group?group=family");
  ok("a bad goal key is refused", !gmail.entryKey.safeParse("family~../x").success && gmail.entryKey.safeParse("family~car-credit").success);
  ok("no chosen inbox: Google lists the accounts; a chosen one goes straight to it", gmail.gmailAuthUrl("s").includes("prompt=select_account+consent") && /prompt=consent.*login_hint=a%40gmail\.com/.test(gmail.gmailAuthUrl("s", "a@gmail.com")));
  ok("Google page asks for read-only and offline access", /scope=.*gmail\.readonly/.test(gmail.gmailAuthUrl("s")) && gmail.gmailAuthUrl("s").includes("access_type=offline"));

  const seedLib = await import("../lib/db/seed");
  await testDb.insert(schema.goals).values({ id: seedLib.SEED_GOALS.carCredit, groupId: family, name: "Car Credit", kind: "loan", measure: "money", startsOn: "2025-11-05", createdBy: "bernz" });
  await testDb.insert(schema.goalMembers).values({ goalId: seedLib.SEED_GOALS.carCredit, userId: "babylyn", share: 6_000_00 });
  // Babylyn is an Owner by now (Members section): Dina is the plain Member of Car Credit, and of no other goal.
  await testDb.insert(users).values(person("dina", "Dina"));
  const dina = V("dina", "Dina");
  await testDb.insert(schema.groupMembers).values({ groupId: family, userId: "dina", role: "member", allGoals: false });
  await testDb.insert(schema.goalMembers).values({ goalId: seedLib.SEED_GOALS.carCredit, userId: "dina", share: 1_00 });
  await gmail.finishGmailSignIn("family~car-credit", "code", bernz);
  const [saved] = await testDb.select().from(gmailConnections);
  ok("inbox saved, token not readable in the database", saved.email === "bernz@gmail.com" && !saved.refreshToken.includes("rt-secret") && gmail.decryptToken(saved.refreshToken) === "rt-secret");
  const status = await gmail.gmailStatus("family~car-credit", { ...bernz, email: "Owner@Example.com" });
  ok("status never carries the token", status.connection?.email === "bernz@gmail.com" && !JSON.stringify(status).includes("refresh") && status.configured);
  ok("the link dialog suggests your email, then inboxes you linked", status.accounts.join() === "owner@example.com,bernz@gmail.com");
  ok("nobody is offered another person's inbox", (await gmail.gmailStatus("family~car-credit", V("nico", "Nico"))).accounts.join() === "nico@example.com");
  const steps = await gmail.testGmail(bernz, "family~car-credit", "eShareGoal", 30);
  ok("test passes step by step and shows the email", steps.every((s) => s.result === "pass") && steps.find((s) => s.emails)?.emails?.[0].subject === "Transfer Money");
  ok("a passing test emails the connected inbox", mailed.length === 1 && mailed[0].to === "bernz@gmail.com" && steps.at(-1)?.title === "Confirmation email");
  delete process.env.AUTH_RESEND_KEY;
  ok("no email service: still connected, says it was not sent", (await gmail.testGmail(bernz, "family~car-credit", "", 30)).at(-1)?.result === "warn" && mailed.length === 1);
  process.env.AUTH_RESEND_KEY = "re_test";
  ok("unknown label fails with the fix", (await gmail.testGmail(bernz, "family~car-credit", "Nope", 30)).at(-1)?.result === "fail");
  ok("a failed test sends no email", mailed.length === 1);

  // A goal's inbox belongs to its Owners: not its Members, not people outside it, not the System Admin, not a revoked Owner.
  const CAR_INBOX = "family~car-credit";
  const notOwners = [["a Member of the goal", dina], ["a group member outside the goal", billy], ["someone outside the group", V("nico", "Nico")], ["the System Admin", sa]] as const;
  ok("connecting: only an Owner may start it", await gmail.canManageInbox(bernz, CAR_INBOX) && !(await Promise.all(notOwners.map(([, v]) => gmail.canManageInbox(v, CAR_INBOX)))).some(Boolean));
  ok("connecting: an account no longer active may not", !(await gmail.canManageInbox({ ...bernz, status: "revoked" }, CAR_INBOX)));
  const inboxRow = async () => (await testDb.select().from(gmailConnections).where(eq(gmailConnections.entry, CAR_INBOX)))[0];
  const inboxBefore = await inboxRow();
  const tokensAsked = () => { let n = 0; const was = google; google = (u) => { if (u.includes("/token")) n++; return was(u); }; return { count: () => n, stop: () => { google = was; } }; };
  const spy = tokensAsked();
  for (const [who, v] of notOwners) {
    await throws(`${who} cannot link an inbox when Google comes back`, () => gmail.finishGmailSignIn(CAR_INBOX, "code", v), /Only an Owner/);
    await throws(`${who} cannot disconnect the inbox`, () => gmail.disconnectGmail(CAR_INBOX, v), /Only an Owner/);
    await throws(`${who} cannot test the inbox`, () => gmail.testGmail(v, CAR_INBOX, "", 30), /Only an Owner/);
  }
  await throws("a revoked Owner cannot finish linking", () => gmail.finishGmailSignIn(CAR_INBOX, "code", { ...bernz, status: "revoked" }), /Only an Owner/);
  ok("Google is never called for a refused person", spy.count() === 0);
  spy.stop();
  const inboxAfter = await inboxRow();
  ok("the refused calls changed nothing and mailed nobody", inboxAfter.refreshToken === inboxBefore.refreshToken && inboxAfter.connectedBy === "bernz" && mailed.length === 1);
  ok("the goal's inbox address shows only to those who run the goal", (await gmail.gmailStatus(CAR_INBOX, sa)).connection?.email === "bernz@gmail.com" && (await gmail.gmailStatus(CAR_INBOX, dina)).connection === null && (await gmail.gmailStatus(CAR_INBOX, billy)).connection === null);
  await gmail.finishGmailSignIn("family~preview", "code", bernz);
  await throws("a preview-only goal's inbox stays with who linked it: link", () => gmail.finishGmailSignIn("family~preview", "code", babylyn), /Only an Owner/);
  await throws("a preview-only goal's inbox stays with who linked it: disconnect", () => gmail.disconnectGmail("family~preview", babylyn), /Only an Owner/);
  await throws("a preview-only goal's inbox stays with who linked it: test", () => gmail.testGmail(babylyn, "family~preview", "", 30), /Only an Owner/);
  ok("a preview-only goal's inbox address shows only to who linked it", (await gmail.gmailStatus("family~preview", babylyn)).connection === null && !!(await gmail.gmailStatus("family~preview", bernz)).connection);
  await gmail.disconnectGmail("family~preview", bernz);
  ok("who linked it can remove it", (await gmail.gmailStatus("family~preview", bernz)).connection === null);

  const working = google;
  google = (url) => (url.includes("/token") ? json({ access_token: "at", scope: "openid" }) : working(url));
  await throws("Gmail box unticked is refused", () => gmail.finishGmailSignIn("family~other", "code", bernz), /scope/);
  ok("nothing saved when refused", (await testDb.select().from(gmailConnections)).length === 1);
  google = (url) => (url.includes("/token") ? json({ error: "invalid_grant" }, 400) : working(url));
  ok("expired sign-in asks to sign in again", (await gmail.testGmail(bernz, "family~car-credit", "", 30)).at(-1)?.signIn === true);
  google = (url) => (url.endsWith("/profile") ? json({ error: { errors: [{ reason: "accessNotConfigured" }] } }, 403) : working(url));
  ok("Gmail API off says how to turn it on", (await gmail.testGmail(bernz, "family~car-credit", "", 30)).at(-1)?.title === "Gmail API");

  // Reading a real inbox for an import job: Google is faked, the workflow and the guards are real.
  ok("an HTML alert reads like a plain one", gmail.htmlToText("<head><style>x{}</style></head><table><tr><td>Amount</td><td>&#8369;1,000.00</td></tr></table><p>A&nbsp;&amp;&nbsp;B</p>") === "Amount\t₱1,000.00\nA & B");
  const b64 = (s: string) => Buffer.from(s).toString("base64url");
  const alert = { from: "alerts@bank.test", subject: "Money received", amount: "PHP 1,500.00", name: "JUAN CRUZ", account: "****4821", ref: "REF-1" };
  const wf = { ...flows.BUILT_IN_WORKFLOWS[0], id: "wf-own-test", find: { match: [[{ field: "from" as const, op: "contains" as const, value: "bank.test" }]], label: "", days: 0 },
    fields: [{ key: "amount", label: "Amount", type: "money" as const, after: "Amount:" }, { key: "sender", label: "Sender", type: "text" as const, after: "Transfer From:", payer: true }, { key: "account", label: "Account", type: "last4" as const, after: "From Account:", payer: true }, { key: "reference", label: "Reference", type: "text" as const, after: "Reference No.:" }] };
  const headers = (from: string) => [{ name: "From", value: from }, { name: "To", value: "me@gmail.com" }, { name: "Subject", value: alert.subject }];
  const bodyText = `Amount: ${alert.amount}\nTransfer From: ${alert.name}\nFrom Account: ${alert.account}\nReference No.: ${alert.ref}`;
  const asked: string[] = [];
  const inbox_ = working;
  google = (url) => {
    if (url.includes("/messages?")) { asked.push(decodeURIComponent(url.replace(/\+/g, " "))); return json({ messages: [{ id: "plain" }, { id: "html" }, { id: "other" }], nextPageToken: "more" }); }
    if (url.includes("/messages/plain")) return json({ id: "plain", internalDate: "1793361363000", payload: { headers: headers(alert.from), mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: b64("<p>ignored</p>") } }, { mimeType: "text/plain", body: { data: b64(bodyText) } }] } });
    if (url.includes("/messages/html")) return json({ id: "html", internalDate: "1793361363000", payload: { headers: headers(alert.from), mimeType: "text/html", body: { data: b64(`<table><tr><td>Amount:</td><td>PHP 2,000.00</td></tr><tr><td>Transfer From:</td><td>ANA REYES</td></tr></table>`) } } });
    if (url.includes("/messages/other")) return json({ id: "other", internalDate: "1793361363000", payload: { headers: headers("friend@gmail.test"), mimeType: "text/plain", body: { data: b64("bank.test mentioned") } } });
    return inbox_(url);
  };
  const read = { entry: "family~car-credit", workflow: wf, label: "Bank", days: 14, viewerId: "bernz" };
  await throws("only the person who linked the inbox can read it", () => gmail.readInboxForJob({ ...read, viewerId: "nico" }), /Only the person/);
  await throws("a goal with no inbox says so", () => gmail.readInboxForJob({ ...read, entry: "family~nothing" }), /No Gmail/);
  await throws("a workflow with no conditions reads nothing", () => gmail.readInboxForJob({ ...read, workflow: { ...wf, find: { match: [[]], label: "", days: 0 } } }), /no Where/);
  const job = await gmail.readInboxForJob(read);
  ok("the search uses the goal's label and days", /from:\(bank\.test\)/.test(asked.at(-1)!) && /label:Bank/.test(asked.at(-1)!) && /newer_than:14d/.test(asked.at(-1)!));
  ok("emails Gmail matched loosely are checked exactly", job.reads.map((r) => r.id).join() === "plain,html");
  ok("a plain alert is read into values", job.reads[0].json.amount === 150_000 && job.reads[0].json.account === "4821" && job.reads[0].json.reference === "REF-1" && job.reads[0].deposit);
  ok("an HTML-only alert is read too", job.reads[1].json.amount === 200_000 && job.reads[1].json.sender === "ANA REYES");
  ok("only read values leave the server, never the email", !JSON.stringify(job).includes("Transfer From") && !JSON.stringify(job).includes("alerts@bank.test"));
  ok("more emails than one read are reported", job.more);
  ok("the time is the app's time zone", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(job.reads[0].received));
  google = (url) => (url.includes("/token") ? json({ error: "invalid_grant" }, 400) : working(url));
  await throws("an expired sign-in says what to do", () => gmail.readInboxForJob(read), /Connect Gmail again/);
  google = working;

  // Scheduled import: the workflow's AND filter, then records in the database. Only Google is faked.
  const importsLib = await import("../lib/server/imports");
  const bankTable = (rows: [string, string][]) => `<h2>Transfer Money Details</h2><table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>`;
  const transfer = (ref: string, from: string, to: string, amount: string) => bankTable([["Confirmation Number", ref], ["Transaction Date and Time", "Friday, Oct 30 2026; 07:56:04 PM (GMT +8)"], ["Transfer From", `XXXX-XXX-${from} (SAVINGS ACCOUNT)`], ["Transfer To", `XXXX-XXX-${to} (SAVINGS ACCOUNT)`], ["Amount", `PHP ${amount}`], ["Notes", ""]]);
  const bankMail: Record<string, string> = {
    ok: transfer("1793361363755", "091", "316", "13,013.00"),
    twice: transfer("1793361363755", "091", "316", "13,013.00"),
    stranger: transfer("1793361363999", "777", "316", "500.00"),
    sentOut: transfer("1793361363777", "316", "091", "4,539.00"),
    otherAccount: transfer("1793361363888", "091", "555", "900.00"),
    notTransfer: "<p>Your statement is ready. Confirmation Number 1. Transfer From nobody.</p>",
  };
  const searched: string[] = [];
  google = (url) => {
    if (url.includes("/messages?")) { searched.push(decodeURIComponent(url.replace(/\+/g, " "))); return json({ messages: Object.keys(bankMail).map((id) => ({ id })) }); }
    const hit = Object.keys(bankMail).find((id) => url.includes(`/messages/${id}`));
    if (hit) return json({ id: hit, internalDate: "1793361363000", payload: { headers: [{ name: "From", value: "bank@x.test" }, { name: "Subject", value: "Transfer Money" }], mimeType: "text/html", body: { data: b64(bankMail[hit]) } } });
    return working(url);
  };
  const carRecords = () => testDb.select().from(schema.records).where(eq(schema.records.goalId, seedLib.SEED_GOALS.carCredit));
  const ownJob = { id: "ij-old", on: true, schedule: flows.DEFAULT_IMPORT_SCHEDULE, workflow: "wf-bank", map: [] };
  ok("an older saved list gets the timer job once", flows.withTimerJobs("family~car-credit", [ownJob]).map((j) => j.id).join() === "ij-transfer,ij-old" && flows.withTimerJobs("family~car-credit", flows.importJobsFor("family~car-credit")).filter((j) => j.id === "ij-transfer").length === 1);
  ok("other goals do not get it", flows.withTimerJobs("family~other", []).length === 0);
  const dryRun = (await importsLib.runGmailImports({ dry: true }))[0];
  ok("every condition is in one AND group", flows.BUILT_IN_WORKFLOWS.find((w) => w.id === "wf-transfer-money")!.find.match.length === 1 && flows.BUILT_IN_WORKFLOWS.find((w) => w.id === "wf-transfer-money")!.find.match[0].length >= 4);
  ok("the Gmail search needs all of them", searched.some((q) => /"Transfer Money Details" "Confirmation Number" "Transfer From" "Transfer To XXXX-XXX-316"/.test(q)));
  ok("a dry run writes nothing", dryRun.added === 1 && (await carRecords()).length === 0);
  const importRun = (await importsLib.runGmailImports())[0];
  ok("money sent out of 316, transfers to other accounts and other emails are filtered out", importRun.read === 3);
  ok("the payment is added once, for its member", importRun.added === 1 && importRun.duplicates === 1);
  ok("an unknown sender is left for an Owner", importRun.unmapped === 1);
  const [added] = await carRecords();
  ok("the record is right", added.memberId === "babylyn" && added.amount === 13_013_00 && added.day === "2026-10-30" && added.ref === "1793361363755" && added.source === "import" && added.direction === "in");
  ok("running again adds nothing", (await importsLib.runGmailImports())[0].added === 0 && (await carRecords()).length === 1);
  const setup = await import("../lib/server/import-setup");
  const review = await import("../lib/server/import-review");
  const CAR = "family~car-credit";
  const paid = { member: "Babylyn", day: "2026-10-31", amount: 4_539_00, ref: "CONFIRM-1", msg: "msg-confirm-1", payer: "091", job: "Transfer" };
  const queued = async (ref: string) => (await review.goalImported(bernz, CAR)).review.find((r) => r.ref === ref)!;
  const sent = (items: (typeof paid)[]) => review.sendToReview(bernz, { entry: CAR, items });
  ok("Run now puts a payment in the Owner's queue, not the records", (await sent([paid])).sent === 1 && (await queued("CONFIRM-1")).status === "Pending Review" && !(await carRecords()).some((r) => r.ref === "CONFIRM-1"));
  ok("sending it again adds nothing", (await sent([paid])).sent === 0 && (await sent([{ ...paid, ref: "OTHER-REF" }])).sent === 0);
  ok("the timer's own payment is not queued", (await sent([{ ...paid, ref: "1793361363755", msg: "" }])).sent === 0);
  ok("a payment with an unknown member is queued for an Owner", (await sent([{ ...paid, member: "Nobody", ref: "CONFIRM-2", msg: "m2" }])).sent === 1 && (await queued("CONFIRM-2")).member === "");
  await throws("no member, no confirm", async () => review.decideReview(bernz, { id: (await queued("CONFIRM-2")).id, action: "confirm" }), /Choose a member/);
  await review.setReviewMember(bernz, { id: (await queued("CONFIRM-2")).id, member: "Babylyn" });
  ok("Correct sets the member", (await queued("CONFIRM-2")).member === "Babylyn");
  await throws("a stranger cannot be credited", async () => review.setReviewMember(bernz, { id: (await queued("CONFIRM-2")).id, member: "Nobody" }), /does not take part/);
  const firstId = (await queued("CONFIRM-1")).id;
  await throws("the System Admin cannot decide on a payment", () => review.decideReview(sa, { id: firstId, action: "confirm" }), /Only an Owner/);
  await throws("a Member cannot decide on a payment", () => review.decideReview(billy, { id: firstId, action: "confirm" }), /Only an Owner/);
  ok("Confirm adds the record", (await review.decideReview(bernz, { id: firstId, action: "confirm" })).added && (await carRecords()).some((r) => r.ref === "CONFIRM-1" && r.messageId === "msg-confirm-1" && r.source === "import") && (await queued("CONFIRM-1")).status === "Confirmed");
  await throws("it cannot be decided twice", () => review.decideReview(bernz, { id: firstId, action: "confirm" }), /already decided/);
  const secondId = (await queued("CONFIRM-2")).id;
  await review.decideReview(bernz, { id: secondId, action: "reject" });
  ok("a rejected payment stays out and off the records", (await queued("CONFIRM-2")).status === "Rejected" && !(await carRecords()).some((r) => r.ref === "CONFIRM-2") && (await sent([{ ...paid, ref: "CONFIRM-2", msg: "m2" }])).sent === 0);
  await review.decideReview(bernz, { id: secondId, action: "reopen" });
  ok("Undo reject puts it back", (await queued("CONFIRM-2")).status === "Pending Review");
  await throws("a goal with no server records is refused", () => review.sendToReview(bernz, { entry: "family~vacation", items: [paid] }), /server/);
  ok("the database itself refuses a second copy", await testDb.insert(schema.records).values({ goalId: seedLib.SEED_GOALS.carCredit, day: "2026-10-31", ref: "CONFIRM-1", source: "import", createdBy: "bernz" }).then(() => false, () => true));
  const heldNow = await review.goalImported(bernz, CAR, true);
  ok("the screens get imported payments with member names", heldNow.records.some((r) => r.ref === "CONFIRM-1" && r.member === "Babylyn" && r.amount === 4_539_00));
  ok("a run knows references and message ids", ["CONFIRM-1", "msg-confirm-1", "CONFIRM-2", "m2"].every((k) => heldNow.keys.includes(k)));
  ok("a poll leaves the keys out and keeps the records and the queue", (await review.goalImported(bernz, CAR)).keys.length === 0 && (await review.goalImported(bernz, CAR)).records.length === heldNow.records.length && (await review.goalImported(bernz, CAR)).review.length === heldNow.review.length);
  ok("a member does not see the queue", (await review.goalImported(dina, CAR)).review.length === 0);
  await testDb.insert(schema.records).values({ goalId: seedLib.SEED_GOALS.carCredit, memberId: "dina", day: "2026-10-31", amount: 1_00, direction: "in", kind: "deposit", ref: "DINA-PAID", source: "import", createdBy: "bernz" });
  const asOwner = await review.goalImported(bernz, CAR), asMember = await review.goalImported(dina, CAR, true), asOutsider = await review.goalImported(billy, CAR, true);
  ok("the Owner and the System Admin get every member's payments", asOwner.records.some((r) => r.member === "Dina") && asOwner.records.some((r) => r.member === "Babylyn") && (await review.goalImported(sa, CAR)).records.length === asOwner.records.length);
  ok("a Member gets only their own payments", asMember.records.map((r) => r.ref).join() === "DINA-PAID");
  ok("a Member gets no keys, which are everyone's references", asMember.keys.length === 0);
  ok("a group member outside the goal gets nothing", asOutsider.records.length === 0 && asOutsider.keys.length === 0 && asOutsider.review.length === 0);
  ok("someone outside the group gets nothing", (await review.goalImported(V("nico", "Nico"), CAR)).records.length === 0);
  ok("a group member outside the goal gets no jobs", !(await setup.goalJobs(billy, CAR)).timer);
  ok("a Member of the goal gets its jobs", (await setup.goalJobs(dina, CAR)).timer);
  await throws("a group member outside the goal cannot change the jobs", () => setup.saveGoalImports(billy, { entry: CAR, jobs: [], workflows: [] }), /Owner or the System Admin/);
  await throws("a Member of the goal cannot change the jobs", () => setup.saveGoalImports(dina, { entry: CAR, jobs: [], workflows: [] }), /Owner or the System Admin/);
  const dal = await import("../lib/server/dal");
  ok("one lookup gives each person's role in the goal", (await dal.timerGoalAccess(bernz, CAR))?.role === "owner" && (await dal.timerGoalAccess(sa, CAR))?.role === "admin" && (await dal.timerGoalAccess(dina, CAR))?.role === "member" && (await dal.timerGoalAccess(billy, CAR))?.role === null);
  ok("a preview-only goal has no server access at all", (await dal.timerGoalAccess(bernz, "family~other")) === null);
  const carRows = (await carRecords()).length;
  const afterQueue = (await importsLib.runGmailImports())[0];
  ok("the timer's unknown sender waits in the queue once", afterQueue.added === 0 && (await review.goalImported(bernz, CAR)).review.filter((r) => r.member === "").length === 1 && (await carRecords()).length === carRows);
  await testDb.update(schema.records).set({ deletedAt: new Date() }).where(eq(schema.records.ref, "CONFIRM-1"));
  ok("a deleted payment does not come back", (await sent([paid])).sent === 0 && !(await review.goalImported(bernz, CAR)).records.some((r) => r.ref === "CONFIRM-1"));
  // Two decisions at once: both read the payment as pending before either writes. Exactly one wins, and the record agrees with it.
  const race = async (ref: string, first: "confirm" | "reject", second: "confirm" | "reject") => {
    await sent([{ ...paid, ref, msg: `msg-${ref}` }]);
    const { id } = await queued(ref);
    const results = await Promise.allSettled([review.decideReview(bernz, { id, action: first }), review.decideReview(bernz, { id, action: second })]);
    const lost = results.filter((r) => r.status === "rejected").map((r) => (r.reason as Error).message);
    return { lost, status: (await queued(ref)).status, kept: (await carRecords()).filter((r) => r.ref === ref).length };
  };
  const agrees = (r: Awaited<ReturnType<typeof race>>) => r.lost.length === 1 && /already decided/.test(r.lost[0]) && (r.status === "Confirmed" ? r.kept === 1 : r.status === "Rejected" && r.kept === 0);
  ok("a Reject racing a Confirm cannot leave a record behind", agrees(await race("RACE-1", "confirm", "reject")));
  ok("a Confirm racing a Reject cannot leave a record behind", agrees(await race("RACE-2", "reject", "confirm")));
  ok("two Confirms at once add one record", agrees(await race("RACE-3", "confirm", "confirm")));
  ok("two Rejects at once leave one decision", agrees(await race("RACE-4", "reject", "reject")));
  await sent([{ ...paid, ref: "RACE-5", msg: "msg-RACE-5" }]);
  const staleId = (await queued("RACE-5")).id;
  await review.decideReview(bernz, { id: staleId, action: "confirm" });
  await throws("a stale Reject after a Confirm is refused", () => review.decideReview(bernz, { id: staleId, action: "reject" }), /already decided/);
  await throws("a stale Undo reject after a Confirm is refused", () => review.decideReview(bernz, { id: staleId, action: "reopen" }), /already decided/);
  ok("the Confirm stands, with its record", (await queued("RACE-5")).status === "Confirmed" && (await carRecords()).some((r) => r.ref === "RACE-5"));
  // A decision is all or nothing: when the audit row fails, neither the record nor the status stays.
  await sent([{ ...paid, ref: "RACE-6", msg: "msg-RACE-6" }]);
  const brokenId = (await queued("RACE-6")).id, audits = async () => (await testDb.select().from(schema.auditLog)).length, auditsBefore = await audits();
  await pg.exec("create function no_audit() returns trigger language plpgsql as $$ begin raise exception 'audit down'; end $$; create trigger no_audit before insert on audit_log for each row execute function no_audit();");
  await throws("a failed Confirm reports the failure", () => review.decideReview(bernz, { id: brokenId, action: "confirm" }), /Failed query|audit down/);
  await throws("a failed Reject reports the failure", () => review.decideReview(bernz, { id: brokenId, action: "reject" }), /Failed query|audit down/);
  await pg.exec("drop trigger no_audit on audit_log; drop function no_audit();");
  ok("a failed decision changes nothing", (await queued("RACE-6")).status === "Pending Review" && !(await carRecords()).some((r) => r.ref === "RACE-6") && (await audits()) === auditsBefore);
  ok("it can be decided again", (await review.decideReview(bernz, { id: brokenId, action: "confirm" })).added);
  await testDb.delete(schema.records).where(like(schema.records.ref, "RACE-%"));
  await testDb.delete(schema.importReviews).where(like(schema.importReviews.ref, "RACE-%"));
  const { pollImported } = await import("../components/app/imported-records");
  const realSet = globalThis.setInterval, realClear = globalThis.clearInterval;
  let started = 0, cleared = 0;
  globalThis.setInterval = (() => { started++; return 0; }) as unknown as typeof setInterval;
  globalThis.clearInterval = (() => { cleared++; }) as typeof clearInterval;
  const [stopBell, stopBadge, stopCard] = [pollImported(), pollImported(), pollImported()];
  ok("three screens share one poll", started === 1);
  stopBell(); stopBadge();
  ok("the poll goes on while one screen still shows the queue", cleared === 0);
  stopCard();
  ok("the last screen stops the poll", cleared === 1);
  pollImported()();
  ok("the next screen starts it again", started === 2 && cleared === 2);
  globalThis.setInterval = realSet; globalThis.clearInterval = realClear;
  const accountsLib = await import("../lib/server/accounts");
  const applicant = { name: "Jona Reyes", email: "Jona@Example.com", phone: "09171234567", password: "correct horse" };
  await accountsLib.createAccount(applicant);
  const [jona] = await testDb.select().from(schema.users).where(eq(schema.users.email, "jona@example.com"));
  ok("sign-up makes a pending account with a lowercase email", jona.status === "pending_review" && jona.siteRole === "user");
  ok("the password is stored only as a salted hash", !!jona.passwordHash && !jona.passwordHash.includes("correct horse") && jona.passwordHash !== (await accountsLib.hashPassword(applicant.password)));
  await throws("an email signs up once", () => accountsLib.createAccount({ ...applicant, email: "jona@example.com" }), /already exists/);
  await throws("a short password is refused", () => accountsLib.createAccount({ ...applicant, email: "x@example.com", password: "short" }), /at least 8/);
  await throws("a bad mobile number is refused", () => accountsLib.createAccount({ ...applicant, email: "y@example.com", phone: "123" }), /mobile number/);
  ok("the right password opens the account, whatever the email's case", (await accountsLib.checkPassword({ email: "JONA@example.com", password: applicant.password }))?.id === jona.id);
  ok("a wrong password does not", (await accountsLib.checkPassword({ email: applicant.email, password: "wrong" })) === null);
  ok("an unknown email does not", (await accountsLib.checkPassword({ email: "nobody@example.com", password: "x" })) === null);
  await accountsLib.checkPassword({ email: applicant.email, password: applicant.password });
  for (let i = 0; i < 5; i++) await accountsLib.checkPassword({ email: applicant.email, password: "wrong" });
  ok("too many wrong tries pause the account, even for the right password", (await accountsLib.checkPassword({ email: applicant.email, password: applicant.password })) === null);
  await testDb.update(schema.users).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(schema.users.id, jona.id));
  ok("the pause ends on its own", !!(await accountsLib.checkPassword({ email: applicant.email, password: applicant.password })));
  process.env.ADMIN_EMAILS = "boss@example.com";
  const account = async (email: string) => (await testDb.select().from(schema.users).where(eq(schema.users.email, email)))[0];
  const link = (email: string) => accountsLib.allowSignIn({ email, provider: "resend", type: "email" });
  // Someone types the System Admin's address at sign-up, before the real one arrives.
  await accountsLib.createAccount({ ...applicant, email: "boss@example.com" });
  const squatted = await account("boss@example.com");
  ok("a listed email typed at sign-up proves nothing: no System Admin, no access", squatted.status === "pending_review" && squatted.siteRole === "user");
  ok("asking for a link is not proof", (await accountsLib.allowSignIn({ email: "boss@example.com", provider: "resend", type: "email", verificationRequest: true })) === true && (await account("boss@example.com")).status === "pending_review" && !!(await account("boss@example.com")).passwordHash);
  ok("a password sign-in is not proof", (await accountsLib.allowSignIn({ email: "boss@example.com", provider: "password", type: "credentials" })) === true && (await account("boss@example.com")).siteRole === "user");
  ok("Google is refused unless it vouches for the address", (await accountsLib.allowSignIn({ email: "boss@example.com", provider: "google", type: "oidc", googleVerified: false })) === false && (await accountsLib.allowSignIn({ email: "new@example.com", provider: "google", type: "oidc" })) === false);
  ok("a verified Google address may sign in", (await accountsLib.allowSignIn({ email: "new@example.com", provider: "google", type: "oidc", googleVerified: true })) === true);
  ok("opening the link is proof, whatever the email's case", (await link("BOSS@example.com")) === true);
  const proven = await account("boss@example.com");
  ok("the real admin becomes System Admin", proven.status === "active" && proven.siteRole === "admin");
  ok("the password the stranger set stops working", proven.passwordHash === null && (await accountsLib.checkPassword({ email: "boss@example.com", password: applicant.password })) === null);
  ok("the stranger's open session ends with that password", dal.passwordSessionEnded("password", null) && !dal.passwordSessionEnded("password", "s1.a.b") && !dal.passwordSessionEnded("resend", null) && !dal.passwordSessionEnded(undefined, null));
  // The same, for an ordinary person.
  await accountsLib.createAccount({ ...applicant, email: "victim@example.com" });
  await testDb.update(schema.users).set({ status: "active" }).where(eq(schema.users.email, "victim@example.com"));
  await link("victim@example.com");
  ok("an inbox's holder takes over an account with an unproven password", (await account("victim@example.com")).passwordHash === null && (await accountsLib.checkPassword({ email: "victim@example.com", password: applicant.password })) === null);
  ok("that gives them no System Admin rights", (await account("victim@example.com")).siteRole === "user");
  await accountsLib.createAccount({ ...applicant, email: "proven@example.com" });
  await testDb.update(schema.users).set({ emailVerified: new Date() }).where(eq(schema.users.email, "proven@example.com"));
  await link("proven@example.com");
  ok("a proven account keeps its password", !!(await account("proven@example.com")).passwordHash);
  await accountsLib.createAccount({ ...applicant, email: "gone@example.com" });
  await testDb.update(schema.users).set({ status: "revoked" }).where(eq(schema.users.email, "gone@example.com"));
  ok("a revoked account is blocked, on every path", String(await accountsLib.allowSignIn({ email: "gone@example.com", provider: "password", type: "credentials" })).includes("blocked") && String(await link("gone@example.com")).includes("blocked") && String(await accountsLib.allowSignIn({ email: "gone@example.com", provider: "google", type: "oidc", googleVerified: true })).includes("blocked"));
  ok("blocking proves nothing and changes nothing", !!(await account("gone@example.com")).passwordHash && (await account("gone@example.com")).status === "revoked");
  await testDb.update(schema.users).set({ status: "rejected" }).where(eq(schema.users.email, "gone@example.com"));
  ok("a rejected account is blocked too", String(await link("gone@example.com")).includes("blocked"));
  process.env.ADMIN_EMAILS = "boss@example.com,listed@example.com,gone@example.com";
  await testDb.insert(schema.users).values({ id: "listed", email: "listed@example.com" });
  await accountsLib.emailProven("listed@example.com");
  ok("a new account from a proven inbox on the list is a System Admin", (await account("listed@example.com")).siteRole === "admin" && (await account("listed@example.com")).status === "active");
  await accountsLib.emailProven("gone@example.com");
  ok("the list never brings back a rejected account", (await account("gone@example.com")).status === "rejected" && (await account("gone@example.com")).siteRole === "user");
  delete process.env.ADMIN_EMAILS;
  const adminLib = await import("../lib/server/admin");
  await adminLib.reviewUser(sa, jona.id, true);
  ok("an approved account becomes active", (await testDb.select().from(schema.users).where(eq(schema.users.id, jona.id)))[0].status === "active");
  const paramCards = [{ user: "Babylyn", last4: "091" }, { user: "Billy", last4: "4821" }, { user: "Bernz", last4: "7710" }, { user: "Billy", last4: "7710" }, { user: "Outsider", last4: "5555" }];
  const paramWf = flows.BUILT_IN_WORKFLOWS.find((w) => w.id === "wf-transfer-money")!;
  const filled = flows.paramRules({ w: paramWf, map: [{ field: "account", value: "091", member: "Babylyn" }], cards: paramCards, members: ["Bernz", "Babylyn", "Billy"] });
  ok("a workflow's payer param fills from members' cards", filled.map((r) => r.value + r.member).join() === "091Babylyn,4821Billy");
  ok("each param with no rule gets an empty row", flows.paramRules({ w: flows.BUILT_IN_WORKFLOWS.find((w) => w.id === "wf-bank")!, map: [], cards: [], members: ["Bernz"] }).map((r) => r.field).join() === "sender,account");
  const pastedAlert = { id: "s", from: "", to: "", subject: "", received: "2026-10-30 19:56", body: "Transfer Money Details\nConfirmation Number\t1793361363755\nTransaction Date and Time\tFriday, Oct 30 2026; 07:56:04 PM (GMT +8)\nTransfer From\tXXXX-XXX-091 (SAVINGS ACCOUNT)\nTransfer To\tXXXX-XXX-316 (SAVINGS ACCOUNT)\nAmount\tPHP 13,013.00\nNotes\tthanks" };
  const guess = flows.suggestRules(pastedAlert);
  ok("a pasted alert finds the values a payment needs", guess.fields.map((f) => `${f.key}:${f.type}${f.payer ? ":payer" : ""}`).join() === "reference:text,date:date,transfer_from:last4:payer,amount:money");
  ok("a pasted alert finds its title and receiving account", guess.conds.map((c) => c.value).join("|") === "Transfer Money Details|Transfer To XXXX-XXX-316");
  const guessed = { ...paramWf, fields: guess.fields, find: { ...paramWf.find, match: [guess.conds] } };
  const readBack = flows.runWorkflow(guessed, pastedAlert, guessed.find);
  ok("the suggested setup reads the alert it came from", readBack.step === 2 && readBack.deposit && readBack.json.amount === 13_013_00 && readBack.json.transfer_from === "091" && readBack.json.reference === "1793361363755" && readBack.json.date === "2026-10-30");
  ok("the suggested setup is valid", Object.keys(flows.workflowProblems({ ...guessed, name: "X" }, [])).length === 0);
  ok("money sent out does not match the suggested setup", flows.runWorkflow(guessed, { ...pastedAlert, body: pastedAlert.body.replace("From\tXXXX-XXX-091", "From\tXXXX-XXX-X").replace("To\tXXXX-XXX-316", "To\tXXXX-XXX-091").replace("From\tXXXX-XXX-X", "From\tXXXX-XXX-316") }, guessed.find).step === 1);
  const swapped = flows.withRole(guess.fields, 0, "amount");
  ok("one amount at a time", swapped.filter((f) => f.key === "amount").length === 1 && swapped[0].key === "amount" && flows.withRole(guess.fields, 2, "other")[2].payer === undefined);
  const denied = async (fn: () => Promise<unknown>, why: RegExp) => { try { await fn(); return false; } catch (e) { return why.test(String(e)); } };
  const carOwner = V("bernz", "Bernz"), siteAdmin = V("admin", "Site Admin", "admin"), member = V("nico", "Nico");
  const baseJob = flows.TRANSFER_JOB;
  const saveJobs = (v: typeof carOwner, jobs: unknown[], workflows: unknown[] = []) => setup.saveGoalImports(v, { entry: "family~car-credit", jobs, workflows });
  ok("someone outside the group cannot change the jobs", await denied(() => saveJobs(member, [baseJob]), /Owner or the System Admin/));
  ok("a goal without records stays in the browser", (await setup.saveGoalImports(carOwner, { entry: "family~other", jobs: [], workflows: [] })) === false);
  const strangerPaid = { ...baseJob, map: [...baseJob.map, { field: "account", value: "777", member: "Babylyn" }] };
  ok("the Owner saves a payer rule", await saveJobs(carOwner, [strangerPaid]));
  const withRule = (await importsLib.runGmailImports({ dry: true }))[0];
  ok("the timer uses the saved rule", withRule.added === 1 && withRule.unmapped === 0);
  const carWf = flows.BUILT_IN_WORKFLOWS.find((w) => w.id === "wf-transfer-money")!;
  const jobRules = { ...carWf, id: "wf-own-job1", builtIn: false, name: "Transfer Money import", find: { ...carWf.find, match: [[...carWf.find.match[0].slice(0, 3), { field: "body" as const, op: "contains" as const, value: "XXXX-XXX-555" }]] } };
  await saveJobs(siteAdmin, [{ ...strangerPaid, workflow: jobRules.id }], [jobRules]);
  await importsLib.runGmailImports({ dry: true });
  ok("the timer uses the filter saved in the job", searched.at(-1)!.includes("XXXX-XXX-555"));
  ok("the screen gets the job's filter back", (await setup.goalJobs(siteAdmin, "family~car-credit")).workflows[0].id === jobRules.id);
  ok("two jobs may share a name", await saveJobs(siteAdmin, [{ ...strangerPaid, workflow: jobRules.id }, { ...strangerPaid, id: "ij-two", workflow: "wf-own-job2" }], [jobRules, { ...jobRules, id: "wf-own-job2" }]));
  ok("a bad pattern never reaches the timer", await denied(() => saveJobs(siteAdmin, [strangerPaid], [{ ...jobRules, fields: [...jobRules.fields, { key: "x", label: "X", type: "text", after: "", pattern: "(" }] }]), /has problems/));
  await saveJobs(siteAdmin, [{ ...strangerPaid, on: false }]);
  ok("a paused job does not run", (await importsLib.runGmailImports({ dry: true }))[0].skipped === "Paused.");
  await saveJobs(carOwner, [{ ...strangerPaid, schedule: { ...strangerPaid.schedule, freq: "weekly", weekday: 1 } }]);
  ok("a weekly job only runs on its day", (await importsLib.runGmailImports({ dry: true, today: "2026-11-05" }))[0].skipped === "Not scheduled today." && !(await importsLib.runGmailImports({ dry: true, today: "2026-11-02" }))[0].skipped);
  await saveJobs(carOwner, []);
  ok("a deleted job stays deleted", (await importsLib.runGmailImports({ dry: true })).length === 0);
  await testDb.delete(schema.importSetups);
  const paidUp = await overdue.runOverdueCheck("2026-11-05");
  ok("the overdue check sees the imported payment", !paidUp.lines.some((l) => l.goal === "Car Credit" && l.member === "Babylyn"));
  await testDb.delete(gmailConnections).where(eq(gmailConnections.entry, "family~car-credit"));
  ok("no linked inbox is reported, not an error", /No Gmail/.test((await importsLib.runGmailImports())[0].skipped ?? ""));
  await gmail.finishGmailSignIn("family~car-credit", "code", bernz);

  // Cancelling one Google token cuts off every goal on that account, so it waits until the last goal lets go.
  let inbox = "bernz@gmail.com", revoked = 0;
  google = (url) => (url.endsWith("/profile") ? json({ emailAddress: inbox }) : working(url));
  const uncounted = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => { if (String(u).includes("/revoke")) revoked++; return uncounted(u, init); }) as typeof fetch;
  await gmail.finishGmailSignIn("family~car-credit", "code", bernz);
  ok("signing in again to the same inbox keeps its access", revoked === 0);
  await gmail.finishGmailSignIn("family~other", "code", bernz);
  inbox = "other@gmail.com";
  await gmail.finishGmailSignIn("family~other", "code", bernz);
  ok("changing inbox keeps the old access while another goal reads it", revoked === 0);
  inbox = "third@gmail.com";
  await gmail.finishGmailSignIn("family~other", "code", bernz);
  ok("changing inbox cancels the old access once no goal reads it", revoked === 1);
  inbox = "bernz@gmail.com";
  await gmail.finishGmailSignIn("family~other", "code", bernz);
  await gmail.disconnectGmail("family~other", bernz);
  ok("disconnecting keeps the access while another goal reads the inbox", revoked === 2);

  // Linking without Google is for development only; production always signs in.
  await throws("outside development an inbox cannot link without Google", () => gmail.linkGmailInDev("family~dev-link", "bernz@gmail.com", bernz), /Sign in with Google/);
  ok("and nothing was linked", (await gmail.gmailStatus("family~dev-link", bernz)).connection === null);
  ok("status tells the screen to use Google", !(await gmail.gmailStatus("family~dev-link", bernz)).devLink);
  ok("an inbox that signed in can be shared with a goal", await gmail.reuseGmailInbox("family~dev-link", "BERNZ@gmail.com", bernz));
  const [shared, owner] = await Promise.all(["family~dev-link", "family~car-credit"].map(async (e) => (await testDb.select().from(gmailConnections).where(eq(gmailConnections.entry, e)))[0]));
  ok("it uses the same saved access", shared.refreshToken === owner.refreshToken);
  ok("an inbox that never signed in cannot", !(await gmail.reuseGmailInbox("family~dev-other", "never@gmail.com", bernz)));
  await gmail.disconnectGmail("family~dev-link", bernz);
  globalThis.fetch = uncounted;

  google = () => { throw new Error("no network"); };
  ok("Google down is reported", (await gmail.testGmail(bernz, "family~car-credit", "", 30))[0].title === "Reach Google");
  await gmail.disconnectGmail("family~car-credit", bernz);
  ok("sign out removes the inbox even if Google cannot be reached", (await testDb.select().from(gmailConnections)).length === 0);
  globalThis.fetch = real;

  console.log(`\n${passed} passed, ${failed} failed`);
  await pg.close();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
