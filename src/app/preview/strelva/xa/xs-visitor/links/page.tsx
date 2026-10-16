import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { SiteLinks } from "@/components/public/SiteLinks";
import { harborLinks } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Link page preview", robots: { index: false, follow: false } };

/** /links as the real SiteLinks renders it. ?state=ready|no-booking|empty */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  const links = state === "empty" ? [] : state === "no-booking" ? harborLinks.filter(link => !link.featured) : harborLinks;
  return <XsVisitorFrame mode={mode}><SiteLinks siteName="Harbor Dental" tagline="Family dentistry with Dr. Amy Lin on Elmwood" links={links} /></XsVisitorFrame>;
}
