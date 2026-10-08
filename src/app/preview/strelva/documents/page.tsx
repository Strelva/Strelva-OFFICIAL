import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { DocumentHistoryFixture } from "@/experience/workspace/preview/DocumentHistoryFixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared document interface fixture", robots: { index: false, follow: false } };

export default async function DocumentHistoryPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  return <main data-dashboard className="min-h-screen bg-surface-base text-warm-white">
    <p className="mx-auto max-w-3xl px-4 pt-4 text-sm text-gray-muted" role="note">Local rehearsal. This fictional shared document resets when you leave or reload.</p>
    <DocumentHistoryFixture key={state ?? "ready"} state={state ?? "ready"} />
  </main>;
}
