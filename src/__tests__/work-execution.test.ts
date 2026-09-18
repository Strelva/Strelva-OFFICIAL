import { describe, expect, it } from "vitest";
import { createResponsibility, changeResponsibility, claimNextStep, recordStepOutcome } from "@/platform/work-execution/engine";

const now = "2026-09-12T12:00:00.000Z";
const user = "owner";
const input = { title: "Keep our operating notes current", intent: "Update the procedure after checking records", steps: [
  { id: "check", operation: "investigation.run", workId: "00000000-0000-4000-8000-000000000001", input: {}, dependsOn: [], maximumCents: 0 },
  { id: "write", operation: "document.edit", workId: "00000000-0000-4000-8000-000000000002", input: { expectedRevision: 0, kind: "edit", title: "Procedure", text: "Call confirmed customers." }, dependsOn: ["check"], maximumCents: 0 },
] };
describe("delegated work", () => {
  it("keeps the proposed work inert until approved, then runs dependencies before changes", () => {
    const proposed = createResponsibility(input, user, now);
    expect(() => claimNextStep(proposed, "lease", now)).toThrow(/approve/i);
    const approved = changeResponsibility(proposed, { kind: "approve", expectedRevision: 0 }, user, now);
    const claimed = claimNextStep(approved, "lease", now);
    expect(claimed.steps.find(s => s.status === "running")?.id).toBe("check");
    const checked = recordStepOutcome(claimed, "lease", { effect: "none", status: "completed", result: { discrepancy: false } }, now);
    expect(claimNextStep(checked, "next", now).steps.find(s => s.status === "running")?.id).toBe("write");
  });
  it("persists a wait and refuses early resumption", () => {
    const approved = changeResponsibility(createResponsibility(input, user, now), { kind: "approve", expectedRevision: 0 }, user, now);
    const waiting = recordStepOutcome(claimNextStep(approved, "lease", now), "lease", { effect: "none", status: "waiting", wakeAt: "2026-09-13T12:00:00.000Z", reason: "Waiting for the next source refresh" }, now);
    expect(() => claimNextStep(waiting, "early", now)).toThrow(/waiting/i);
    expect(claimNextStep(waiting, "later", "2026-09-13T12:01:00.000Z").steps[0]!.status).toBe("running");
  });
  it("never replays an accepted write when verification fails", () => {
    const approved = changeResponsibility(createResponsibility({ ...input, steps: [input.steps[0]] }, user, now), { kind: "approve", expectedRevision: 0 }, user, now);
    const result = recordStepOutcome(claimNextStep(approved, "lease", now), "lease", { effect: "accepted", status: "verification_failed", result: { providerId: "accepted-1" }, reason: "Read back unavailable" }, now);
    expect(result.steps[0]!.status).toBe("accepted");
    expect(() => changeResponsibility(result, { kind: "retry", expectedRevision: result.revision }, user, now)).toThrow(/replay/i);
    expect(result.status).toBe("needs_attention");
  });
  it("does not reclaim an expired running write and supports cancellation without losing evidence", () => {
    const approved = changeResponsibility(createResponsibility(input, user, now), { kind: "approve", expectedRevision: 0 }, user, now);
    const claimed = claimNextStep(approved, "lease", now);
    expect(() => claimNextStep(claimed, "duplicate", "2026-09-14T12:00:00.000Z")).toThrow(/reconcile/i);
    const cancelled = changeResponsibility(claimed, { kind: "cancel", expectedRevision: claimed.revision }, user, now);
    expect(cancelled.status).toBe("cancelled");
    const late = recordStepOutcome(cancelled, "lease", { effect: "accepted", status: "completed", result: { written: true } }, now);
    expect(late.status).toBe("cancelled");
    expect(late.steps[0]!.status).toBe("completed");
    expect(() => claimNextStep(late, "again", now)).toThrow();
  });
  it("rejects stale decisions, cycles, unknown operations and dependency bypass", () => {
    const proposed = createResponsibility(input, user, now);
    expect(() => changeResponsibility(proposed, { kind: "approve", expectedRevision: 3 }, user, now)).toThrow(/changed/i);
    expect(() => createResponsibility({ ...input, steps: [{ ...input.steps[0], dependsOn: ["write"] }, input.steps[1]] }, user, now)).toThrow();
    expect(() => createResponsibility({ ...input, steps: [{ ...input.steps[0], operation: "shell.run" }] }, user, now)).toThrow();
  });
  it("lets an owner reconcile an interrupted cancelled action without reopening it", () => {
    const approved = changeResponsibility(createResponsibility(input, user, now), { kind: "approve", expectedRevision: 0 }, user, now);
    const claimed = claimNextStep(approved, "lease", now);
    const interrupted = recordStepOutcome(claimed, "lease", { effect: "unknown", status: "failed", reason: "Lost the action response" }, now);
    const cancelled = changeResponsibility(interrupted, { kind: "cancel", expectedRevision: interrupted.revision }, user, now);
    const reconciled = changeResponsibility(cancelled, { kind: "reconcile", expectedRevision: cancelled.revision, stepId: "check", resolution: "completed", evidence: "Verified the saved comparison receipt" }, user, "2026-09-12T12:05:00.000Z");
    expect(reconciled.status).toBe("cancelled");
    expect(reconciled.steps[0]?.status).toBe("completed");
    expect(reconciled.steps[0]?.effect).toBe("accepted");
    expect(() => claimNextStep(reconciled, "new", "2026-09-12T12:06:00.000Z")).toThrow();
  });
  it("keeps paused work paused when a prior action is verified", () => {
    const approved = changeResponsibility(createResponsibility(input, user, now), { kind: "approve", expectedRevision: 0 }, user, now);
    const interrupted = recordStepOutcome(claimNextStep(approved, "lease", now), "lease", { effect: "unknown", status: "failed" }, now);
    const paused = changeResponsibility(interrupted, { kind: "pause", expectedRevision: interrupted.revision }, user, now);
    const reconciled = changeResponsibility(paused, { kind: "reconcile", expectedRevision: paused.revision, stepId: "check", resolution: "completed", evidence: "Verified the exact saved receipt" }, user, now);
    expect(reconciled.status).toBe("paused");
    expect(() => claimNextStep(reconciled, "next", now)).toThrow();
    const resumed = changeResponsibility(reconciled, { kind: "resume", expectedRevision: reconciled.revision }, user, now);
    expect(claimNextStep(resumed, "next", now).steps.find(step => step.status === "running")?.id).toBe("write");
  });
  it("closes fully verified paused work when its owner resumes", () => {
    const approved = changeResponsibility(createResponsibility({ ...input, steps: [input.steps[0]] }, user, now), { kind: "approve", expectedRevision: 0 }, user, now);
    const interrupted = recordStepOutcome(claimNextStep(approved, "lease", now), "lease", { effect: "unknown", status: "failed" }, now);
    const paused = changeResponsibility(interrupted, { kind: "pause", expectedRevision: interrupted.revision }, user, now);
    const reconciled = changeResponsibility(paused, { kind: "reconcile", expectedRevision: paused.revision, stepId: "check", resolution: "completed", evidence: "Verified the only action" }, user, now);
    expect(reconciled.status).toBe("paused");
    expect(changeResponsibility(reconciled, { kind: "resume", expectedRevision: reconciled.revision }, user, now).status).toBe("completed");
  });
});
