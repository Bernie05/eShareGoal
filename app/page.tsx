import { AFTER_SIGN_IN } from "@/lib/constants";
import { redirect } from "next/navigation";

export default function Home() {
  redirect(AFTER_SIGN_IN);
}
