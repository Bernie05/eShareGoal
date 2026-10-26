import Link from "next/link";
import { PageHeader } from "@/components/app/primitives";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { screens } from "@/lib/screens";

export default function PreviewIndex() {
  return (
    <>
      <PageHeader title="Design preview" description="Every screen below uses fictional demo data. Add ?state=loading, empty or error to any screen to see those states." actions={<Link href="/signup" className={buttonVariants({ variant: "outline" })}>Sign-up flow</Link>} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {screens.map((s) => (
          <li key={s.slug}>
            <Link href={`/design-preview/${s.slug}`} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Card className="h-full transition-colors hover:bg-accent/40"><CardContent><p className="font-medium">{s.label}</p><p className="font-mono text-xs text-muted-foreground">/design-preview/{s.slug}</p></CardContent></Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
