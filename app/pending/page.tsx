import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getViewer } from "@/lib/server/dal";
import { AFTER_SIGN_IN, SIGN_IN_PATH } from "@/lib/constants";

export const metadata = { title: "Account review · eShareGoal", robots: { index: false } };

const COPY = {
  pending_review: ["Your account is waiting for review", "A System Admin checks new accounts, usually within one working day. We will email you with the result."],
  rejected: ["Your account was not approved", "We emailed you the reason. Contact a System Admin if you think this is a mistake."],
  revoked: ["Your access was removed", "Contact a System Admin if you think this is a mistake."],
} as const;

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(SIGN_IN_PATH);
  if (viewer.status === "active") redirect(AFTER_SIGN_IN);
  const [title, body] = COPY[viewer.status];
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <Card><CardContent className="space-y-4 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning"><Clock className="size-6" aria-hidden /></span>
        <div><h1 className="text-xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{body}</p></div>
        <p className="text-xs text-muted-foreground">Signed in as {viewer.email}</p>
        <form action={signOutAction}><Button type="submit" variant="outline">Sign out</Button></form>
      </CardContent></Card>
    </main>
  );
}
