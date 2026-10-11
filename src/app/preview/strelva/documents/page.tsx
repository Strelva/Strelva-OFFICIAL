import { SystemsCanonShell } from "@/experience/workspace/preview/SystemsCanonShell";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { DocumentHistoryFixture } from "@/experience/workspace/preview/DocumentHistoryFixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared document interface fixture", robots: { index: false, follow: false } };

export default async function DocumentHistoryPreview({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <SystemsCanonShell systemName="Documents" mode={mode === "dark" ? "dark" : "light"}>
    <DocumentHistoryFixture key={state ?? "ready"} state={state ?? "ready"} />
  </SystemsCanonShell>;
}
