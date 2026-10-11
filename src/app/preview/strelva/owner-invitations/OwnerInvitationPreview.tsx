"use client";

import { OwnerInvitationsPanel } from "@/app/admin/clients/[id]/OwnerInvitationsPanel";
import { ownerInvitationPreviewLoad, ownerInvitationPreviewRequest } from "./fixture";

export function OwnerInvitationPreview({ state, delivery }: { state?: string; delivery?: string }) {
  return <OwnerInvitationsPanel tenantId="preview-business" load={ownerInvitationPreviewLoad(state)} request={ownerInvitationPreviewRequest(delivery)} />;
}
