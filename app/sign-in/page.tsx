import { redirect } from "next/navigation";
import { providers } from "@/auth";
import { SignInForm } from "@/components/screens/sign-in";
import { getViewer } from "@/lib/server/dal";
import { devBypass } from "@/lib/server/dev";
import { AFTER_SIGN_IN } from "@/lib/constants";

export const metadata = { title: "Sign in · eShareGoal", robots: { index: false } };

const OTHER_METHOD = "This email already signs in another way. Use that method.";
interface SignInPageProps {
  searchParams: Promise<{ blocked?: string; error?: string; sent?: string }>;
}
// With the development toggle on nothing sends people here, but the page still opens so it can be worked on.
export default async function SignInPage({ searchParams }: SignInPageProps) {
  if (!devBypass && (await getViewer())) redirect(AFTER_SIGN_IN);
  const q = await searchParams;
  const notice = q.blocked ? "This account cannot sign in. Contact a System Admin." : q.error === "OAuthAccountNotLinked" ? OTHER_METHOD : q.error ? "Could not sign you in. Try again." : undefined;
  return <SignInForm google={providers.google} emailLink={providers.email} notice={notice} sent={!!q.sent} />;
}
