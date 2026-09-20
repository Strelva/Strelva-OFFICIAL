import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoundedWorkExperience } from "@/experience/operations/BoundedWorkExperience";
import { WorkspaceLayout } from "@/experience/workspace/WorkspaceLayout";
import { workspaceExitBlocksChanges, workspaceExitIsStopped } from "@/experience/workspace/workspace-exit-ui";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";
import type { WorkspaceExitState } from "@/platform/workspace-exit/contracts";

const exitState: WorkspaceExitState = {
  id: "33333333-3333-4333-8333-333333333333",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  status: "completed",
  requestedAt: "2026-09-20T14:00:00.000Z",
  completedAt: "2026-09-20T14:00:01.000Z",
  requestedBy: "44444444-4444-4444-8444-444444444444",
  futureWork: "cancelled",
  providerParticipation: "kept",
  maintainedResources: { kind: "stopped" },
  summary: {
    standingPaused: 0,
    standingRevoked: 0,
    scheduledPaused: 0,
    scheduledCancelled: 0,
    assignmentsRevoked: 0,
    providerDeliveriesRevoked: 0,
    investigationsPaused: 0,
    retainedAccepted: 0,
    retainedUnknown: 0,
  },
  retainedObligations: [],
  resources: [],
};

describe("workspace exit presentation", () => {
  it("treats any completed exit as stopped work", () => {
    expect(workspaceExitIsStopped(null)).toBe(false);
    expect(workspaceExitIsStopped(null, "completed")).toBe(true);
    expect(workspaceExitIsStopped(exitState)).toBe(true);
    expect(workspaceExitBlocksChanges(null, "unavailable")).toBe(true);
    expect(workspaceExitBlocksChanges(null, "completed")).toBe(true);
    expect(workspaceExitBlocksChanges(null, "not_owner")).toBe(false);
  });

  it("keeps retained records readable while disabling new work", async () => {
    const snapshot = await (await createPreviewRequest("managed")("/api/workspace")).json();
    const html = renderToStaticMarkup(createElement(WorkspaceLayout, {
      appBase: "/preview/strelva",
      signOut: null,
      snapshot: { ...snapshot, workspaceExitState: exitState },
      managedWork: snapshot.managedWork,
      home: true,
      agency: false,
      busy: false,
      selectedWork: null,
      onHome: () => undefined,
      onNew: () => undefined,
      onOngoing: () => undefined,
      onAgency: () => undefined,
      onChoose: () => undefined,
      onWorkspace: () => undefined,
      onOpenClientWork: () => undefined,
      notice: null,
    }));

    expect(html).toContain("Work in this workspace has stopped.");
    expect(html).toContain('aria-label="Workspace stopped"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Export retained records");
    expect(html).toContain("Review retained work");
  });

  it("renders the member-safe completion bit as the same stopped workspace", async () => {
    const snapshot = await (await createPreviewRequest("managed")("/api/workspace")).json();
    const html = renderToStaticMarkup(createElement(WorkspaceLayout, {
      appBase: "/preview/strelva",
      signOut: null,
      snapshot: { ...snapshot, workspaceExitState: null, workspaceExitReadStatus: "completed" },
      managedWork: snapshot.managedWork,
      home: true,
      agency: false,
      busy: false,
      selectedWork: null,
      onHome: () => undefined,
      onNew: () => undefined,
      onOngoing: () => undefined,
      onAgency: () => undefined,
      onChoose: () => undefined,
      onWorkspace: () => undefined,
      onOpenClientWork: () => undefined,
      notice: null,
    }));

    expect(html).toContain("Work in this workspace has stopped.");
    expect(html).toContain('aria-label="Workspace stopped"');
    expect(html).toContain("Export retained records");
  });

  it("does not describe a stopped owner as a membership-limited viewer", () => {
    const html = renderToStaticMarkup(createElement(BoundedWorkExperience, {
      workspaceId: exitState.workspaceId,
      workId: "55555555-5555-4555-8555-555555555555",
      productId: "scheduling",
      readOnly: true,
      workspaceStopped: true,
      sources: [],
      onSaved: () => undefined,
    }));

    expect(html).toContain("Work in this workspace has stopped. Existing records remain available for review.");
    expect(html).not.toContain("Changes require workspace membership.");
  });
});
