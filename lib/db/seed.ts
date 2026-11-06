// Development seed: FICTIONAL people, two groups, their goals and some months of records, so a fresh development
// database has something to use. Used by the local database on first start (lib/db/index.ts) and by `npm run db:seed`.
// Never for production: callers refuse when NODE_ENV or VERCEL_ENV is production. Safe to run twice (fixed ids).
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "./schema";
import { BABYLYN_EMAIL, BILLY_EMAIL } from "@/lib/constants";

type SeedDb = PgDatabase<PgQueryResultHKT, typeof s>;
const P = 100; // centavos per peso
export const SEED_GROUPS = { family: "00000000-0000-4000-8000-000000000001", friends: "00000000-0000-4000-8000-000000000002" };
const G = SEED_GROUPS;
const goal = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
export const SEED_GOALS = { carCredit: goal(1), emergency: goal(2), fitness: goal(3), vacation: goal(4) };

/** Seeded people anyone can sign in as with the developer sign-in (AUTH_DEV_LOGIN). */
export const SEED_PEOPLE = [
  { id: "seed-admin", name: "Sam Admin", email: "admin@example.com", siteRole: "admin" as const, status: "active" as const, note: "System Admin: sees every group, reviews accounts" },
  { id: "seed-bernz", name: "Bernz", email: "bernz@example.com", siteRole: "user" as const, status: "active" as const, note: "Owner of Family, Member of Friends" },
  { id: "seed-babylyn", name: "Babylyn", email: BABYLYN_EMAIL, siteRole: "user" as const, status: "active" as const, note: "Member of Family" },
  { id: "seed-billy", name: "Billy", email: BILLY_EMAIL, siteRole: "user" as const, status: "active" as const, note: "Member of Family (Car Credit only)" },
  { id: "seed-carla", name: "Carla", email: "carla@example.com", siteRole: "user" as const, status: "active" as const, note: "Owner of Friends" },
  { id: "seed-dino", name: "Dino", email: "dino@example.com", siteRole: "user" as const, status: "active" as const, note: "Member of Friends" },
  { id: "seed-ella", name: "Ella", email: "ella@example.com", siteRole: "user" as const, status: "active" as const, note: "Invited to Family, not joined yet" },
  { id: "seed-nico", name: "Nico Santos", email: "nico@example.com", siteRole: "user" as const, status: "pending_review" as const, note: "New account waiting for review" },
];

