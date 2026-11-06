"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { devBypass } from "@/lib/server/dev";
import { DEV_AS_COOKIE } from "@/lib/constants";

// Development only: act as another person (View as). Refuses unless the development bypass is on.
export async function viewAsAction(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!devBypass) return { ok: false, error: "View as only works in development (AUTH_DEV_BYPASS)." };
  await ensureDb();
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, String(userId).slice(0, 80))).limit(1);
  if (!u) return { ok: false, error: "That person is not in the database." };
  (await cookies()).set(DEV_AS_COOKIE, u.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true };
}
