import { describe, expect, it, vi } from "vitest";
import { tenantAgencyWorkspace } from "@/experience/operator/agency-entry";
describe("operator client entry under an ordinary agency seat", () => {
  it("does not open client work from a platform identity alone", async () => {
    const workspace = vi.fn(async () => "business-workspace");
    const seat = vi.fn(async () => null);
    expect(await tenantAgencyWorkspace("client", { user: async () => "operator", seat, workspace })).toBeNull();
    expect(workspace).not.toHaveBeenCalled();
  });
  it("opens only the tenant's trusted business after ordinary agency access is established", async () => {
    const seat = vi.fn(async () => "ordinary-agency"), workspace = vi.fn(async () => "business-workspace");
    expect(await tenantAgencyWorkspace("client", { user: async () => "person", seat, workspace })).toBe("business-workspace");
    expect(seat).toHaveBeenCalledWith("person", "client"); expect(workspace).toHaveBeenCalledWith("client");
    seat.mockRejectedValueOnce(new Error("permission read unavailable"));
    expect(await tenantAgencyWorkspace("client", { user: async () => "person", seat, workspace })).toBeNull();
  });
});
