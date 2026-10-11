import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OwnerDecisionPreview } from "@/experience/workspace/preview/OwnerDecisionPreview";
import type { OwnerDecisionPreviewState } from "@/experience/workspace/preview/owner-decision-fixture";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional owner decision", robots: { index: false, follow: false } };
export default async function OwnerDecisionPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "ready", mode = "light", view = "decision", ...unknown } = await searchParams;
  if (Object.keys(unknown).length || !["ready", "loading", "empty", "error", "permission"].includes(state) || !["light", "dark"].includes(mode) || !["decision", "receipts"].includes(view)) notFound();
  return <OwnerDecisionPreview state={state as OwnerDecisionPreviewState} dark={mode === "dark"} view={view as "decision" | "receipts"} />;
}
