"use client";

import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";

import { StHead, StNotice, StPage } from "@/components/ui/strelva/Kit";
import { XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { ResponsibilityExperience, StandingResponsibilityPicker } from "@/experience/operations/ResponsibilityExperience";
import { ResponsibilityProof } from "@/experience/operations/ResponsibilityProof";
import { InquiryRunning } from "./InquiryRunning";
import type { WorkspaceWork } from "./contracts";

export function WorkspaceOngoing({
  workspaceId,
  sources,
  selectedWork,
  selectedStandingId,
  selectedAssignmentId,
  creatingStanding,
  readOnly,
  newWorkBlocked = false,
  monthlyRecap = false,
  inquiriesEnabled = false,
  initialRequest,
  onCreatingStandingChange,
  onOpenStanding,
  onSaved,
}: {
  workspaceId: string;
  sources: WorkspaceWork[];
  selectedWork: WorkspaceWork | null;
  selectedStandingId: string | null;
  selectedAssignmentId: string | null;
  creatingStanding: boolean;
  readOnly: boolean;
  /** Stop/paused work blocks new commands while leaving owner recovery available. */
  newWorkBlocked?: boolean;
  /** Systems projection confirms this business has a managed website. */
  monthlyRecap?: boolean;
  inquiriesEnabled?: boolean;
  initialRequest?: string;
  onCreatingStandingChange: (creating: boolean) => void;
  onOpenStanding: (id: string) => void;
  onSaved: (id: string) => void;
}) {
  const finiteJobOpen = !selectedStandingId && !selectedAssignmentId && selectedWork?.productId === "operations" && selectedWork.resourceKind === "responsibility";

  const experience = selectedAssignmentId || selectedStandingId || selectedWork?.productId === "operations" || (initialRequest && !creatingStanding) ? <ResponsibilityExperience
    key={`${workspaceId}:${selectedAssignmentId || selectedStandingId || selectedWork?.id || "new"}`}
    workspaceId={workspaceId}
    workId={selectedAssignmentId || selectedStandingId ? undefined : selectedWork?.productId === "operations" ? selectedWork.id : undefined}
    standingId={selectedStandingId || undefined}
    assignmentId={selectedAssignmentId || undefined}
    sources={sources}
    readOnly={readOnly}
    newWorkBlocked={newWorkBlocked}
    initialRequest={initialRequest}
    onSaved={onSaved}
  /> : null;

  // A finite job opened from Requests keeps its own page.
  if (finiteJobOpen) return <StPage>
    <StHead title={selectedWork.title} meta="This has an end. Its steps, decisions and results are below; every request is listed in Requests." />
    {readOnly ? <StNotice>Shared with you. You can read the running work and its results.</StNotice> : null}
    {experience}
  </StPage>;

  // XA · O6: what Strelva keeps true leads; the rest of Running sits in the same column.
  return <ResponsibilityProof key={`proof:${workspaceId}`} workspaceId={workspaceId} readOnly={readOnly || newWorkBlocked}>
    {readOnly ? <XaSays>Shared with you. You can read what is kept true and its evidence.</XaSays>
      : !newWorkBlocked ? <XaSays links={[<XaTextLink key="ask" href={`/workspace?${new URLSearchParams({ workspaceId, view: "help" })}`}>Ask for it</XaTextLink>]}>Want something else kept true? Your agency agrees the scope, limits and deadline before it starts.</XaSays> : null}
    {monthlyRecap ? <XaSays>Monthly recaps appear in {STRELVA_HANDLED_LABEL}, with what was sent, held or did not go through.</XaSays> : null}
    <InquiryRunning key={workspaceId} workspaceId={workspaceId} enabled={inquiriesEnabled} />
    <details open={creatingStanding || Boolean(selectedStandingId)}><summary className="cursor-pointer">Set up a saved check</summary><StandingResponsibilityPicker
      workspaceId={workspaceId}
      sources={sources}
      selectedId={selectedStandingId || undefined}
      readOnly={readOnly}
      newWorkBlocked={newWorkBlocked}
      onCreatingChange={onCreatingStandingChange}
      onOpen={onOpenStanding}
      onCreated={onOpenStanding}
    /></details>
    {experience}
  </ResponsibilityProof>;
}
