import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ManagedPreview } from "@/components/dashboard/ManagedPreview";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

export default async function ManagedPreviewPage({ params }: { params: Promise<{ path: string[] }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { path } = await params;
  if (path[0] !== "dashboard") notFound();
  return <Suspense fallback={<p>Loading local preview…</p>}><ManagedPreview /></Suspense>;
}
