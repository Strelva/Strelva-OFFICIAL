import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ApplicationUseFixture } from "@/experience/workspace/preview/ApplicationUseFixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Internal tool recipient fixture", robots: { index: false, follow: false } };

export default async function ToolUsePreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  return <main className="min-h-screen bg-surface-base text-warm-black">
    <p className="mx-auto max-w-5xl px-4 pt-4 text-sm text-gray-muted" role="note">Local rehearsal. This fictional tool has no network or saved business records and resets on reload.</p>
    <ApplicationUseFixture key={state ?? "ready"} state={state ?? "ready"} />
  </main>;
}
