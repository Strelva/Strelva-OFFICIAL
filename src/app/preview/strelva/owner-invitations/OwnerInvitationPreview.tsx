"use client";

import { OwnerInvitationsPanel } from "@/app/admin/clients/[id]/OwnerInvitationsPanel";
import { ownerInvitationPreviewLoad, ownerInvitationPreviewRequest } from "./fixture";
import { SystemsCanonShell } from "@/experience/workspace/preview/SystemsCanonShell";
import { StHead, StPage } from "@/components/ui/strelva/Kit";

export function OwnerInvitationPreview({ state, delivery }: { state?: string; delivery?: string }) {
  return <SystemsCanonShell businessName="Example Law Firm" systemName="Owner invitation" pins={[]} accountName="Invitation reviewer">
    <StPage><StHead title="Invite the business owner" meta="Prepare a private link so the owner can claim their business. No email is sent in this preview." />
      <OwnerInvitationsPanel tenantId="preview-business" load={ownerInvitationPreviewLoad(state)} request={ownerInvitationPreviewRequest(delivery)} />
    </StPage>
  </SystemsCanonShell>;
}
