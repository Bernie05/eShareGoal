import type { CreatedGoal } from "./created-goals";
import type { CreatedGroup } from "./view-as";

// FICTIONAL demo: a walking club with Bernz (Owner) and 4 dummy members, and a "10,000 km each" goal
// with six months of walks. Loaded on demand from My Groups; it is an ordinary created group afterwards.
export const WALKING_PEOPLE = [
  { email: "ana.cruz@example.com", name: "Ana Cruz", monthly: 1300 },
  { email: "ben.reyes@example.com", name: "Ben Reyes", monthly: 900 },
  { email: "carlo.santos@example.com", name: "Carlo Santos", monthly: 1650 },
  { email: "dana.lim@example.com", name: "Dana Lim", monthly: 1800 },
];
const BERNZ_MONTHLY = 1700;

export const walkingGroup: CreatedGroup = {
  id: "my-walking-club-demo", name: "Walking Club", description: "Morning walks around the village. Everyone aims for 10,000 km.",
  created: "2026-05-01", by: "Bernz", invites: WALKING_PEOPLE.map((p) => p.email), joined: WALKING_PEOPLE.map((p) => p.email), owners: [],
};

export const walkingGoal: CreatedGoal = {
  id: "goal-walk-10000-km-demo", name: "Walk 10,000 km", groupId: walkingGroup.id, templateId: "fitness", status: "Active", created: "2026-05-01", scope: "each",
  template: {
    name: "Fitness and Health", icon: "dumbbell", measure: "count",
    fields: [{ label: "Target per member", kind: "number", required: true }, { label: "Unit (kg, workouts…)", kind: "text", required: true }, { label: "End date", kind: "date", required: false }],
    widgets: ["stats", "progress", "checkins", "leaderboard", "records"],
  },
  values: { "Target per member": "10000", "Unit (kg, workouts…)": "km", "End date": "2026-12-31" },
};

// Six months of walks per person; the monthly amounts vary but add up to six times the person's average.
const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const SHAPE = [0.8, 1, 1.1, 0.9, 1.2, 1];
export const walkingRecords = [{ name: "Bernz", monthly: BERNZ_MONTHLY }, ...WALKING_PEOPLE].flatMap((p, i) =>
  MONTHS.map((m, j) => ({
    id: `r-walk-${i}-${j}`, member: p.name, date: `${m}-${String(10 + i * 3).padStart(2, "0")}`,
    amount: Math.round(p.monthly * SHAPE[j]), note: j === 4 ? "Long walks this month" : "",
  })),
);
