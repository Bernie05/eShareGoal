import Link from "next/link";
import { PageHeader } from "@/components/app/primitives";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { screens } from "@/lib/screens";
import { redirect } from "next/navigation";
import { AFTER_SIGN_IN, BASE_PATH } from "@/lib/constants";
import { requireViewer } from "@/lib/server/dal";
import { devBypass } from "@/lib/server/dev";

export default async function PreviewIndex() {
  await requireViewer();
  if (!devBypass) redirect(AFTER_SIGN_IN); // the list of screens is a development tool
  return (
    <>
      <PageHeader title="Design preview" description="Every screen below uses fictional demo data. Add ?state=loading, empty or error to any screen to see those states." actions={<Link href="/signup" className={buttonVariants({ variant: "outline" })}>Sign-up flow</Link>} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {screens.map((s) => (
          <li key={s.slug}>
            <Link href={`${BASE_PATH}/${s.slug}`} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Card className="h-full transition-colors hover:bg-accent/40"><CardContent><p className="font-medium">{s.label}</p><p className="font-mono text-xs text-muted-foreground">${BASE_PATH}/{s.slug}</p></CardContent></Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
