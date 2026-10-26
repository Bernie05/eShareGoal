import { redirect } from "next/navigation";

// Design phase only: the real dashboard arrives with the build.
export default function Home() {
  redirect("/design-preview");
}
