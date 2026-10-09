import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WebsiteEntryPreview } from "@/experience/websites/WebsiteEntryPreview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website entry fixture", robots: { index: false, follow: false } };

export default async function WebsiteEntryPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  const recovery = params.recovery === "progress" || params.recovery === "pending" ? params.recovery : undefined;
  if (params.recovery !== undefined && (process.env.NODE_ENV !== "development" || !recovery)) notFound();
  return <div data-dashboard className="min-h-screen bg-surface-base"><WebsiteEntryPreview entry={params.entry ?? null} state={params.state ?? "ready"} recovery={recovery} /></div>;
}
