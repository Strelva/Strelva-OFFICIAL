import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { NeedsYouRecoveryPreview } from "@/experience/workspace/preview/NeedsYouRecoveryPreview";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional decision recovery", robots: { index: false, follow: false } };
export default async function NeedsYouRecoveryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== "development" || !strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  if (Object.keys(params).some(key => key !== "view") || (params.view !== "home" && params.view !== "needs-you")) notFound();
  return <NeedsYouRecoveryPreview view={params.view} />;
}
