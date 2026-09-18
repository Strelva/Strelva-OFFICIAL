import { describe, expect, it } from "vitest";
import {
  admittedResponsibility,
  changeStandingResponsibility,
  createStandingResponsibility,
  isStandingDue,
  nextStandingTrigger,
} from "@/platform/work-execution/standing";
import { responsibilityCommands, type ExecutionStore } from "@/platform/work-execution/runtime";
import { createResponsibility, type Responsibility } from "@/platform/work-execution/engine";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-09-14T15:00:00.000Z";
const nextAt = "2026-09-14T16:00:00.000Z";

function policyInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Check supplier documents",
    intent: "Compare saved supplier records on each approved interval.",
    scope: {
      steps: [{
        id: "check",
        operation: "investigation.run",
        workId: sourceId,
        input: {},
        dependsOn: [],
        maximumCents: 0,
      }],
    },
    trigger: { kind: "interval", everySeconds: 3600, nextAt },
    ...overrides,
  };
}

describe("standing responsibility policy", () => {
  it("keeps approval, pause, version update, resume, and revoke explicit", () => {
    const proposed = createStandingResponsibility(policyInput(), ownerId, createdAt);
    expect(proposed).toMatchObject({ version: 1, revision: 0, status: "proposed" });

    const active = changeStandingResponsibility(proposed, { kind: "approve", expectedRevision: 0 }, ownerId, createdAt);
    expect(active).toMatchObject({ revision: 1, status: "active", approvedBy: ownerId });
    expect(isStandingDue(active, nextAt)).toBe(true);
    expect(nextStandingTrigger(active)).toBe("2026-09-14T17:00:00.000Z");

    const paused = changeStandingResponsibility(active, { kind: "pause", expectedRevision: 1 }, ownerId, createdAt);
    expect(paused.status).toBe("paused");
    expect(isStandingDue(paused, nextAt)).toBe(false);

    const newVersion = changeStandingResponsibility(paused, {
      kind: "update",
      expectedRevision: 2,
      version: 2,
      title: "Check supplier documents v2",
      intent: "Compare the current saved supplier records.",
      scope: paused.scope,
      trigger: { kind: "interval", everySeconds: 7200, nextAt: "2026-09-14T18:00:00.000Z" },
      limits: paused.limits,
      exclusions: paused.exclusions,
    }, ownerId, createdAt);
    expect(newVersion).toMatchObject({ version: 2, revision: 3, status: "proposed", approvedAt: undefined });

    const resumed = changeStandingResponsibility(newVersion, { kind: "approve", expectedRevision: 3 }, ownerId, createdAt);
    expect(resumed.status).toBe("active");
    const revoked = changeStandingResponsibility(resumed, { kind: "revoke", expectedRevision: 4 }, ownerId, createdAt);
    expect(revoked.status).toBe("revoked");
    expect(() => changeStandingResponsibility(revoked, { kind: "resume", expectedRevision: 5 }, ownerId, createdAt)).toThrow(/revoked/i);
  });

  it("admits the approved scope as an ordinary finite responsibility", () => {
    const active = changeStandingResponsibility(
      createStandingResponsibility(policyInput(), ownerId, createdAt),
      { kind: "approve", expectedRevision: 0 },
      ownerId,
      createdAt,
    );
    const finite = admittedResponsibility(active, createdAt);
    expect(finite).toMatchObject({ version: 1, revision: 1, status: "ready", ownerId, approvedBy: ownerId });
    expect(finite.steps).toHaveLength(1);
    expect(finite.steps[0]).toMatchObject({ id: "check", operation: "investigation.run", status: "pending", attempt: 0 });
    expect(finite.history).toHaveLength(1);
    expect(finite.history[0]).toMatchObject({ revision: 1, kind: "approve", actorId: ownerId });
  });

  it("does not admit paid work or a pre-pinned investigation identity", () => {
    const paid = createStandingResponsibility(policyInput({
      scope: { steps: [{
        id: "check", operation: "investigation.run", workId: sourceId, input: {}, dependsOn: [], maximumCents: 1,
      }] },
    }), ownerId, createdAt);
    const activePaid = changeStandingResponsibility(paid, { kind: "approve", expectedRevision: 0 }, ownerId, createdAt);
    expect(() => admittedResponsibility(activePaid, createdAt)).toThrow(/paid work/i);

    expect(() => createStandingResponsibility(policyInput({
      scope: { steps: [{
        id: "check", operation: "investigation.run", workId: sourceId,
        input: { expectedRevision: 3 }, dependsOn: [], maximumCents: 0,
      }] },
    }), ownerId, createdAt)).toThrow(/leave its current revision/i);

    expect(() => createStandingResponsibility(policyInput({
      scope: { steps: [{
        id: "write", operation: "document.edit", workId: sourceId,
        input: {}, dependsOn: [], maximumCents: 0,
      }] },
    }), ownerId, createdAt)).toThrow(/saved-record checks only/i);
  });

  it("passes the finite work identity to every native recheck", async () => {
    let work = createResponsibility({
      title: "Check supplier documents",
      intent: "Run the saved check.",
      steps: [{ id: "check", operation: "investigation.run", workId: sourceId, input: {}, dependsOn: [], maximumCents: 0 }],
    }, ownerId, createdAt);
    const rechecked: string[] = [];
    const store: ExecutionStore = {
      async read(actor, id) { return { id, workspaceId: "workspace", payload: structuredClone(work) }; },
      async write(actor, id, workspaceId, expectedRevision, payload: Responsibility) {
        if (work.revision !== expectedRevision) throw new WorkspaceConflictError();
        work = structuredClone(payload);
        return work;
      },
      async create() { return { id: "finite-work" }; },
    };
    const commands = responsibilityCommands(store, {
      recheck: async (_actor, _workspaceId, _step, responsibilityId) => { if (responsibilityId) rechecked.push(responsibilityId); },
      perform: async () => ({ effect: "none" as const, status: "completed" as const }),
    }, () => createdAt);
    await commands.command({ userId: ownerId, verifiedEmail: "owner@example.com" }, "finite-work", { kind: "approve", expectedRevision: 0 });
    await commands.run({ userId: ownerId, verifiedEmail: "owner@example.com" }, "finite-work");
    expect(rechecked).toEqual(["finite-work", "finite-work"]);
  });
});
