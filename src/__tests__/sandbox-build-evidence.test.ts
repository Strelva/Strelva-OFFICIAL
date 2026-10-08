import { describe, expect, it, vi } from "vitest";
import { createSandboxBuildEvidence } from "@/products/custom-applications/sandbox-build-evidence";

const actor = { userId: "cc334000-0000-4000-8000-000000000001", verifiedEmail: "sandbox-owner@example.test" };
const target = { workId: "cc334000-0000-4000-8000-000000000020", candidateRevision: 0, teamId: "team_fixture", projectId: "prj_fixture", image: `fixture/node@sha256:${"a".repeat(64)}` };
const attempt = { id: "cc334000-0000-4000-8000-000000000030", work_id: target.workId, attempt_name: `strelva-build-${"b".repeat(48)}`, job_id: "cc334000-0000-4000-8000-000000000040", execution_key: "fixture-exact-attempt", maximum_cents: 100 };
const evidenceId = "cc334000-0000-4000-8000-000000000050";
const source = { workspaceId: "cc334000-0000-4000-8000-000000000010", resourceId: target.workId, applicationVersion: 1, files: { "build.mjs": "Fictional no execution" } };
const bill = { teamId: target.teamId, projectId: target.projectId, sessionId: "sbx_fixture", currency: "usd", billableUsd: "0.023", providerReference: "fictional-independent-billing-authority" };
function fixture(options: { deny?: string; foreignWork?: boolean; enabled?: boolean; eligibilityUnavailable?: boolean } = {}) {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
    expect(_args).toBeTypeOf("object");
    if (name === options.deny) return { data: null, error: { message: "durable proof unavailable" } };
    return { data: name === "prepare_sandbox_build_attempt" ? attempt
      : name === "read_sandbox_build_attempt" ? { attempt: { ...attempt, work_id: options.foreignWork ? "cc334000-0000-4000-8000-000000000099" : target.workId } }
      : name === "record_sandbox_build_billing_evidence" || name === "record_sandbox_build_observation" ? evidenceId : { fixture: true }, error: null };
  });
  const eligibility = vi.fn(async () => { if (options.eligibilityUnavailable) throw new Error("Custom listed runtime remains unsupported"); });
  return { rpc, eligibility, service: createSandboxBuildEvidence({ rpc }, actor, target, { enabled: () => options.enabled !== false, assertListedRuntimeEligibility: eligibility }) };
}
describe("optional durable Sandbox authority (fictional receipts only)", () => {
  it("rechecks eligibility, prepares exact budget/source attempt, then starts once", async () => {
    const f = fixture(); await f.service.configuration.admit(source, "a".repeat(64), attempt.attempt_name);
    expect(f.eligibility).toHaveBeenCalledTimes(2);
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["prepare_sandbox_build_attempt", "begin_sandbox_build_attempt"]);
    expect(f.rpc.mock.calls[0]?.[1]).toMatchObject({ p_work: target.workId, p_version: 1, p_revision: 0, p_user: actor.userId, p_team: target.teamId, p_project: target.projectId });
  });
  it.each([{ enabled: false }, { eligibilityUnavailable: true }])("refuses unsupported or disabled admission before durable claims", async options => {
    const f = fixture(options); await expect(f.service.configuration.admit(source, "a".repeat(64), attempt.attempt_name)).rejects.toThrow(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("refuses another resource and an observation without exact admission", async () => {
    const f = fixture(); await expect(f.service.configuration.admit({ ...source, resourceId: evidenceId }, "a".repeat(64), attempt.attempt_name)).rejects.toThrow();
    await expect(f.service.configuration.observe?.({ attemptName: attempt.attempt_name, kind: "created", sessionId: "sbx_fixture", payload: {} })).rejects.toThrow(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("does not launch on a held or ambiguous durable attempt", async () => {
    const f = fixture({ deny: "begin_sandbox_build_attempt" }); await expect(f.service.configuration.admit(source, "a".repeat(64), attempt.attempt_name)).rejects.toThrow();
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["prepare_sandbox_build_attempt", "begin_sandbox_build_attempt"]);
  });
  it("records observations as counters without an amount or financial call", async () => {
    const f = fixture(); await f.service.configuration.admit(source, "a".repeat(64), attempt.attempt_name);
    await f.service.configuration.observe?.({ attemptName: attempt.attempt_name, kind: "stopped", sessionId: "sbx_fixture", payload: { activeCpuDurationMs: 142, ingressBytes: 500, egressBytes: 200 } });
    expect(f.rpc.mock.calls.at(-1)).toEqual(["record_sandbox_build_observation", expect.objectContaining({ p_payload: { activeCpuDurationMs: 142, ingressBytes: 500, egressBytes: 200 } })]);
    expect(f.rpc.mock.calls.some(([n]) => n === "reconcile_sandbox_build_billing")).toBe(false);
  });
  it("stores trusted decimal billing evidence before a separate reconciliation transaction", async () => {
    const f = fixture({ deny: "reconcile_sandbox_build_billing" }); const resolver = vi.fn(async () => bill);
    await expect(f.service.reconcileBilling(attempt.id, resolver)).rejects.toThrow();
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["read_sandbox_build_attempt", "record_sandbox_build_billing_evidence", "reconcile_sandbox_build_billing"]);
    expect(f.rpc.mock.calls[1]?.[1]).toMatchObject({ p_usd: "0.023", p_session: "sbx_fixture" });
  });
  it("authorizes exact attempt before querying billing authority", async () => {
    const f = fixture({ foreignWork: true }); const resolver = vi.fn(async () => bill);
    await expect(f.service.reconcileBilling(attempt.id, resolver)).rejects.toThrow("target mismatch"); expect(resolver).not.toHaveBeenCalled();
  });
  it("rejects foreign scope or non-USD evidence without financial mutation", async () => {
    for (const value of [{ ...bill, teamId: "team_foreign" }, { ...bill, currency: "cad" }]) {
      const f = fixture(); await expect(f.service.reconcileBilling(attempt.id, async () => value)).rejects.toThrow();
      expect(f.rpc.mock.calls.map(([n]) => n)).toEqual(["read_sandbox_build_attempt"]);
    }
  });
});
