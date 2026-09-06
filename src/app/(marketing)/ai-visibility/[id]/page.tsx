import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AiVisibilityPage } from "@/products/ai-visibility";
import { getAiVisibilityResult, recordAiVisibilityResultView } from "@/products/ai-visibility/server";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const stored = await getAiVisibilityResult(id);
  if (!stored) return { title: "AI Visibility scorecard not found | Strelva" };
  const measured = stored.result.readinessMeasured ?? stored.result.measurementStatus !== "unavailable";
  const partial = stored.result.measurementStatus === "partial";
  const title = measured
    ? `${stored.result.business}: ${stored.result.grade} AI Visibility grade`
    : `${stored.result.business}: AI Visibility scorecard`;
  const description = measured
    ? `${partial ? "Partial measurement." : `${stored.result.score}/100.`} ${stored.result.verdict}`
    : `Measurement unavailable. ${stored.result.measurementNote || stored.result.verdict}`;
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function SharedAiVisibilityPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stored = await getAiVisibilityResult(id);
  if (!stored) notFound();
  await recordAiVisibilityResultView(id).catch(() => {});
  return <AiVisibilityPage initialResult={stored.result} scanId={id} workspaceEnabled={workspaceReleaseEnabled()} />;
}
