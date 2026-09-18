import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import type { Responsibility } from "@/platform/work-execution/engine";
import type { SavedWork } from "@/platform/workspaces/types";

const fixture = vi.hoisted(() => {
  const responsibilities = new Map<string, { id: string; workspaceId: string; payload: Responsibility }>();
  const works = new Map<string, SavedWork>();
  const command = vi.fn();
  const readApplication = vi.fn();
  const standingGate = vi.fn(async () => undefined);
  return { responsibilities, works, command, readApplication, standingGate };
});

vi.mock("@/platform/workspaces/repository", () => ({
  assertWorkspaceMember: vi.fn(async () => undefined),
  getWork: vi.fn(async (_actor: unknown, workId: string) => fixture.works.get(workId) ?? null),
}));
vi.mock("@/platform/work-execution/repository", () => ({
  readResponsibility: vi.fn(async (_actor: unknown, workId: string) => fixture.responsibilities.get(workId)),
  persistResponsibility: vi.fn(),
  insertResponsibility: vi.fn(),
}));
vi.mock("@/platform/work-execution/standing-repository", () => ({
  admitStandingResponsibility: vi.fn(),
  createStandingResponsibility: vi.fn(),
  readStandingResponsibility: vi.fn(),
  readStandingRun: vi.fn(),
  readStandingRunForWork: vi.fn(async () => null),
  readStandingRuns: vi.fn(),
  recordStandingRun: vi.fn(),
  persistStandingResponsibility: vi.fn(),
  assertStandingExecutionAllowed: (...args: Parameters<typeof fixture.standingGate>) => fixture.standingGate(...args),
}));
vi.mock("@/products/applications/server", () => ({
  changeWorkspaceApplication: fixture.command,
  readWorkspaceApplication: fixture.readApplication,
}));
vi.mock("@/products/documents/server", () => ({
  editWorkspaceDocument: vi.fn(),
  readWorkspaceDocument: vi.fn(),
}));
vi.mock("@/products/tracker/server", () => ({
  editSavedTracker: vi.fn(),
  readSavedTracker: vi.fn(),
}));
vi.mock("@/products/scheduling/server", () => ({
  changeWorkspaceSchedule: vi.fn(),
  readWorkspaceSchedule: vi.fn(),
}));
vi.mock("@/products/investigations/server", () => ({
  runWorkspaceInvestigation: vi.fn(),
  readWorkspaceInvestigation: vi.fn(),
}));

import { applicationSchema } from "@/products/applications/contracts";
import { nativeExecutionAdapter } from "@/products/operations/server";
import { claimNextStep, stepInputSchema } from "@/platform/work-execution/engine";
import { responsibilityCommands } from "@/platform/work-execution/runtime";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const responsibilityId = "33333333-3333-4333-8333-333333333333";
const applicationSpec = {
  title: "Requests",
  maintenanceOwner: actor.userId,
  fields: [{ id: "name", label: "Name", type: "text" as const, required: true }],
  components: [{ kind: "form" as const, fields: ["name"] }],
};

function applicationPayload() {
  return applicationSchema.parse({
    version: 1,
    revision: 0,
    title: applicationSpec.title,
    createdBy: actor.userId,
    createdAt: "2026-09-14T00:00:00.000Z",
    history: [],
    spec: applicationSpec,
    specVersion: 1,
    status: "draft",
    versions: [{ version: 1, spec: applicationSpec }],
    rehearsal: null,
    records: [],
  });
}

