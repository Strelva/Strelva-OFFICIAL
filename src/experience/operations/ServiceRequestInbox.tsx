"use client";

import { StCopy, StTextButton } from "@/components/ui/strelva/Kit";
import { ServiceRequestInbox as ReviewInbox } from "./ServiceRequestReviewInbox";

export function ServiceRequestInbox(props: { providerWorkspaceId?: string; surface?: "admin" | "workspace"; onCount?: (count: number | null) => void }) {
  if (!props.providerWorkspaceId) return <StCopy>Provider work lives in the chosen agency workspace. <StTextButton href="/workspace">Open your agency</StTextButton>. Platform support does not accept client work through operator access.</StCopy>;
  const href = `/workspace/delivery?providerWorkspaceId=${encodeURIComponent(props.providerWorkspaceId)}`;
  return <div className="space-y-4"><StTextButton href={href}>Open accepted deliveries and deadlines</StTextButton><ReviewInbox {...props} /></div>;
}
