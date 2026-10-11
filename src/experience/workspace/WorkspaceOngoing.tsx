"use client";

import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";

import { StHead, StNotice, StPage, StPillLink, StSection } from "@/components/ui/strelva/Kit";
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

  return <StPage>
    <StHead title={finiteJobOpen ? selectedWork.title : "Running"}
      meta={finiteJobOpen
        ? "This has an end. Its steps, decisions and results are below; every request is listed in Requests."
        : "What stays true for your business. Each one is named by its result, with its scope and latest evidence below."}
    />
    {readOnly ? <StNotice>Shared with you. You can read the running work and its results.</StNotice> : null}
    {!finiteJobOpen && monthlyRecap ? <StNotice>Monthly recap records appear in {STRELVA_HANDLED_LABEL}, including recorded sends, holds and failures.</StNotice> : null}
    {finiteJobOpen ? null : <StSection title="What should stay true?"
      meta="Describe the result you want kept true. Your agency agrees the scope, limits and deadline before the request becomes accepted work."
      action={!readOnly && !newWorkBlocked ? <StPillLink href={`/workspace?${new URLSearchParams({ workspaceId, view: "help" })}`}>Request an ongoing result</StPillLink> : undefined}
    >{null}</StSection>}
    {finiteJobOpen ? null : <InquiryRunning key={workspaceId} workspaceId={workspaceId} enabled={inquiriesEnabled} />}

    {finiteJobOpen ? null : <details open={creatingStanding || Boolean(selectedStandingId)}><summary className="cursor-pointer">Configure a supported saved check</summary><StandingResponsibilityPicker
      workspaceId={workspaceId}
      sources={sources}
      selectedId={selectedStandingId || undefined}
      readOnly={readOnly}
      newWorkBlocked={newWorkBlocked}
      onCreatingChange={onCreatingStandingChange}
      onOpen={onOpenStanding}
      onCreated={onOpenStanding}
    /></details>}

    {finiteJobOpen ? null : <StSection title="What the last seven days show"><ResponsibilityProof key={`proof:${workspaceId}`} workspaceId={workspaceId} readOnly={readOnly || newWorkBlocked} /></StSection>}

    {selectedAssignmentId || selectedStandingId || selectedWork?.productId === "operations" || (initialRequest && !creatingStanding) ? <ResponsibilityExperience
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
    /> : null}
  </StPage>;
}
