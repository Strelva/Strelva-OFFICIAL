import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { AssistantsPreview } from "@/experience/workspace/preview/AssistantsPreview";
import type { AssistantViewState } from "@/experience/product/assistants/PublicBusinessProfile";
export const dynamic = "force-dynamic";
export const metadata = { title: "Assistants preview | Strelva", robots: { index: false, follow: false } };
export default async function AssistantsPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  const view: AssistantViewState = state === "loading" || state === "empty" || state === "error" || state === "permission" ? state : "ready";
  return <AssistantsPreview state={view} />;
}
