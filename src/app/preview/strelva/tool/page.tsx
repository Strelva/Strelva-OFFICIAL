import { SystemsCanonShell } from "@/experience/workspace/preview/SystemsCanonShell";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ApplicationUseFixture } from "@/experience/workspace/preview/ApplicationUseFixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Internal tool recipient fixture", robots: { index: false, follow: false } };

export default async function ToolUsePreview({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <SystemsCanonShell systemName="Mediation intake" mode={mode === "dark" ? "dark" : "light"}>
    <ApplicationUseFixture key={state ?? "ready"} state={state ?? "ready"} />
  </SystemsCanonShell>;
}
