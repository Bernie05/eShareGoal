import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, ensureDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AUTH_PROVIDER, LOGIN_LIMITS, SIGN_IN_PATH } from "@/lib/constants";
import { audit, parse, sendMail, UserError } from "./core";

// Accounts with a password. Passwords are stored only as salted scrypt hashes. Every new password account waits for a System Admin:
// sign-up does not prove the email is theirs, so ADMIN_EMAILS and the password only count once the inbox is proven (emailProven).
// Wrong passwords are counted per account, and sign-in pauses after too many.

const derive = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;
const KEY_LENGTH = 64;
const PREFIX = "s1";

export const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return [PREFIX, salt.toString("base64url"), (await derive(password, salt, KEY_LENGTH)).toString("base64url")].join(".");
}
async function passwordMatches(password: string, stored: string) {
  const [prefix, salt, key] = stored.split(".");
  if (prefix !== PREFIX || !salt || !key) return false;
  const want = Buffer.from(key, "base64url");
  return timingSafeEqual(await derive(password, Buffer.from(salt, "base64url"), want.length), want);
}

const signupInput = z.object({
  name: z.string().trim().min(3, "Enter your full name as it appears on your ID.").max(80),
  email: z.email("Enter a valid email address, like juan@example.com.").max(254).transform((e) => e.toLowerCase()),
  phone: z.string().trim().regex(/^(\+63|0)9\d{9}$/, "Enter a Philippine mobile number, like 0917 123 4567."),
  password: z.string().min(LOGIN_LIMITS.passwordMin, `Use at least ${LOGIN_LIMITS.passwordMin} characters.`).max(LOGIN_LIMITS.passwordMax),
});
/** Sign-up. Everyone waits for review, listed admins too: anyone can type an address here. */
export async function createAccount(input: unknown) {
  await ensureDb();
  const v = parse(signupInput, input);
  const added = await db.insert(users).values({ ...v, passwordHash: await hashPassword(v.password) }).onConflictDoNothing().returning({ id: users.id });
  if (!added.length) throw new UserError("An account with this email already exists. Sign in instead.");
  await sendMail(v.email, "We received your eShareGoal sign-up", adminEmails().includes(v.email) ? "To open this System Admin account, sign in with an email link. From then on, use the link instead of a password." : "A System Admin will review your account. We will email you with the result.");
  for (const to of adminEmails()) await sendMail(to, "New eShareGoal sign-up to review", `${v.name} (${v.email}) is waiting for approval. Open Users to review it.`);
}

/** Someone just proved they hold this inbox: an email link, or a new account from Google with a verified address.
 *  A password set before that proof came from whoever typed this address at sign-up, so it stops working (passwordSessionEnded ends its sessions).
 *  A listed admin still under review becomes a System Admin. */
export async function emailProven(address: string) {
  const email = address.toLowerCase();
  const [u] = await db.select({ id: users.id, verified: users.emailVerified, hash: users.passwordHash, status: users.status }).from(users).where(eq(users.email, email)).limit(1);
  if (!u) return;
  const clearPassword = !!u.hash && !u.verified, admin = u.status === "pending_review" && adminEmails().includes(email);
  if (!clearPassword && !admin) return;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ ...(clearPassword && { passwordHash: null, failedLogins: 0, lockedUntil: null }), ...(admin && { siteRole: "admin" as const, status: "active" as const }) }).where(eq(users.id, u.id));
    await audit({ actorId: u.id, action: "account.email_proven", detail: { clearPassword, admin } }, tx);
  });
}

interface SignInCheck {
  email?: string | null;
  provider?: string;
  type?: string;
  /** Google's own word that this person holds the address. */
  googleVerified?: boolean;
  /** true while only asking for an email link: nothing is proven until it is opened. */
  verificationRequest?: boolean;
}
/** Runs before every sign-in. Revoked and rejected accounts cannot sign in; everyone else can (pending ones see the review screen). */
export async function allowSignIn({ email, provider, type, googleVerified, verificationRequest }: SignInCheck) {
  if (!email || (provider === AUTH_PROVIDER.google && !googleVerified)) return false;
  const [row] = await db.select({ status: users.status }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (row?.status === "revoked" || row?.status === "rejected") return `${SIGN_IN_PATH}?blocked=1`;
  if (type === "email" && !verificationRequest) await emailProven(email);
  return true;
}

interface PasswordInput { email: string; password: string }
/** The account these details open, or null. The answer never says whether the email exists or the account is paused. */
export async function checkPassword({ email, password }: PasswordInput) {
  await ensureDb();
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email, hash: users.passwordHash, failed: users.failedLogins, lockedUntil: users.lockedUntil }).from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  if (!u?.hash) { await hashPassword(password); return null; } // the same work as a real check, so timing gives nothing away
  if (u.lockedUntil && u.lockedUntil > new Date()) return null;
  if (!(await passwordMatches(password, u.hash))) {
    const failed = u.failed + 1, lock = failed >= LOGIN_LIMITS.maxFailures;
    await db.update(users).set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOGIN_LIMITS.lockMinutes * 60_000) : null }).where(eq(users.id, u.id));
    return null;
  }
  if (u.failed || u.lockedUntil) await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
  return { id: u.id, name: u.name, email: u.email };
}