function applicationWork() {
  return {
    id: applicationId,
    workspaceId,
    productId: "applications",
    resourceKind: "application",
    title: applicationSpec.title,
    payload: applicationPayload(),
    createdBy: actor.userId,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
}

function executionStore() {
  return {
    async read(_actor: typeof actor, workId: string) {
      const saved = fixture.responsibilities.get(workId);
      if (!saved) throw new Error("responsibility missing");
      return structuredClone(saved);
    },
    async write(_actor: typeof actor, workId: string, expectedWorkspaceId: string, expectedRevision: number, payload: Responsibility) {
      const saved = fixture.responsibilities.get(workId);
      if (!saved || saved.workspaceId !== expectedWorkspaceId || saved.payload.revision !== expectedRevision) throw new WorkspaceConflictError("write conflict");
      fixture.responsibilities.set(workId, { ...saved, payload: structuredClone(payload) });
      return payload;
    },
    async create(_actor: typeof actor, expectedWorkspaceId: string, payload: Responsibility) {
      fixture.responsibilities.set(responsibilityId, { id: responsibilityId, workspaceId: expectedWorkspaceId, payload: structuredClone(payload) });
      return { id: responsibilityId };
    },
  };
}

function createInput(capabilityVersion?: number) {
  return {
    title: "Rehearse the request form",
    intent: "Check the native application before release",
    steps: [{
      id: "check",
      operation: "application.command" as const,
      workId: applicationId,
      input: { kind: "rehearse", expectedRevision: 0 },
      dependsOn: [],
      maximumCents: 0,
      ...(capabilityVersion === undefined ? {} : { capabilityVersion }),
    }],
  };
}

describe("finite runner capability integration", () => {
  beforeEach(() => {
    fixture.responsibilities.clear();
    fixture.works.clear();
    fixture.command.mockReset();
    fixture.readApplication.mockReset();
    fixture.standingGate.mockReset();
    fixture.standingGate.mockResolvedValue(undefined);
    fixture.works.set(applicationId, applicationWork());
    fixture.readApplication.mockImplementation(async () => fixture.works.get(applicationId));
    fixture.command.mockImplementation(async () => {
      const work = fixture.works.get(applicationId)!;
      return { ...work, payload: work.payload };
    });
  });

  it("reads a legacy persisted step as the explicitly supported v1 command", () => {
    const parsed = stepInputSchema.parse({
      id: "check",
      operation: "application.command",
      workId: applicationId,
      input: { kind: "rehearse", expectedRevision: 0 },
      dependsOn: [],
      maximumCents: 0,
    });

    expect(parsed.capabilityVersion).toBe(1);
  });

  it("pins a default v1 step and reaches the existing native command through the finite runner", async () => {
    const commands = responsibilityCommands(executionStore(), nativeExecutionAdapter, () => "2026-09-14T00:00:00.000Z");
    const created = await commands.create(actor, workspaceId, createInput());
    expect(created.payload.steps[0]).toMatchObject({ operation: "application.command", capabilityVersion: 1, status: "pending" });
    await commands.command(actor, responsibilityId, { kind: "approve", expectedRevision: 0 });

    const completed = await commands.run(actor, responsibilityId);

    expect(fixture.command).toHaveBeenCalledTimes(1);
    expect(fixture.command).toHaveBeenCalledWith(actor, applicationId, { kind: "rehearse", expectedRevision: 0 });
    expect(completed.payload.steps[0]).toMatchObject({ capabilityVersion: 1, status: "completed", effect: "accepted", attempt: 1 });
  });

  it("keeps a direct native perform from crossing a foreign workspace boundary", async () => {
    const commands = responsibilityCommands(executionStore(), nativeExecutionAdapter, () => "2026-09-14T00:00:00.000Z");
    await commands.create(actor, workspaceId, createInput());
    await commands.command(actor, responsibilityId, { kind: "approve", expectedRevision: 0 });
    const saved = fixture.responsibilities.get(responsibilityId)!;
    const claimed = claimNextStep(saved.payload, "lease", "2026-09-14T00:00:00.000Z");
    fixture.responsibilities.set(responsibilityId, { ...saved, payload: claimed });
    fixture.works.set(applicationId, { ...fixture.works.get(applicationId)!, workspaceId: "44444444-4444-4444-8444-444444444444" });

    const outcome = await nativeExecutionAdapter.perform(
      actor,
      workspaceId,
      responsibilityId,
      claimed.steps[0]!,
      `${responsibilityId}:check:1`,
    );

    expect(outcome).toMatchObject({ effect: "none", status: "failed" });
    expect(fixture.command).not.toHaveBeenCalled();
  });

  it("returns a known no effect when the standing policy is revoked before direct perform", async () => {
    fixture.standingGate.mockRejectedValue(new WorkspaceConflictError("This ongoing responsibility is revoked."));
    const step = stepInputSchema.parse(createInput().steps[0]);

    const outcome = await nativeExecutionAdapter.perform(
      actor,
      workspaceId,
      responsibilityId,
      step,
      `${responsibilityId}:check:1`,
    );

    expect(outcome).toMatchObject({ effect: "none", status: "failed", reason: "This ongoing responsibility is revoked." });
    expect(fixture.command).not.toHaveBeenCalled();
  });

  it("rejects an unavailable pinned version before creating executable work", async () => {
    const commands = responsibilityCommands(executionStore(), nativeExecutionAdapter, () => "2026-09-14T00:00:00.000Z");

    await expect(commands.create(actor, workspaceId, createInput(2))).rejects.toThrow("application.command@2 is unavailable");
    expect(fixture.responsibilities.size).toBe(0);
    const outcome = await nativeExecutionAdapter.perform(
      actor,
      workspaceId,
      responsibilityId,
      stepInputSchema.parse(createInput(2).steps[0]),
      `${responsibilityId}:check:1`,
    );
    expect(outcome).toMatchObject({ effect: "none", status: "failed" });
    expect(fixture.command).not.toHaveBeenCalled();
  });

  it("records unknown when the native command mutates but its typed result cannot be parsed", async () => {
    const commands = responsibilityCommands(executionStore(), nativeExecutionAdapter, () => "2026-09-14T00:00:00.000Z");
    await commands.create(actor, workspaceId, createInput());
    await commands.command(actor, responsibilityId, { kind: "approve", expectedRevision: 0 });
    fixture.command.mockImplementation(async () => {
      const work = fixture.works.get(applicationId)!;
      const mutated = { ...work, payload: { ...(work.payload as Record<string, unknown>), revision: 1 } };
      fixture.works.set(applicationId, mutated);
      return { ...mutated, payload: { malformed: true } };
    });

    const unresolved = await commands.run(actor, responsibilityId);

    expect(unresolved.payload.steps[0]).toMatchObject({ status: "unknown", effect: "unknown" });
    await expect(commands.command(actor, responsibilityId, { kind: "retry", expectedRevision: unresolved.payload.revision })).rejects.toThrow("may already have happened");
  });
});
