import { describe, expect, it, vi } from "vitest";
import { recordFunnelEvent } from "@/platform/infra/funnel";

describe("direct-door funnel events (ADR 0015)", () => {
  it("records a step with its reference and scope", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await recordFunnelEvent("check_run", "audit_0123456789abcdef0123456789abcdef", { agencyWorkspaceId: "11111111-1111-4111-8111-111111111111" }, { rpc });
    expect(rpc).toHaveBeenCalledWith("record_funnel_event", { p_step: "check_run", p_ref: "audit_0123456789abcdef0123456789abcdef", p_workspace_id: null, p_agency_workspace_id: "11111111-1111-4111-8111-111111111111" });
  });
  it("never throws or blocks the step it measures, and skips a malformed reference", async () => {
    const rpc = vi.fn(async () => { throw new Error("db down"); });
    await expect(recordFunnelEvent("first_live", "ws-1", {}, { rpc })).resolves.toBeUndefined();
    await recordFunnelEvent("check_run", "bad ref with spaces", {}, { rpc });
    expect(rpc).toHaveBeenCalledTimes(1);
    await expect(recordFunnelEvent("check_run", "audit_x", {}, null)).resolves.toBeUndefined();
  });
});
