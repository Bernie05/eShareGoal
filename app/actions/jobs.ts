"use server";

import { run } from "@/lib/server/action";
import { Forbidden } from "@/lib/server/dal";
import { devBypass } from "@/lib/server/dev";
import { runOverdueCheck } from "@/lib/server/overdue";

/** Run now on the overdue check. It covers every loan goal, so it is for a System Admin, or anyone while developing. */
export const overdueRunAction = async () => run((v) => {
  if (!devBypass && v.siteRole !== "admin") throw new Forbidden("Only a System Admin can run this.");
  return runOverdueCheck();
});
