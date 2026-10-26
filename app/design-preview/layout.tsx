import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { getEmailMode, getViewAs } from "@/lib/view-as-server";

export const metadata = { title: "Design preview · eShareGoal", robots: { index: false } };

// Dev-only: the preview must never ship to production.
export default async function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_PREVIEW !== "1") notFound();
  return <Suspense fallback={null}><AppShell viewAs={await getViewAs()} emailMode={await getEmailMode()}>{children}</AppShell></Suspense>;
}
