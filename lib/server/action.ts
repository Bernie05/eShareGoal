import "server-only";
import { Forbidden, viewerForAction, type Viewer } from "./dal";
import { UserError } from "./core";

// Every Server Action runs through here: it checks the signed-in user again (a page check does not cover its actions),
// runs the change, and returns only { ok, data } or { ok: false, error } with a message the person can act on.
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export async function run<T>(fn: (viewer: Viewer) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const viewer = await viewerForAction();
    return { ok: true, data: await fn(viewer) };
  } catch (e) {
    if (e instanceof UserError || e instanceof Forbidden) return { ok: false, error: e.message };
    console.error("[action failed]", e);
    return { ok: false, error: "Something went wrong on our side. Nothing was changed; try again." };
  }
}
