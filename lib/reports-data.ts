// FICTIONAL reports for the System Admin: problems people reported, reports about users, and problems the system found itself.
export type ReportType = "Issue" | "User report" | "Payment dispute" | "Sign-up flag" | "System";
export type ReportStatus = "Open" | "In review" | "Resolved" | "Dismissed";
export type Priority = "High" | "Medium" | "Low";
export type Report = {
  id: string; type: ReportType; title: string; body: string; by: string; group: string | null;
  about: { user?: string; ref?: string }; priority: Priority; status: ReportStatus; created: string; timeline: string[];
};

export const reports: Report[] = [
  { id: "R-1048", type: "Payment dispute", title: "My deposit might be recorded twice", body: "I sent ₱12,000 once on Oct 24 but I got two emails. Please check that it was not counted twice.", by: "Billy", group: "Family / Car Credit", about: { user: "billy", ref: "DEMO-BE2410" }, priority: "High", status: "Open", created: "Oct 26, 2026, 8:20 AM", timeline: ["Oct 26, 8:20 AM · Reported by Billy"] },
  { id: "R-1047", type: "User report", title: "Wrong check-ins for the fitness challenge", body: "Migs asked me to log days he did not work out. I want an admin to look at it.", by: "Carla", group: "Friends / 30-Day Fitness Challenge", about: { user: "migs" }, priority: "Medium", status: "Open", created: "Oct 25, 2026, 9:02 PM", timeline: ["Oct 25, 9:02 PM · Reported by Carla"] },
  { id: "R-1046", type: "Sign-up flag", title: "Expired passport submitted", body: "The automatic check found an ID that expired on Sep 30, 2026. The email address is not confirmed either.", by: "System", group: null, about: { user: "paolo" }, priority: "Medium", status: "Open", created: "Oct 23, 2026, 9:31 AM", timeline: ["Oct 23, 9:31 AM · Flagged by the sign-up checks"] },
  { id: "R-1045", type: "Issue", title: "Cannot upload my ID photo from my phone", body: "The upload keeps spinning on my phone. I had to take a blurry selfie instead.", by: "Liza Ramos", group: null, about: { user: "liza" }, priority: "Medium", status: "Open", created: "Oct 24, 2026, 6:15 PM", timeline: ["Oct 24, 6:15 PM · Reported by Liza Ramos"] },
  { id: "R-1044", type: "System", title: "Monthly summary email failed", body: "The Oct 1 run could not reach the email service. It retries on Nov 1.", by: "System", group: "Family", about: {}, priority: "Medium", status: "In review", created: "Oct 1, 2026, 7:01 AM", timeline: ["Oct 1, 7:01 AM · Job failed", "Oct 2, 10:00 AM · Review started by System Admin"] },
  { id: "R-1043", type: "Issue", title: "Chart shows the wrong month", body: "On the dashboard my October deposit showed under September.", by: "Ella", group: "Friends / Vacation Fund", about: { user: "ella" }, priority: "Low", status: "Resolved", created: "Oct 16, 2026, 1:40 PM", timeline: ["Oct 16, 1:40 PM · Reported by Ella", "Oct 17, 9:00 AM · Resolved by System Admin: timezone fix released"] },
  { id: "R-1041", type: "User report", title: "Duplicate entries in the office group", body: "Jun keeps entering the same expense several times.", by: "Bernz", group: "Office Project Team", about: { user: "jun" }, priority: "High", status: "Resolved", created: "Sep 14, 2026, 4:05 PM", timeline: ["Sep 14, 4:05 PM · Reported by Bernz", "Sep 15, 9:30 AM · Resolved by System Admin: access revoked"] },
  { id: "R-1040", type: "Issue", title: "Import matched the wrong member", body: "An import picked Billy for a deposit from Babylyn.", by: "Bernz", group: "Family / Car Credit", about: { ref: "DEMO-XX0991" }, priority: "Medium", status: "Dismissed", created: "Oct 23, 2026, 6:00 PM", timeline: ["Oct 23, 6:00 PM · Reported by Bernz", "Oct 24, 8:00 AM · Dismissed by System Admin: the import was still waiting for review, nothing was recorded"] },
];

export const openReports = reports.filter((r) => r.status === "Open").length;
