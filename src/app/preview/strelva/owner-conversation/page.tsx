import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OwnerConversationPreview } from "@/experience/workspace/preview/OwnerConversationPreview";
import { OWNER_CONVERSATION_FRAMES, type OwnerConversationFrame, type OwnerConversationState } from "@/experience/workspace/preview/owner-conversation-fixture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fictional owner conversation", robots: { index: false, follow: false } };

export default async function OwnerConversationPage({ searchParams }: { searchParams: Promise<{ frame?: string; state?: string; mode?: string }> }) {
  if (process.env.NODE_ENV !== "development" || !strelvaUiPreviewEnabled()) notFound();
  const params = await searchParams;
  const frame = params.frame ?? "Y2Tn3F";
  const state = params.state ?? "ready";
  if (!OWNER_CONVERSATION_FRAMES.includes(frame as OwnerConversationFrame) || !["ready", "empty", "loading", "error", "permission"].includes(state) || (params.mode && params.mode !== "dark" && params.mode !== "light")) notFound();
  return <OwnerConversationPreview frame={frame as OwnerConversationFrame} state={state as OwnerConversationState} mode={params.mode === "dark" ? "dark" : "light"} />;
}
