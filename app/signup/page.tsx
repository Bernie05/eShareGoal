import { notFound } from "next/navigation";
import { SignupForm } from "@/components/screens/signup";
import { getEmailMode } from "@/lib/view-as-server";

export const metadata = { title: "Sign up · eShareGoal", robots: { index: false } };

// Design preview of the sign-up flow (ID required, admin review). Hidden in production like the rest of the preview.
export default async function SignupPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_PREVIEW !== "1") notFound();
  return <SignupForm emailMode={await getEmailMode()} />;
}
