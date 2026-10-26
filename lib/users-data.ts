import { activityLog } from "./activity-data";

// FICTIONAL user accounts for the System Admin's Users page. Roles are as seen by the System Admin (Bernz owns Family and Friends).
// New sign-ups must submit a valid ID; they stay "Pending review" until a System Admin approves or rejects them.
export type UserStatus = "Active" | "Pending review" | "Invited" | "Revoked" | "Rejected";
export type IdType = "PhilSys National ID" | "Driver's License" | "Passport" | "UMID" | "Postal ID";
export type Verification = {
  fullName: string; birthdate: string; phone: string; address: string;
  idType: IdType; idNumber: string; idExpiry: string; submitted: string; emailVerified: boolean;
  checks: { label: string; ok: boolean }[]; // automatic checks shown to the reviewer; the decision stays human
};
export type Membership = { group: string; role: "Owner" | "Member" | "Viewer" };
export type User = {
  id: string; name: string; email: string; site: "User" | "System Admin"; status: UserStatus;
  joined: string; lastActive: string; memberships: Membership[]; verification: Verification | null;
  note?: string; history: string[]; // admin decisions, newest first
};

const ok = (label: string) => ({ label, ok: true });
const bad = (label: string) => ({ label, ok: false });
const verified = (fullName: string, idType: IdType, idNumber: string, submitted: string): Verification => ({
  fullName, birthdate: "1990-05-14", phone: "+63 917 000 0000", address: "Quezon City, Metro Manila", idType, idNumber, idExpiry: "2030-12-31", submitted, emailVerified: true,
  checks: [ok("Email confirmed"), ok("ID not expired"), ok("Name matches the ID"), ok("Selfie matches the ID photo")],
});
const u = (id: string, name: string, status: UserStatus, joined: string, lastActive: string, memberships: Membership[], extra: Partial<User> = {}): User =>
  ({ id, name, email: `${id}@example.com`, site: "User", status, joined, lastActive, memberships, verification: null, history: [], ...extra });

export const users: User[] = [
  u("admin", "System Admin", "Active", "2025-10-01", "Today, 9:40 AM", [{ group: "All groups", role: "Viewer" }], { site: "System Admin" }),
  u("bernz", "Bernz", "Active", "2025-10-18", "Today, 8:12 AM", [{ group: "Family", role: "Owner" }, { group: "Friends", role: "Owner" }], { verification: verified("Bernardo Santos", "PhilSys National ID", "•••• •••• 4821", "2025-10-18"), history: ["Oct 18, 2025 · Approved by System Admin"] }),
  u("babylyn", "Babylyn", "Active", "2025-10-18", "Yesterday", [{ group: "Family", role: "Member" }], { verification: verified("Babylyn Santos", "UMID", "••••-•••••••-7710", "2025-10-18"), history: ["Oct 19, 2025 · Approved by System Admin"] }),
  u("billy", "Billy", "Active", "2025-10-20", "Today, 6:30 AM", [{ group: "Family", role: "Member" }], { verification: verified("William Santos", "Driver's License", "N01-••-••3302", "2025-10-20"), history: ["Oct 20, 2025 · Approved by System Admin"] }),
  u("carla", "Carla", "Active", "2026-02-03", "Today, 7:05 AM", [{ group: "Friends", role: "Member" }], { verification: verified("Carla Mendoza", "Passport", "P•••••12A", "2026-02-03"), history: ["Feb 3, 2026 · Approved by System Admin"] }),
  u("dino", "Dino", "Active", "2026-02-03", "Yesterday", [{ group: "Friends", role: "Member" }], { verification: verified("Dino Garcia", "PhilSys National ID", "•••• •••• 9054", "2026-02-03"), history: ["Feb 3, 2026 · Approved by System Admin"] }),
  u("ella", "Ella", "Active", "2026-02-04", "Yesterday", [{ group: "Friends", role: "Member" }], { verification: verified("Ella Navarro", "Postal ID", "PRN ••••••4417", "2026-02-04"), history: ["Feb 4, 2026 · Approved by System Admin"] }),
  u("migs", "Migs", "Active", "2026-02-04", "Oct 2", [{ group: "Friends", role: "Member" }], { verification: verified("Miguel Torres", "UMID", "••••-•••••••-1180", "2026-02-04"), history: ["Feb 5, 2026 · Approved by System Admin"] }),
  // Waiting for review
  u("nico", "Nico Santos", "Pending review", "2026-10-25", "Today, 7:52 AM", [], { verification: verified("Nicolas Santos", "PhilSys National ID", "•••• •••• 3307", "2026-10-25") }),
  u("liza", "Liza Ramos", "Pending review", "2026-10-24", "Yesterday", [], { verification: { ...verified("Liza Ramos", "Driver's License", "D12-••-••8841", "2026-10-24"), checks: [ok("Email confirmed"), ok("ID not expired"), ok("Name matches the ID"), bad("Selfie is blurry; face match could not be checked")] } }),
  u("paolo", "Paolo Uy", "Pending review", "2026-10-23", "Oct 23", [], { verification: { ...verified("Paolo Uy", "Passport", "P•••••77C", "2026-10-23"), idExpiry: "2026-09-30", emailVerified: false, checks: [bad("Email not confirmed yet"), bad("ID expired on Sep 30, 2026"), ok("Name matches the ID"), ok("Selfie matches the ID photo")] } }),
  // Other states
  u("rina", "Rina Cruz", "Invited", "2026-10-21", "Never signed in", [{ group: "Family", role: "Member" }]),
  u("mark", "Mark Tan", "Rejected", "2026-10-10", "Oct 10", [], { verification: { ...verified("Mark Tan", "Postal ID", "PRN ••••••0092", "2026-10-10"), checks: [ok("Email confirmed"), ok("ID not expired"), bad("Name on the ID does not match the account"), ok("Selfie matches the ID photo")] }, note: "Name on the ID does not match the account name.", history: ["Oct 11, 2026 · Rejected by System Admin: name on the ID does not match"] }),
  u("jun", "Jun Reyes", "Revoked", "2025-11-02", "Sep 14", [{ group: "Office Project Team (archived)", role: "Member" }], { verification: verified("Jun Reyes", "UMID", "••••-•••••••-5521", "2025-11-02"), note: "Repeated duplicate entries reported by the group Owner.", history: ["Sep 15, 2026 · Access revoked by System Admin: repeated duplicate entries"] }),
];

/** Records that are about this user (deposits, logs, imports), for the detail view. */
export const recordsAbout = (name: string) => activityLog.filter((a) => a.subject === name).length;
