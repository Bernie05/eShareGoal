"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { createAccount } from "@/lib/server/accounts";
import { UserError } from "@/lib/server/core";
import { AFTER_SIGN_IN, AUTH_PROVIDER, LOGIN_LIMITS, SIGN_IN_PATH } from "@/lib/constants";

// Public on purpose: these run before anyone is signed in, so they do not go through run().
const WRONG = `Wrong email or password. After ${LOGIN_LIMITS.maxFailures} wrong tries, sign-in pauses for ${LOGIN_LIMITS.lockMinutes} minutes.`;
const FAILED = "Something went wrong on our side. Try again.";

export async function signUpAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await createAccount(input);
    return { ok: true };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("[sign-up failed]", e);
    return { ok: false, error: FAILED };
  }
}

/** signIn redirects by throwing, so anything that is not an AuthError must pass through. */
async function attempt(go: () => Promise<unknown>, message: string) {
  try {
    await go();
    return { error: "" };
  } catch (e) {
    if (e instanceof AuthError) return { error: message };
    throw e;
  }
}
export const passwordSignInAction = async (email: string, password: string) => attempt(() => signIn(AUTH_PROVIDER.password, { email, password, redirectTo: AFTER_SIGN_IN }), WRONG);
export const googleSignInAction = async () => attempt(() => signIn(AUTH_PROVIDER.google, { redirectTo: AFTER_SIGN_IN }), FAILED);
export const emailLinkAction = async (email: string) => attempt(() => signIn("resend", { email, redirectTo: AFTER_SIGN_IN }), "Could not send the sign-in link. Check the address and try again.");
export const signOutAction = async () => { await signOut({ redirectTo: SIGN_IN_PATH }); };
