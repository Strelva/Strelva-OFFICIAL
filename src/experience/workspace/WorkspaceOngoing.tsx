"use client";

import { ArrowRight } from "lucide-react";
import { ResponsibilityExperience, StandingResponsibilityPicker } from "@/experience/operations/ResponsibilityExperience";
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
  initialRequest,
  onCreatingStandingChange,
  onOpenStanding,
  onOpenWork,
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
  initialRequest?: string;
  onCreatingStandingChange: (creating: boolean) => void;
  onOpenStanding: (id: string) => void;
  onOpenWork: (id: string) => void;
  onSaved: (id: string) => void;
}) {
  const finiteJobs = sources.filter((item) => item.productId === "operations" && item.resourceKind === "responsibility");

  return <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <header>
      <p className="text-sm font-medium text-accent-text">Ongoing</p>
      <h1 className="mt-3 font-display text-4xl font-normal text-warm-black">Work someone is looking after</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-muted">Review repeatable responsibilities, finite jobs, their limits, and the results already recorded.</p>
    </header>

    <StandingResponsibilityPicker
      workspaceId={workspaceId}
      sources={sources}
      selectedId={selectedStandingId || undefined}
      readOnly={readOnly}
      newWorkBlocked={newWorkBlocked}
      onCreatingChange={onCreatingStandingChange}
      onOpen={onOpenStanding}
      onCreated={onOpenStanding}
    />

    {finiteJobs.length ? <section className="rounded-xl border border-gray-border p-4" aria-labelledby="finite-jobs-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 id="finite-jobs-heading" className="font-medium">Finite jobs</h2><span className="text-sm text-gray-muted">{finiteJobs.length}</span></div>
      <ul className="mt-3 divide-y divide-gray-border" role="list">
        {finiteJobs.map((work) => <li key={work.id}><button type="button" className="flex min-h-14 w-full items-center gap-3 py-3 text-left" aria-current={selectedWork?.id === work.id ? "page" : undefined} onClick={() => onOpenWork(work.id)}><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{work.title}</strong><small className="mt-1 block text-xs text-gray-muted">{work.operation?.status === "needs_attention" ? "Needs your decision" : work.operation?.status ? work.operation.status.replaceAll("_", " ") : "Saved job"}</small></span><ArrowRight className="h-4 w-4 shrink-0 text-gray-muted" aria-hidden="true" /></button></li>)}
      </ul>
    </section> : null}

    {selectedAssignmentId || selectedStandingId || selectedWork?.productId === "operations" || !creatingStanding ? <ResponsibilityExperience
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
