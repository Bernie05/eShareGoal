import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { devBypass } from "@/lib/server/dev";
import { getAccount, getCreatedGoals, getCreatedGroups, getEmailMode, getIdentity } from "@/lib/view-as-server";

export const metadata = { title: "Design preview · eShareGoal", robots: { index: false } };

interface PreviewLayoutProps {
  children: React.ReactNode;
}
// Who may open a screen is decided on each page (requireViewer), because a layout does not run again on navigation.
export default async function PreviewLayout({ children }: PreviewLayoutProps) {
  return <Suspense fallback={null}><AppShell dev={devBypass} identity={await getIdentity()} account={await getAccount()} emailMode={await getEmailMode()} createdGroups={await getCreatedGroups()} createdGoals={await getCreatedGoals()}>{children}</AppShell></Suspense>;
}
