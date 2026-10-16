import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { SiteErrorPreview } from "@/experience/workspace/preview/SiteErrorPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site error preview", robots: { index: false, follow: false } };

/** The tenant site's error boundary, as (public)/error.tsx renders it. Try again does nothing here. */
export default async function Page() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <XsVisitorFrame><SiteErrorPreview /></XsVisitorFrame>;
}
