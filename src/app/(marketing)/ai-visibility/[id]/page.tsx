import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AiVisibilityPage } from "@/components/marketing/AiVisibilityPage";
import { getAiVisibilityResult, recordAiVisibilityResultView } from "@/lib/ai-visibility/results";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const stored = await getAiVisibilityResult(id);
  if (!stored) return { title: "AI Visibility scorecard not found | Strelva" };
  const title = `${stored.result.business}: ${stored.result.grade} AI Visibility grade`;
  const description = `${stored.result.score}/100. ${stored.result.verdict}`;
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function SharedAiVisibilityPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stored = await getAiVisibilityResult(id);
  if (!stored) notFound();
  await recordAiVisibilityResultView(id).catch(() => {});
  return <AiVisibilityPage initialResult={stored.result} scanId={id} />;
}
