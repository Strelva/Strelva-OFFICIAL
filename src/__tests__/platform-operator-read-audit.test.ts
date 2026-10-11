import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/operator-queue/sources", () => ({ readAllSources: vi.fn() }));

import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { PostgresBusinessEffortStore } from "@/platform/business-effort/repository";
import { readCatalogReportFailures } from "@/platform/catalog-reports/operator-source";
import { readToolNoticeFailures } from "@/platform/catalog-reports/tool-notices";
import { readToolContactConflicts } from "@/platform/catalog-reports/tool-history";
import { readQueueContext, readGoogleWriteUncertainty, readReceipts, readListingReadbackFailures, setOperatorQueueDb } from "@/platform/operator-queue/store";
import { readOperatorQueue } from "@/platform/operator-queue/service";
import { OperatorQueueAccessError, OperatorQueueUnavailableError } from "@/platform/operator-queue/contracts";

const actor = { userId: "20090039-0000-4000-8000-000000000001", verifiedEmail: "operator@example.test" };
const context = { links: [], businesses: [], delegations: [], documentHealth: [], operators: [], marks: [], readbackFailures: [] };
const reads = [
  ["read_catalog_report_failures", () => readCatalogReportFailures(actor)],
  ["read_catalog_tool_notice_failures", () => readToolNoticeFailures(actor)],
  ["read_catalog_tool_contact_conflicts", () => readToolContactConflicts(actor)],
  ["read_operator_google_uncertainty", () => readGoogleWriteUncertainty(actor)],
  ["read_operator_queue_context_v2", () => readQueueContext(actor)],
  ["read_effort_businesses", () => PostgresBusinessEffortStore.listBusinesses(actor)],
] as const;

beforeEach(() => {
  for (const flag of ["STRELVA_WORKSPACE_RELEASE", "STRELVA_OPERATOR_QUEUE_RELEASE", "STRELVA_CATALOG_REPORTS_RELEASE", "STRELVA_SYSTEMS_RELEASE", "STRELVA_INTERNAL_TOOL_NOTICES_RELEASE"]) vi.stubEnv(flag, "1");
  mocks.rpc.mockReset().mockImplementation(async (_name, args) => ({ data: ["read_operator_queue_context_v2", "read_operator_queue_context"].includes(args.p_reader_name) ? context : [], error: null }));
  setReleaseFlagsDb({ rpc: mocks.rpc });
  setOperatorQueueDb({ rpc: mocks.rpc });
});
afterEach(() => { setReleaseFlagsDb(null); setOperatorQueueDb(null); vi.unstubAllEnvs(); });

describe("platform support reads through audited server composition", () => {
  it.each(reads)("%s uses only the atomic actor-bound wrapper", async (reader, read) => {
    await read();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_audited_platform_operator_source", {
      p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_reader_name: reader,
    });
  });
  it.each(reads)("%s releases no data and never falls back when the wrapper fails", async (_reader, read) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "fixture_audit_unavailable" } });
    await expect(read()).rejects.toThrow();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0]?.[0]).toBe("read_audited_platform_operator_source");
  });
  it.each(["platform_operator_read_access_denied", "fixture_audit_unavailable"])("queue stops before any service-role fallback on %s", async message => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    const readTenants = vi.fn().mockResolvedValue([]);
    const readSources = vi.fn().mockResolvedValue([]);
    await expect(readOperatorQueue(actor, { readContext: readQueueContext, readTenants, readSources, emailPaused: () => true }))
      .rejects.toBeInstanceOf(message === "platform_operator_read_access_denied" ? OperatorQueueAccessError : OperatorQueueUnavailableError);
    expect(readTenants).not.toHaveBeenCalled();
    expect(readSources).not.toHaveBeenCalled();
  });
  it("audits the flag-off legacy queue and fails closed before other sources", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0");
    mocks.rpc.mockResolvedValue({ data: context, error: null });
    await readQueueContext(actor);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_audited_platform_operator_detail", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_reader_name: "read_operator_queue_context" });
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { message: "fixture_audit_unavailable" } });
    const readTenants = vi.fn(); const readSources = vi.fn();
    await expect(readOperatorQueue(actor, { readContext: readQueueContext, readTenants, readSources, emailPaused: () => true })).rejects.toThrow();
    expect(readTenants).not.toHaveBeenCalled(); expect(readSources).not.toHaveBeenCalled();
  });
  it.each([
    ["read_business_effort", () => PostgresBusinessEffortStore.listEntries(actor, { from: "2026-01-01", businessId: actor.userId }), { p_from: "2026-01-01", p_business_id: actor.userId }],
    ["read_outside_write_receipts", () => readReceipts(actor, { tenantId: "fixture", workspaceId: actor.userId, limit: 25 }), { p_tenant_id: "fixture", p_workspace_id: actor.userId, p_limit: 25 }],
    ["read_google_listing_readback_failures_v2", () => readListingReadbackFailures(actor), {}],
  ] as const)("%s uses typed audited details and preserves filters", async (reader, read, args) => {
    await read();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_audited_platform_operator_detail", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_reader_name: reader, ...args });
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { message: "fixture_audit_unavailable" } });
    await expect(read()).rejects.toThrow(); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("preserves the legacy listing limit through the audited detail wrapper", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0");
    await readListingReadbackFailures(actor, 50);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_audited_platform_operator_detail", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_reader_name: "read_google_listing_readback_failures", p_limit: 50 });
  });
});
