import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OwnerRequestPreview, type OwnerRequestPreviewState } from "@/experience/workspace/preview/OwnerRequestPreview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional owner request", robots: { index: false, follow: false } };
export default async function OwnerRequestPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready", mode } = await searchParams;
  if (!["ready", "proposed", "asked", "loading", "empty", "error", "permission", "readonly"].includes(state)) notFound();
  return <OwnerRequestPreview state={state as OwnerRequestPreviewState} dark={mode === "dark"} />;
}
