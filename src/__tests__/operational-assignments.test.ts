import { describe, expect, it } from "vitest";
import { createResponsibility, changeResponsibility, type Responsibility } from "@/platform/work-execution/engine";
import { responsibilityCommands, type ExecutionStore } from "@/platform/work-execution/runtime";
import { assertOperationalAssignmentScope } from "@/products/operations/server";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";

const owner: WorkspaceActor = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  verifiedEmail: "owner@example.test",
};
const operator: WorkspaceActor = {
  userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  verifiedEmail: "operator@example.test",
};
const guest: WorkspaceActor = {
  userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  verifiedEmail: "guest@example.test",
};
const workspaceId = "11111111-1111-4111-8111-111111111111";
const responsibilityId = "22222222-2222-4222-8222-222222222222";
const sourceOne = "33333333-3333-4333-8333-333333333333";
const sourceTwo = "44444444-4444-4444-8444-444444444444";
const start = "2026-09-15T12:00:00.000Z";

function approved(steps: Array<Record<string, unknown>>): Responsibility {
  const proposed = createResponsibility({
    title: "Check current records",
    intent: "Run the exact checks approved by the owner",
    steps,
  }, owner.userId, start);
  return changeResponsibility(proposed, { kind: "approve", expectedRevision: 0 }, owner.userId, start);
}

function investigationStep(id: string, workId: string, dependsOn: string[] = []) {
  return {
    id,
    operation: "investigation.run",
    workId,
    input: { expectedRevision: 0, requestId: `assignment-${id}` },
    dependsOn,
    maximumCents: 0,
    capabilityVersion: 1,
  };
}

function assignedRuntime(initial: Responsibility) {
  let work = structuredClone(initial);
  let now = new Date(start);
  const assignment = {
    status: "offered" as "offered" | "accepted" | "revoked",
    expiresAt: new Date("2026-09-16T12:00:00.000Z"),
    sponsorIsOwner: true,
    members: new Set([owner.userId, operator.userId]),
  };
  function authorize(actor: WorkspaceActor) {
    if (actor.userId !== operator.userId || actor.verifiedEmail !== operator.verifiedEmail
      || assignment.status !== "accepted" || assignment.expiresAt <= now
      || !assignment.sponsorIsOwner || !assignment.members.has(actor.userId)) {
      throw new WorkspaceAccessError("The operational assignment is not active.");
    }
  }
  const store: ExecutionStore = {
    async read(actor, _id, access = "normal") {
      if (access === "normal") authorize(actor);
      else if (actor.userId !== operator.userId || work.history.at(-1)?.actorId !== actor.userId) throw new WorkspaceAccessError();
      return { id: responsibilityId, workspaceId, payload: structuredClone(work) };
    },
    async write(actor, _id, _workspaceId, expectedRevision, payload, phase) {
      if (work.revision !== expectedRevision) throw new WorkspaceConflictError();
      if (phase === "start") authorize(actor);
      if (phase === "command") throw new WorkspaceAccessError();
      work = structuredClone(payload);
      return structuredClone(work);
    },
    async create() { throw new WorkspaceAccessError(); },
  };
  let effects = 0;
  let rechecks = 0;
  const adapter = {
    async recheck(actor: WorkspaceActor) { rechecks++; authorize(actor); },
    async perform(actor: WorkspaceActor) {
      authorize(actor);
      effects++;
      return { effect: "accepted" as const, status: "completed" as const };
    },
  };
  const commands = responsibilityCommands(store, adapter, () => now.toISOString(), (actor) => authorize(actor));
  return {
    assignment,
    commands,
    get work() { return structuredClone(work); },
    get effects() { return effects; },
    get rechecks() { return rechecks; },
    setNow(value: string) { now = new Date(value); },
    expireOnNextRecheck() {
      const original = adapter.recheck;
      adapter.recheck = async (actor: WorkspaceActor) => {
        if (rechecks === 1) now = new Date("2026-09-17T12:00:00.000Z");
        await original(actor);
      };
    },
  };
}

describe("operational assignments", () => {
  it("requires explicit acceptance and never turns an outside guest into an operator", async () => {
    const runtime = assignedRuntime(approved([investigationStep("check", sourceOne)]));
    await expect(runtime.commands.run(operator, responsibilityId)).rejects.toThrow(/not active/i);
    runtime.assignment.status = "accepted";
    await expect(runtime.commands.run(guest, responsibilityId)).rejects.toThrow(/not active/i);
    expect(runtime.effects).toBe(0);
  });

  it("runs only the accepted finite job, attributes it to the operator, and stops after revocation", async () => {
    const runtime = assignedRuntime(approved([
      investigationStep("first", sourceOne),
      investigationStep("second", sourceTwo, ["first"]),
    ]));
    runtime.assignment.status = "accepted";
    const first = await runtime.commands.run(operator, responsibilityId);
    expect(first.payload.status).toBe("ready");
    expect(runtime.effects).toBe(1);
    expect(first.payload.history.slice(-2).map((event) => event.actorId)).toEqual([operator.userId, operator.userId]);
    expect(first.payload.ownerId).toBe(owner.userId);
    runtime.assignment.status = "revoked";
    await expect(runtime.commands.run(operator, responsibilityId)).rejects.toThrow(/not active/i);
    expect(runtime.effects).toBe(1);
  });

  it("records a no-effect failure when the assignment expires after claim but before perform", async () => {
    const runtime = assignedRuntime(approved([investigationStep("check", sourceOne)]));
    runtime.assignment.status = "accepted";
    runtime.expireOnNextRecheck();
    const result = await runtime.commands.run(operator, responsibilityId);
    expect(result.payload.status).toBe("needs_attention");
    expect(result.payload.steps[0]).toMatchObject({ status: "failed", effect: "none" });
    expect(result.payload.history.at(-1)?.actorId).toBe(operator.userId);
    expect(runtime.effects).toBe(0);
  });

  it("rechecks current sponsor ownership before another effect", async () => {
    const runtime = assignedRuntime(approved([investigationStep("check", sourceOne)]));
    runtime.assignment.status = "accepted";
    runtime.assignment.sponsorIsOwner = false;
    await expect(runtime.commands.run(operator, responsibilityId)).rejects.toThrow(/not active/i);
    expect(runtime.effects).toBe(0);
  });

  it("accepts qualified local zero-cost steps and rejects paid, internal, release, and authority-changing work", () => {
    expect(() => assertOperationalAssignmentScope(approved([investigationStep("check", sourceOne)]), true)).not.toThrow();
    expect(() => assertOperationalAssignmentScope(approved([{ ...investigationStep("check", sourceOne), maximumCents: 1 }]), true)).toThrow(/paid/i);
    expect(() => assertOperationalAssignmentScope(approved([{
      id: "publish", operation: "application.command", workId: sourceOne,
      input: { kind: "publish", expectedCandidateRevision: 1, expectedReleaseVersion: null },
      dependsOn: [], maximumCents: 0, capabilityVersion: 1,
    }]), true)).toThrow(/cannot be delegated/i);
    expect(() => assertOperationalAssignmentScope(approved([{
      id: "coordinate", operation: "tracker.command", workId: sourceOne,
      input: { kind: "coordinate_records" }, dependsOn: [], maximumCents: 0, capabilityVersion: 1,
    }]), true)).toThrow(/cannot be delegated/i);
    expect(() => assertOperationalAssignmentScope(approved([{
      id: "collect", operation: "learning.collect", workId: sourceOne,
      input: { expectedRevision: 0 }, dependsOn: [], maximumCents: 0, capabilityVersion: 1,
    }]), true)).toThrow(/cannot be delegated|paid/i);
  });
});
