import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { L13Results } from "@/experience/workspace/preview/L13Results";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Results rehearsal", robots: { index: false, follow: false } };
export default async function ResultsPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string; range?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <L13Results {...await searchParams} />;
}
