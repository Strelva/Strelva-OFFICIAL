import { afterEach, describe, expect, it, vi } from "vitest";
import { releaseFlagEnvMode } from "@/platform/release-flags/resolve";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { publishingEnabledForWorkspace, recordGoogleApprovalPolicyEnabled } from "@/products/publishing/release";
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: vi.fn(async () => false) }));
const workspaceId = "7f000000-0000-4000-8000-000000000010";
const actor = { userId: "7f000000-0000-4000-8000-000000000005", verifiedEmail: "owner@example.test" };
afterEach(() => { setReleaseFlagsDb(null); vi.unstubAllEnvs(); });
describe("publishing policy rollout", () => {
  it("defaults both publication and the undecided record/Google policy off without reading storage", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_PUBLISHING_RELEASE", "0");
    vi.stubEnv("STRELVA_RECORD_GOOGLE_APPROVAL_POLICY", "1");
    const rpc = vi.fn(); setReleaseFlagsDb({ rpc });
    expect(await publishingEnabledForWorkspace(workspaceId, actor)).toBe(false);
    expect(await recordGoogleApprovalPolicyEnabled(workspaceId, actor)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(releaseFlagEnvMode("publishing_record_google_policy", {})).toBe("off");
  });
  it("requires separate policy activation and respects a business off row", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_PUBLISHING_RELEASE", "1");
    vi.stubEnv("STRELVA_RECORD_GOOGLE_APPROVAL_POLICY", "0");
    setReleaseFlagsDb({ rpc: vi.fn(async () => ({ data: { workspaceId, flags: {}, testers: [], testerEmails: [] }, error: null })) });
    expect(await publishingEnabledForWorkspace(workspaceId, actor)).toBe(true);
    expect(await recordGoogleApprovalPolicyEnabled(workspaceId, actor)).toBe(false);
    vi.stubEnv("STRELVA_RECORD_GOOGLE_APPROVAL_POLICY", "workspace");
    setReleaseFlagsDb({ rpc: vi.fn(async () => ({ data: { workspaceId, flags: { publishing_record_google_policy: { state: "on", revision: 1, changedAt: "now" } }, testers: [], testerEmails: [] }, error: null })) });
    expect(await recordGoogleApprovalPolicyEnabled(workspaceId, actor)).toBe(true);
    setReleaseFlagsDb({ rpc: vi.fn(async () => ({ data: { workspaceId, flags: { publishing: { state: "off", revision: 1, changedAt: "now" }, publishing_record_google_policy: { state: "on", revision: 1, changedAt: "now" } }, testers: [], testerEmails: [] }, error: null })) });
    expect(await recordGoogleApprovalPolicyEnabled(workspaceId, actor)).toBe(false);
  });
});
