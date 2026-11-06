import { redirect } from "next/navigation";
import { SignupForm } from "@/components/screens/signup";
import { AFTER_SIGN_IN } from "@/lib/constants";
import { getViewer } from "@/lib/server/dal";
import { devBypass } from "@/lib/server/dev";
import { getEmailMode } from "@/lib/view-as-server";

export const metadata = { title: "Sign up · eShareGoal", robots: { index: false } };

// Sign-up: creates the account, which waits for a System Admin. With the development toggle on it still opens, so it can be worked on.
export default async function SignupPage() {
  if (!devBypass && (await getViewer())) redirect(AFTER_SIGN_IN);
  return <SignupForm emailMode={await getEmailMode()} />;
}
