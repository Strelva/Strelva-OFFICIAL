import { describe, expect, it, vi } from "vitest";
import { changeUnit, readUnits, type EnterpriseDb } from "@/platform/enterprise/server";
import { unitCommandSchema } from "@/platform/enterprise/contracts";
const org = "27400000-0000-4000-8000-000000000041", unit = "27400000-0000-4000-8000-000000000042", actor = { userId: "27400000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const command = { action: "put" as const, organizationId: org, id: unit, businessId: org, parentId: null, name: "North", kind: "location" as const, expectedRevision: 0 };
describe("Unit RPC boundaries", () => {
  it("passes current actor and exact optimistic version to the native write", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, id: unit, revision: 1 }, error: null });
    expect(await changeUnit(actor, command, { rpc })).toMatchObject({ revision: 1 });
    expect(rpc).toHaveBeenCalledWith("change_enterprise_unit", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_input: command });
  });
  it("rejects foreign organizations and duplicate units from storage", async () => {
    const db: EnterpriseDb = { rpc: vi.fn().mockResolvedValue({ error: null, data: { organizationId: unit, units: [], inaccessibleUnits: 0 } }) };
    await expect(readUnits(actor, org, db)).rejects.toThrow("malformed");
  });
  it("preserves denied, stale and unavailable failures", async () => {
    for (const [code, expected] of [["enterprise_denied", "access denied"], ["enterprise_stale", "changed"], ["enterprise_cycle", "hierarchy"], ["network", "confirmed"]]) await expect(changeUnit(actor, command, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: code } }) })).rejects.toThrow(expected);
  });
  it("does not accept caller fields that grant hierarchy membership or lock local data", () => {
    expect(unitCommandSchema.safeParse({ ...command, role: "owner" }).success).toBe(false);
  });
  it("a mismatched receipt cannot claim a write", async () => {
    await expect(changeUnit(actor, command, { rpc: vi.fn().mockResolvedValue({ error: null, data: { ok: true, id: unit, revision: 2 } }) })).rejects.toThrow("malformed");
  });
});
