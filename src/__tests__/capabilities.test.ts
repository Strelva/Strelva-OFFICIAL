import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createCapabilityInvoker,
  createCapabilityRegistry,
  isQualificationEvidenceValid,
  qualifyCapability,
  type ExecutableCapabilityDefinition,
} from "@/platform/capabilities";
import {
  EXECUTABLE_CAPABILITY_DEFINITIONS,
  applicationCapabilityInputSchema,
  executableCapabilityRegistry,
  listExecutableCapabilityDescriptors,
  requireExactExecutableCapability,
} from "@/server/capabilities";

const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };

function applicationResult() {
  const spec = {
    title: "Repair requests",
    maintenanceOwner: actor.userId,
    fields: [{ id: "problem", label: "Problem", type: "text" as const, required: true }],
    components: [{ kind: "form" as const, fields: ["problem"] }],
  };
  return {
    version: 1 as const,
    revision: 0,
    title: spec.title,
    createdBy: actor.userId,
    createdAt: "2026-09-14T00:00:00.000Z",
    history: [],
    spec,
    specVersion: 1,
    status: "draft" as const,
    versions: [{ version: 1, spec }],
    rehearsal: null,
    records: [],
  };
}

describe("versioned executable capabilities", () => {
  it("exposes the application planner and runner through qualified definitions", () => {
    const planner = listExecutableCapabilityDescriptors("planner").find((item) => item.id === "create_application");
    const runner = listExecutableCapabilityDescriptors("runner").find((item) => item.id === "application.command");

    expect(planner).toMatchObject({
      id: "create_application",
      version: 1,
      family: "applications",
      productId: "applications",
      resourceKind: "application",
      effect: "create_resource",
      support: "release_gated",
    });
    expect(runner).toMatchObject({
      id: "application.command",
      version: 1,
      family: "applications",
      productId: "applications",
      resourceKind: "application",
      effect: "propose_change",
    });
    expect(planner?.adapterKey).toBe("applications.create_draft");
    expect(runner?.adapterKey).toBe("applications.command");
    expect(applicationCapabilityInputSchema.safeParse({
      title: "Repair requests",
      fields: [{ id: "problem", label: "Problem", type: "text", required: true }],
      components: [{ kind: "form", fields: ["problem"] }],
    }).success).toBe(true);
  });

  it("invokes the existing runner adapter only after exact version and input checks", async () => {
    const perform = vi.fn().mockResolvedValue(applicationResult());
    const recheck = vi.fn().mockResolvedValue(undefined);
    const adapter = { key: "applications.command", recheck, perform };
    const invoker = createCapabilityInvoker(executableCapabilityRegistry, new Map([[adapter.key, adapter]]));
    const context = { actor, workspaceId: "11111111-1111-4111-8111-111111111111", workId: "22222222-2222-4222-8222-222222222222" };
    const input = { kind: "rehearse" as const, expectedRevision: 0 };

    await invoker.recheck("application.command", 1, context, input);
    const result = await invoker.perform("application.command", 1, context, input);

    expect(recheck).toHaveBeenCalledTimes(2);
    expect(recheck).toHaveBeenCalledWith(context, input);
    expect(perform).toHaveBeenCalledWith(context, input);
    expect(result).toMatchObject({ status: "draft", spec: { maintenanceOwner: actor.userId } });
    expect(() => requireExactExecutableCapability("application.command", 2, "runner")).toThrowError(
      expect.objectContaining({ reason: "version_unavailable" }),
    );
  });

  it("rechecks authority on direct perform and never invokes a revoked target", async () => {
    const recheck = vi.fn().mockRejectedValue(new Error("foreign workspace"));
    const perform = vi.fn().mockResolvedValue(applicationResult());
    const adapter = { key: "applications.command" as const, recheck, perform };
    const invoker = createCapabilityInvoker(executableCapabilityRegistry, new Map([[adapter.key, adapter]]));

    await expect(invoker.perform(
      "application.command",
      1,
      { actor, workspaceId: "33333333-3333-4333-8333-333333333333", workId: "22222222-2222-4222-8222-222222222222" },
      { kind: "rehearse", expectedRevision: 0 },
    )).rejects.toThrow("foreign workspace");
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(perform).not.toHaveBeenCalled();
  });

  it("keeps resource context at the adapter boundary and never widens it from discovery", async () => {
    const seen: string[] = [];
    const adapter = {
      key: "applications.command" as const,
      recheck: vi.fn(async (context: { workspaceId: string }) => {
        seen.push(context.workspaceId);
        if (context.workspaceId !== "11111111-1111-4111-8111-111111111111") throw new Error("wrong workspace");
      }),
      perform: vi.fn().mockResolvedValue(applicationResult()),
    };
    const invoker = createCapabilityInvoker(executableCapabilityRegistry, new Map([[adapter.key, adapter]]));
    const input = { kind: "rehearse" as const, expectedRevision: 0 };

    await invoker.perform("application.command", 1, { actor, workspaceId: "11111111-1111-4111-8111-111111111111" }, input);
    await expect(invoker.perform("application.command", 1, { actor, workspaceId: "33333333-3333-4333-8333-333333333333" }, input)).rejects.toThrow("wrong workspace");
    expect(seen).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    ]);
    expect(adapter.perform).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a new definition has no exact qualification witness", () => {
    const definition: ExecutableCapabilityDefinition = {
      contractVersion: 1,
      id: "applications.preview",
      version: 1,
      family: "applications",
      productId: "applications",
      resourceKind: "application",
      label: "Preview application",
      description: "Preview a private application.",
      support: "supported",
      owningScope: "resource",
      authority: EXECUTABLE_CAPABILITY_DEFINITIONS[0]!.authority,
      cost: EXECUTABLE_CAPABILITY_DEFINITIONS[0]!.cost,
      execution: {
        effect: "read",
        idempotency: { mode: "none", retry: "never", keyFields: [] },
        reconciliation: { mode: "none", acceptedWriteClosed: true },
        verification: { mode: "none", evidence: "none" },
      },
      adapterKey: "applications.preview",
      entrances: ["runner"],
      compatibility: {
        contractVersion: 1,
        inputVersion: 1,
        outputVersion: 1,
        resourceKinds: ["application"],
        entrances: ["runner"],
        status: "compatible",
        notes: "Test-only definition.",
      },
      inputSchema: z.object({}).strict(),
      resultSchema: z.object({}).strict(),
    };
    const registry = createCapabilityRegistry({ definitions: [definition], qualifications: [] });

    expect(registry.list("runner")).toHaveLength(0);
    expect(() => registry.requireExact("applications.preview", 1, "runner")).toThrowError(
      expect.objectContaining({ reason: "not_qualified" }),
    );
  });

  it("rejects evidence from another capability version", () => {
    const qualified = requireExactExecutableCapability("application.command", 1, "runner");
    const evidence = qualified.qualification.evidence;
    expect(isQualificationEvidenceValid(evidence, "application.command", 1)).toBe(true);
    expect(isQualificationEvidenceValid(evidence, "application.command", 2)).toBe(false);
    expect(() => qualifyCapability(qualified.definition, evidence.map((item) => ({ ...item, capabilityVersion: 2 })), "2026-09-14T00:00:00.000Z", "wrong version")).toThrow();
  });

  it("does not turn a model or adapter replacement into a new capability mandate", async () => {
    const oldSelection = requireExactExecutableCapability("application.command", 1, "runner");
    const recheck = vi.fn().mockResolvedValue(undefined);
    const perform = vi.fn().mockResolvedValue(applicationResult());
    const replacement = createCapabilityInvoker(executableCapabilityRegistry, new Map([[
      "applications.command",
      { key: "applications.command", recheck, perform },
    ]]));
    expect(oldSelection.definition.id).toBe("application.command");
    expect(oldSelection.definition.version).toBe(1);
    expect(oldSelection.definition.authority).toEqual({
      requirements: ["workspace_membership", "resource_owner"],
      approval: "operation_policy",
      recheckAtExecution: true,
      scope: "same_workspace",
    });
    await replacement.perform(
      "application.command",
      oldSelection.definition.version,
      { actor, workspaceId: "11111111-1111-4111-8111-111111111111" },
      { kind: "rehearse", expectedRevision: 0 },
    );
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(oldSelection.definition.id).toBe("application.command");
    expect(oldSelection.definition.version).toBe(1);
  });
});
