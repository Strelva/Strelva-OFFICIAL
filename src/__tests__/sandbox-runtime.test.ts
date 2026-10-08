import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureSandboxApplicationRuntime } from "@/products/custom-applications/sandbox-runtime";
import { customApplicationSchema } from "@/products/custom-applications/contracts";
import { customApplicationSourceDigest } from "@/products/custom-applications/lifecycle";
const actor = { userId: "cc335000-0000-4000-8000-000000000001", verifiedEmail: "runtime-owner@example.test" };
const files = { "build.mjs": "Reviewed fictional source" };
const app = customApplicationSchema.parse({ version: 1, workId: "cc335000-0000-4000-8000-000000000020", workspaceId: "cc335000-0000-4000-8000-000000000010", title: "Fictional runtime", maintenanceOwner: actor.userId, status: "draft",
  candidate: { version: 1, revision: 0, title: "Fictional runtime", files, sourceDigest: customApplicationSourceDigest(files), artifact: null }, currentReleaseVersion: null, releases: [], budget: { jobId: "cc335000-0000-4000-8000-000000000030", maxAuthorizedCents: 100, estimateCents: null, status: "accepted" }, updatedAt: "2026-10-08T00:00:00Z" });
beforeEach(() => {
  vi.stubEnv("STRELVA_CUSTOM_APPLICATION_BUILD_PROVIDER", "vercel-sandbox"); vi.stubEnv("STRELVA_SANDBOX_RUNTIME_APPROVED", "1"); vi.stubEnv("STRELVA_SANDBOX_2048MB_CONTRACT_APPROVED", "1");
  vi.stubEnv("STRELVA_SANDBOX_TEAM_ID", "team_Exact"); vi.stubEnv("STRELVA_SANDBOX_PROJECT_ID", "prj_Exact"); vi.stubEnv("STRELVA_SANDBOX_BUILD_IMAGE", `fixture/node@sha256:${"a".repeat(64)}`); vi.stubEnv("STRELVA_SANDBOX_POLICY_VERSION", "fixture-v1");
});
afterEach(() => vi.unstubAllEnvs());
describe("native custom application Sandbox lifecycle selection", () => {
  it("refuses a missing resource contract approval before provider access", () => {
    vi.stubEnv("STRELVA_SANDBOX_2048MB_CONTRACT_APPROVED", "0");
    const rpc = vi.fn(); const fetcher = vi.fn();
    expect(() => configureSandboxApplicationRuntime(actor, app, { rpc }, fetcher)).toThrow(/requires approval/);
    expect(rpc).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the exact source qualification before budget/provider admission", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null })); const fetcher = vi.fn();
    const runtime = configureSandboxApplicationRuntime(actor, app, { rpc }, fetcher);
    await expect(runtime.build({ workspaceId: app.workspaceId, resourceId: app.workId, applicationVersion: 1, files })).rejects.toThrow(/not qualified/);
    expect(rpc.mock.calls[0]).toEqual(["assert_custom_sandbox_runtime", expect.objectContaining({ p_work: app.workId, p_revision: 0, p_digest: app.candidate.sourceDigest, p_policy: "fixture-v1" })]);
    expect(rpc).toHaveBeenCalledTimes(1); expect(fetcher).not.toHaveBeenCalled();
  });
  it("starts the qualified provider ledger once, with no Docker zero-cost wrapper", async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === "assert_custom_sandbox_runtime" ? true : { id: "cc335000-0000-4000-8000-000000000040", work_id: app.workId, attempt_name: "wrong-name", job_id: app.budget!.jobId, execution_key: "sandbox-build-fixture", maximum_cents: 100 }, error: null }));
    const fetcher = vi.fn(); const runtime = configureSandboxApplicationRuntime(actor, app, { rpc }, fetcher);
    await expect(runtime.build({ workspaceId: app.workspaceId, resourceId: app.workId, applicationVersion: 1, files })).rejects.toThrow(/attempt mismatch/);
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["assert_custom_sandbox_runtime", "prepare_qualified_sandbox_build_attempt"]);
    expect(fetcher).not.toHaveBeenCalled();
    const recheck = vi.fn(); const perform = vi.fn(async () => "artifact-fixture");
    expect(await runtime.execute(actor, { workspaceId: app.workspaceId, workId: app.workId, version: 1, jobId: app.budget!.jobId, maximumCents: 100 }, perform, recheck)).toMatchObject({ disposition: "performed", value: "artifact-fixture" });
    expect(recheck).toHaveBeenCalledTimes(1); expect(perform).toHaveBeenCalledTimes(1);
  });
});
