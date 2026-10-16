import { DashNote } from "@/components/dashboard/xa/DashboardXa";
import { XaTextLink } from "@/components/ui/strelva/Xa";

/** Existing owner-entry resolution owns whether this line is shown. A sentence, not a bar. */
export function DashboardBackBar({ businessName, homeHref, route }: { businessName: string; homeHref: string; route: string }) {
  return <span data-owner-entry-back={route} className="contents">
    <DashNote tone="quiet" links={[<XaTextLink key="back" href={homeHref}>Back to {businessName}</XaTextLink>]}>This page is moving into your workspace. Same data either way.</DashNote>
  </span>;
}
