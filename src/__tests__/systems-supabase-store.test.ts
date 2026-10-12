import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createSupabaseSystemStore, mapSystemsError, SystemRuleError } from "@/platform/systems";
import type { UpdateSystemInput } from "@/platform/systems";
import type { SystemsDb, SystemRpcArgs, SystemRpcName } from "@/platform/systems/supabase-store";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "Owner@Example.com " };
const business = "22222222-2222-4222-8222-222222222222";
const systemId = "44444444-4444-4444-8444-444444444444";
const command = "33333333-3333-4333-8333-333333333333";
const AT = "2026-10-04T12:00:00.000000Z";
const system = {
  id: systemId, businessId: business, name: "Pricing", purpose: null, kind: "pricing", lifecycle: "draft",
  currentRevision: null, origin: null, changeNumber: 1, createdAt: AT, updatedAt: AT,
};

function fake(data: unknown, error: { message?: string; code?: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { rpc, store: createSupabaseSystemStore({ rpc }) };
}

describe("Supabase system store", () => {
  it("checks RPC identity and arguments against the generated schema", () => {
    // These compile-only refusals must fail if this port becomes string/unknown.
    // @ts-expect-error A misspelled SQL function is not a Systems operation.
    const misspelled: SystemRpcName = "read_business_sytems";
    // @ts-expect-error Unrelated SQL functions are not exposed by this port.
    const unrelated: SystemRpcName = "update_connected_site";
    // @ts-expect-error The actor cannot be omitted from a protected read.
    const missingActor: SystemRpcArgs<"read_business_systems"> = { p_workspace_id: business };
    const readArgs: SystemRpcArgs<"read_business_systems"> = {
      p_workspace_id: business, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    };
    const incorrect: SystemRpcArgs<"read_business_systems"> = {
      ...readArgs,
      // @ts-expect-error UUID arguments cannot be numbers.
      p_user_id: 1,
    };
    expectTypeOf<SystemRpcArgs<"record_system_revision">["p_expected_change"]>().toEqualTypeOf<number | null>();
    expectTypeOf<SystemRpcArgs<"set_system_current_revision">["p_expected_current"]>().toEqualTypeOf<string | null>();
    const checkCallSignature = (db: SystemsDb) => {
      // @ts-expect-error The dispatcher must reject misspelled function names too.
      void db.rpc("read_business_sytems", readArgs);
      // @ts-expect-error Arguments belong to the named function, not another operation.
      void db.rpc("read_business_system", readArgs);
    };
    void checkCallSignature;
    void [misspelled, unrelated, missingActor, incorrect];
  });

  it("sends a normalized actor and a digest bound to the command body", async () => {
    const { rpc, store } = fake({ ...system, replayed: true });
    const created = await store.createSystem(actor, business, { name: "Pricing", kind: "pricing" }, command);
    expect(created).toEqual(system);
    await store.createSystem(actor, business, { name: "Pricing", kind: "pricing" }, command);
    await store.createSystem(actor, business, { name: "Prices", kind: "pricing" }, command);
    const calls = rpc.mock.calls as unknown as [string, Record<string, unknown>][];
    expect(calls[0]![0]).toBe("create_business_system");
    expect(calls[0]![1]).toMatchObject({ p_workspace_id: business, p_user_id: actor.userId, p_verified_email: "owner@example.com", p_command_id: command });
    expect(calls[0]![1].p_command_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[1]![1].p_command_digest).toBe(calls[0]![1].p_command_digest);
    expect(calls[2]![1].p_command_digest).not.toBe(calls[0]![1].p_command_digest);
  });

  it("validates before calling the database", async () => {
    const { rpc, store } = fake(system);
    await expect(store.createSystem(actor, business, { name: " padded", kind: "pricing" }, command)).rejects.toThrow();
    await expect(store.transitionLifecycle(actor, { businessId: business, systemId }, 1, "archived" as never)).rejects.toThrow();
    await expect(store.connect(actor, { source: { businessId: business, systemId }, kind: "borrow" as never, target: { type: "api", api: "x" } }, command)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps database errors onto one vocabulary", () => {
    expect(() => mapSystemsError({ message: "business_record_access_denied" }, "x")).toThrow(WorkspaceAccessError);
    expect(() => mapSystemsError({ message: "system_not_found" }, "x")).toThrow(WorkspaceAccessError);
    expect(() => mapSystemsError({ message: "workspace_exit_future_work_blocked" }, "x")).toThrow(expect.objectContaining({ code: "system_business_stopped" }));
    expect(() => mapSystemsError({ message: "system_connection_cycle" }, "x")).toThrow(SystemRuleError);
    expect(() => mapSystemsError({ message: "system_output_requires_revision" }, "x")).toThrow(expect.objectContaining({ code: "system_output_requires_revision" }));
    expect(() => mapSystemsError({ message: "connection reset" }, "fallback")).toThrow(WorkspaceStoreError);
  });

  it("refuses kind updates before dispatching an RPC", async () => {
    expectTypeOf<keyof UpdateSystemInput>().toEqualTypeOf<"name" | "purpose">();
    const { rpc, store } = fake(system);
    await expect(store.updateSystem(actor, { businessId: business, systemId }, 1, { kind: "portal" } as never)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([{}, { kind: "pricing" }, { name: "Taken", kind: "portal" }, { purpose: 3 }, { purpose: {} },
    { name: null }, { name: " padded" }, { origin: null }, { lifecycle: "paused" }])(
    "refuses malformed or unknown application patch %j before RPC", async (patch) => {
      const { rpc, store } = fake(system);
      await expect(store.updateSystem(actor, { businessId: business, systemId }, 1, patch as never)).rejects.toThrow();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("sends permitted updates with exact identity and expected change", async () => {
    const { rpc, store } = fake({ ...system, purpose: null, name: "Packages", changeNumber: 2 });
    await expect(store.updateSystem(actor, { businessId: business, systemId }, 1, { name: "Packages", purpose: null }))
      .resolves.toMatchObject({ id: systemId, kind: "pricing", name: "Packages", changeNumber: 2 });
    expect(rpc).toHaveBeenCalledWith("update_business_system", {
      p_workspace_id: business, p_user_id: actor.userId, p_verified_email: "owner@example.com",
      p_system_id: systemId, p_expected_change: 1, p_patch: { name: "Packages", purpose: null },
    });
  });

  it("reports kind refusal as a rule error, never an accepted update", async () => {
    const { store } = fake(null, { message: "system_kind_immutable" });
    await expect(store.updateSystem(actor, { businessId: business, systemId }, 1, { name: "Packages" }))
      .rejects.toMatchObject({ code: "system_kind_immutable", message: "A System keeps its kind for life." });
  });

  it("rejects a malformed response", async () => {
    const { store } = fake({ id: "not-a-system" });
    await expect(store.readGraph(actor, business)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
