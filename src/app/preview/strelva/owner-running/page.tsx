import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OwnerRunningPreview, type OwnerRunningPreviewState } from "@/experience/workspace/preview/OwnerRunningPreview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional owner Running", robots: { index: false, follow: false } };
export default async function OwnerRunningPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready", mode } = await searchParams;
  if (!["ready", "loading", "empty", "error", "permission"].includes(state)) notFound();
  return <OwnerRunningPreview state={state as OwnerRunningPreviewState} dark={mode === "dark"} />;
}
