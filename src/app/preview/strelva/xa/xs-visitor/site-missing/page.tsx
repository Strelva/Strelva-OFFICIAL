import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import SiteNotFound from "@/app/(public)/not-found";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site not found preview", robots: { index: false, follow: false } };

/** The tenant site's not-found, as (public)/not-found.tsx renders it. */
export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { mode } = await searchParams;
  return <XsVisitorFrame mode={mode}><SiteNotFound /></XsVisitorFrame>;
}
