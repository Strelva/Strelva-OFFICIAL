import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { readAgencyReleaseFlags, setAgencyReleaseFlag, setAgencyReleaseFlagCeiling } from "@/platform/release-flags/agency";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
const ws = "25600000-0000-4000-8000-000000000010", agency = "25600000-0000-4000-8000-000000000020", system = "25600000-0000-4000-8000-000000000040";
const actor = { userId: "25600000-0000-4000-8000-000000000003", verifiedEmail: "staff@example.test" };
const scope = { workspaceId: ws, agencyWorkspaceId: agency };
const flags = { ...scope, flags: [{ flag: "systems", ceiling: "operators", ceilingRevision: 3, systemId: system, systemName: "Website", verificationEffect: "publish", verified: true, state: "off", revision: 2, changedAt: null }] };
const input = { ...scope, flag: "systems" as const, state: "operators" as const, expectedRevision: 2, ceilingRevision: 3, reason: "Client review" };
const rpc = vi.fn();
beforeEach(() => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "workspace"); rpc.mockReset(); rpc.mockResolvedValue({ data: flags, error: null }); setReleaseFlagsDb({ rpc }); });
afterEach(() => { setReleaseFlagsDb(null); vi.unstubAllEnvs(); });
describe("explicit agency release permission", () => {
 it("binds a current actor, exact agency/business, flag and both revisions", async () => {
  expect((await setAgencyReleaseFlag(actor, input)).flags[0]).toMatchObject({ environment: "workspace", workspaceReleased: true });
  expect(rpc).toHaveBeenCalledWith("set_agency_workspace_release_flag", expect.objectContaining({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: ws, p_agency_id: agency, p_expected_revision: 2, p_ceiling_revision: 3 }));
 });
 it.each(["STRELVA_WORKSPACE_RELEASE", "STRELVA_SYSTEMS_RELEASE"])("the %s kill switch runs no setter", async key => {
  vi.stubEnv(key, "0"); await expect(setAgencyReleaseFlag(actor, input)).rejects.toMatchObject({ code: "agency_release_flag_paused" }); expect(rpc).not.toHaveBeenCalled();
 });
 it("never interprets missing storage or malformed data as permission", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } }); await expect(setAgencyReleaseFlag(actor, input)).rejects.toThrow("could not be changed");
  rpc.mockResolvedValue({ data: { ...flags, flags: [{ ...flags.flags[0], ceiling: "allow_all" }] }, error: null }); await expect(readAgencyReleaseFlags(actor, scope)).rejects.toThrow("malformed");
 });
 it.each(["agency_release_flag_not_permitted", "agency_release_flag_above_ceiling", "agency_release_flag_unverified", "agency_release_flag_system_mismatch"])("preserves SQL refusal %s", async code => {
  rpc.mockResolvedValue({ data: null, error: { message: code } }); await expect(setAgencyReleaseFlag(actor, input)).rejects.toMatchObject({ code });
 });
 it("does not return another agency or business from a malformed storage response", async () => {
  rpc.mockResolvedValue({ data: { ...flags, workspaceId: agency }, error: null }); await expect(readAgencyReleaseFlags(actor, scope)).rejects.toThrow("different business");
 });
 it("current authority loss and stale revisions fail closed", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "workspace_access_denied" } }); await expect(setAgencyReleaseFlag(actor, input)).rejects.toBeInstanceOf(WorkspaceAccessError);
  rpc.mockResolvedValue({ data: null, error: { message: "workspace_release_revision_conflict" } }); await expect(setAgencyReleaseFlag(actor, input)).rejects.toThrow("Reload");
 });
 it("the operator must explicitly name effect, System, agency and ceiling revision", async () => {
  await setAgencyReleaseFlagCeiling(actor, { ...scope, flag: "systems", systemId: system, verificationEffect: "publish", maxState: "operators", expectedRevision: 0, reason: "Platform review" });
  expect(rpc).toHaveBeenCalledWith("set_agency_release_flag_ceiling", expect.objectContaining({ p_system_id: system, p_agency_id: agency, p_verification_effect: "publish", p_max_state: "operators", p_expected_revision: 0 }));
 });
});
