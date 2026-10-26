import { cookies } from "next/headers";
import { EMAIL_MODE_COOKIE, parseEmailMode, parseViewAs, VIEW_AS_COOKIE } from "./view-as";

export async function getViewAs() {
  return parseViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value);
}

export async function getEmailMode() {
  return parseEmailMode((await cookies()).get(EMAIL_MODE_COOKIE)?.value);
}
