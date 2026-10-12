import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { businessCheckHref } from "@/products/website-audit/client";
import { getAiVisibilityResult, recordAiVisibilityResultView } from "@/products/ai-visibility/server";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const stored = await getAiVisibilityResult(id);
  if (!stored) return { title: "Business check not found | Strelva" };
  const measured = stored.result.readinessMeasured ?? stored.result.measurementStatus !== "unavailable";
  const partial = stored.result.measurementStatus === "partial";
  const title = measured
    ? `${stored.result.business}: ${stored.result.grade} business check grade`
    : `${stored.result.business}: business check`;
  const description = measured
    ? `${partial ? "Partial measurement." : `${stored.result.score}/100.`} ${stored.result.verdict}`
    : `Measurement unavailable. ${stored.result.measurementNote || stored.result.verdict}`;
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function SharedAiVisibilityPage(
  { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const { id } = await params;
  const stored = await getAiVisibilityResult(id);
  if (!stored) notFound();
  await recordAiVisibilityResultView(id).catch(() => {});
  redirect(businessCheckHref({ ...await searchParams, scan: id }));
}