export async function seed(db: SeedDb) {
  await db.insert(s.users).values(SEED_PEOPLE.map((p) => ({ id: p.id, name: p.name, email: p.email, siteRole: p.siteRole, status: p.status, emailVerified: new Date("2025-10-18") }))).onConflictDoNothing();
  await db.insert(s.groups).values([
    { id: G.family, name: "Family", description: "Car Credit, savings and fitness for the Santos family.", createdBy: "seed-bernz" },
    { id: G.friends, name: "Friends", description: "Barkada trips and challenges.", createdBy: "seed-carla" },
  ]).onConflictDoNothing();
  await db.insert(s.groupMembers).values([
    { groupId: G.family, userId: "seed-bernz", role: "owner" },
    { groupId: G.family, userId: "seed-babylyn", role: "member" },
    { groupId: G.family, userId: "seed-billy", role: "member", allGoals: false },
    { groupId: G.friends, userId: "seed-carla", role: "owner" },
    { groupId: G.friends, userId: "seed-bernz", role: "member" },
    { groupId: G.friends, userId: "seed-dino", role: "member" },
  ]).onConflictDoNothing();
  await db.insert(s.goals).values([
    { id: goal(1), groupId: G.family, name: "Car Credit", kind: "loan", measure: "money", target: 1_200_000 * P, startsOn: "2025-11-05", createdBy: "seed-bernz",
      about: "Monthly installments for the family car, shared by three members.", details: { "Monthly installment": "₱20,000", Term: "60 months", Lender: "Sample Bank" } },
    { id: goal(2), groupId: G.family, name: "Emergency Fund", kind: "savings", measure: "money", target: 300_000 * P, startsOn: "2026-01-01", createdBy: "seed-bernz", about: "Six months of expenses, saved together." },
    { id: goal(3), groupId: G.family, name: "Family Fitness", kind: "fitness", measure: "count", scope: "each", target: 20, createdBy: "seed-bernz", about: "20 workouts a month each." },
    { id: goal(4), groupId: G.friends, name: "Vacation Fund", kind: "savings", measure: "money", target: 100_000 * P, startsOn: "2026-03-01", createdBy: "seed-carla", about: "Saving for the Siargao trip." },
  ]).onConflictDoNothing();
  await db.insert(s.goalMembers).values([
    { goalId: goal(1), userId: "seed-bernz", share: 10_000 * P }, { goalId: goal(1), userId: "seed-babylyn", share: 6_000 * P }, { goalId: goal(1), userId: "seed-billy", share: 4_000 * P },
  ]).onConflictDoNothing();

  // Car Credit: six months of shares paid in, and the installments paid out to the lender.
  let n = 0;
  const id = () => `00000000-0000-4000-8000-0000000002${String(++n).padStart(2, "0")}`;
  const months = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const recs: (typeof s.records.$inferInsert)[] = [];
  for (const [i, m] of months.entries()) {
    for (const [who, pesos] of [["bernz", 10_000], ["babylyn", 6_000], ["billy", 4_000]] as const) {
      if (m === "2026-10" && who === "billy") continue; // Billy has not paid October yet
      recs.push({ id: id(), goalId: goal(1), memberId: `seed-${who}`, day: `${m}-0${(i % 3) + 1}`, amount: pesos * P, direction: "in", kind: "deposit", method: "Bank transfer", ref: `DEMO-${who.slice(0, 2).toUpperCase()}${m.replace("-", "")}`, createdBy: "seed-bernz" });
    }
    recs.push({ id: id(), goalId: goal(1), memberId: null, day: `${m}-05`, amount: 20_000 * P, direction: "out", kind: "loan_payment", method: "Auto-debit", note: "Monthly installment", createdBy: "seed-bernz" });
  }
  recs.push(
    { id: id(), goalId: goal(2), memberId: "seed-bernz", day: "2026-09-15", amount: 25_000 * P, direction: "in", kind: "deposit", method: "Bank transfer", createdBy: "seed-bernz" },
    { id: id(), goalId: goal(2), memberId: "seed-babylyn", day: "2026-10-01", amount: 5_000 * P, direction: "in", kind: "deposit", method: "GCash", createdBy: "seed-bernz" },
    { id: id(), goalId: goal(3), memberId: "seed-bernz", day: "2026-10-20", amount: 12, note: "October workouts", createdBy: "seed-bernz" },
    { id: id(), goalId: goal(3), memberId: "seed-babylyn", day: "2026-10-20", amount: 16, note: "October workouts", createdBy: "seed-bernz" },
    { id: id(), goalId: goal(4), memberId: "seed-dino", day: "2026-10-05", amount: 2_500 * P, direction: "in", kind: "deposit", method: "GCash", createdBy: "seed-carla" },
    { id: id(), goalId: goal(4), memberId: "seed-bernz", day: "2026-10-07", amount: 3_000 * P, direction: "in", kind: "deposit", method: "Bank transfer", createdBy: "seed-carla" },
  );
  await db.insert(s.records).values(recs).onConflictDoNothing();

  // Ella has an open invitation to Family; Billy asked to join Family Fitness.
  await db.insert(s.groupInvites).values({ id: "00000000-0000-4000-8000-000000000301", groupId: G.family, email: "ella@example.com", invitedBy: "seed-bernz" }).onConflictDoNothing();
  await db.insert(s.goalJoinRequests).values({ id: "00000000-0000-4000-8000-000000000401", goalId: goal(3), userId: "seed-billy" }).onConflictDoNothing();
  return { people: SEED_PEOPLE.length, records: recs.length };
}
