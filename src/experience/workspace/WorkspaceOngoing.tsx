"use client";

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

  return <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    {finiteJobOpen ? <header>
      <p className="text-sm font-medium text-accent-text">Request</p>
      <h1 className="mt-3 font-display text-4xl font-normal text-warm-black">{selectedWork.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-muted">This has an end. Its steps, decisions and results are below; every request is listed in Requests.</p>
    </header> : <header>
      <p className="text-sm font-medium text-accent-text">Running</p>
      <h1 className="mt-3 font-display text-4xl font-normal text-warm-black">What Strelva keeps running</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-muted">Each one is named by what it keeps true. Strelva acts within the access you have given, asks when it can’t, and records every run.</p>
    </header>}

    {!finiteJobOpen && monthlyRecap ? <p className="rounded-2xl border border-gray-border bg-white p-4 text-sm text-warm-black">Strelva sends you a monthly recap. Each send, hold or failure is recorded in Strelva handled.</p> : null}
    {finiteJobOpen ? null : <InquiryRunning key={workspaceId} workspaceId={workspaceId} enabled={inquiriesEnabled} />}

    {finiteJobOpen ? null : <ResponsibilityProof key={`proof:${workspaceId}`} workspaceId={workspaceId} readOnly={readOnly || newWorkBlocked} />}

    {finiteJobOpen ? null : <StandingResponsibilityPicker
      workspaceId={workspaceId}
      sources={sources}
      selectedId={selectedStandingId || undefined}
      readOnly={readOnly}
      newWorkBlocked={newWorkBlocked}
      onCreatingChange={onCreatingStandingChange}
      onOpen={onOpenStanding}
      onCreated={onOpenStanding}
    />}

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
  </div>;
}
