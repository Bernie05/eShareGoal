// Preview-only role switch. Group roles are Owner (changes anything) and Member (view only);
// System Admin is a site role: auto-joined to every group as a viewer and never counted in members, totals or charts.
export type ViewAs = "owner" | "member" | "admin";
export const VIEW_AS_COOKIE = "esg-view-as-v2"; // v2: renamed so earlier picks reset to the new default
export const viewAsLabel: Record<ViewAs, string> = { owner: "Owner", member: "Member", admin: "System Admin" };
// Default is System Admin: the admin side is designed first.
export const parseViewAs = (v?: string): ViewAs => (v === "owner" || v === "member" ? v : "admin");

// Email delivery: "prod" hands emails to the email provider; "dev" sends nothing and only shows that an email would have gone out.
export type EmailMode = "dev" | "prod";
export const EMAIL_MODE_COOKIE = "esg-email-mode";
export const parseEmailMode = (v?: string): EmailMode => (v === "prod" ? "prod" : "dev");
