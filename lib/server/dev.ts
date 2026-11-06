import "server-only";
import { cookies } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { DEV_AS_COOKIE } from "@/lib/constants";

// Development bypass: no sign-in screen, and a "View as" switch to act as anyone in the database.
// On only when AUTH_DEV_BYPASS=true and neither NODE_ENV nor VERCEL_ENV is production: production always signs in.
// The chosen person is kept in a cookie (esg-dev-as) until switched; with none, AUTH_DEV_AS or the first System Admin.
export const devBypass = process.env.AUTH_DEV_BYPASS === "true" && process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";

/** Who the bypass acts as: the switched-to person, AUTH_DEV_AS, or the first active System Admin. Null when off. */
export async function devUserId(): Promise<string | null> {
  if (!devBypass) return null;
  const chosen = (await cookies()).get(DEV_AS_COOKIE)?.value ?? process.env.AUTH_DEV_AS;
  if (chosen) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, chosen)).limit(1);
    if (u) return u.id;
  }
  const [admin] = await db.select({ id: users.id }).from(users).where(and(eq(users.siteRole, "admin"), eq(users.status, "active"))).orderBy(asc(users.createdAt)).limit(1);
  return admin?.id ?? null;
}

/** Everyone the View as switch can pick (development only). */
export async function devPeople() {
  if (!devBypass) return [];
  return db.select({ id: users.id, name: users.name, email: users.email, siteRole: users.siteRole, status: users.status }).from(users).orderBy(asc(users.siteRole), asc(users.name)).limit(100);
}
