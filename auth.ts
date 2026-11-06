import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { ensureDb } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { allowSignIn, checkPassword, emailProven } from "@/lib/server/accounts";
import { AUTH_PROVIDER, SIGN_IN_PATH } from "@/lib/constants";

// Sign-in: email and password, Google, a one-time link by email (Resend), and in development a "developer sign-in" that picks a seeded person.
// The session is a signed token holding only the user id; who they are now (status, site role) is read from the
// database on every request (lib/server/dal.ts), so approving, rejecting or revoking someone takes effect at once.
// Env (see .env.example): AUTH_SECRET, AUTH_GOOGLE_ID/SECRET, AUTH_RESEND_KEY, AUTH_EMAIL_FROM, ADMIN_EMAILS, AUTH_DEV_LOGIN.
export const devLogin = process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
export const providers = { google: !!process.env.AUTH_GOOGLE_ID, email: !!process.env.AUTH_RESEND_KEY, dev: devLogin };

export const { handlers, auth, signIn, signOut } = NextAuth(async (): Promise<NextAuthConfig> => {
  const db = await ensureDb();
  return {
    adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
    session: { strategy: "jwt" },
    trustHost: true,
    providers: [
      Credentials({
        id: AUTH_PROVIDER.password, name: "Email and password", credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
        authorize: (c) => (typeof c?.email === "string" && typeof c.password === "string" ? checkPassword({ email: c.email, password: c.password }) : null),
      }),
      ...(providers.google ? [Google] : []),
      ...(providers.email ? [Resend({ from: process.env.AUTH_EMAIL_FROM ?? "eShareGoal <no-reply@example.com>" })] : []),
      ...(devLogin ? [Credentials({
        id: "dev", name: "Developer sign-in", credentials: { userId: { label: "Person" } },
        // Development only: sign in as any seeded person without a password.
        async authorize(c) {
          const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, String(c?.userId ?? ""))).limit(1);
          return u ?? null;
        },
      })] : []),
    ],
    pages: { signIn: SIGN_IN_PATH, verifyRequest: `${SIGN_IN_PATH}?sent=1`, error: SIGN_IN_PATH },
    callbacks: {
      signIn: ({ user, account, profile, email }) => allowSignIn({ email: user.email, provider: account?.provider, type: account?.type, googleVerified: profile?.email_verified === true, verificationRequest: email?.verificationRequest }),
      // method: how this session was opened, so a session opened with a password ends with that password (lib/server/dal.ts).
      async jwt({ token, user, account }) { if (user?.id) token.sub = user.id; if (account) token.method = account.provider; return token; },
      async session({ session, token }) { if (token.sub) session.user.id = token.sub; session.method = token.method; return session; },
    },
    events: {
      // A new account only comes from a proven inbox (an email link, or Google's verified address): see allowSignIn.
      async createUser({ user }) { if (user.email) await emailProven(user.email); },
    },
  };
});
