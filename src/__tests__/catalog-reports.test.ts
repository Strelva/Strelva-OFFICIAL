import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handledReport, readCatalogReportHandled, recordCatalogReport, type CatalogReportReceipt } from "@/platform/catalog-reports/receipts";
import { readSearchConnection, recordSearchConnection } from "@/platform/catalog-reports/search-connection";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { readCatalogReportFailures } from "@/platform/catalog-reports/operator-source";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "22222222-2222-4222-8222-222222222222", verifiedEmail: "owner@example.test" };
const at = "2026-10-06T12:00:00.000Z";
const receipt: CatalogReportReceipt = { id: "33333333-3333-4333-8333-333333333333", workspaceId, tenantId: "site", kind: "monthly", period: "2026-09", status: "accepted", recipient: "owner@example.test", reason: null, providerMessageId: null, at };
const rpc = vi.fn();

beforeEach(() => {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_CATALOG_REPORTS_RELEASE", "1");
  rpc.mockReset().mockImplementation(async (name: string) => ({ error: null, data:
    name === "resolve_billing_workspace" ? { workspaceId } : name === "read_workspace_release_flags" ? { workspaceId, flags: {}, testers: [] } : name === "read_catalog_report_receipts" ? [receipt] : true,
  }));
  setReleaseFlagsDb({ rpc });
});
afterEach(() => { setReleaseFlagsDb(null); vi.unstubAllEnvs(); });

describe("catalog report release and receipts", () => {
  it("does no database lookup or write while flags are off, even with invalid new input", async () => {
    vi.stubEnv("STRELVA_CATALOG_REPORTS_RELEASE", "0");
    expect(await recordCatalogReport({ tenantId: "", kind: "monthly", period: "", status: "accepted" })).toBe(false);
    expect(await readCatalogReportHandled(actor, workspaceId, at)).toEqual([]);
    await recordSearchConnection("site", "unreachable", null);
    expect(await readSearchConnection("site", workspaceId)).toBeNull();
    expect(await readCatalogReportFailures(actor)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("obeys the workspace row kill switch", async () => {
    rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "resolve_billing_workspace" ? { workspaceId } : { workspaceId, flags: { catalog_reports: { state: "off", revision: 1, changedAt: at } }, testers: [] } }));
    expect(await recordCatalogReport(receipt)).toBe(false);
    expect(rpc.mock.calls.some(([name]) => name === "record_catalog_report_receipt")).toBe(false);
  });
  it("records accepted, suppressed and failed sends under the converted tenant", async () => {
    for (const status of ["accepted", "suppressed", "failed"] as const) expect(await recordCatalogReport({ ...receipt, status })).toBe(true);
    expect(rpc.mock.calls.filter(([name]) => name === "record_catalog_report_receipt").map(([, args]) => args.p_status)).toEqual(["accepted", "suppressed", "failed"]);
  });
  it("never retries sending when receipt persistence fails", async () => {
    rpc.mockImplementation(async (name: string) => ({ error: name === "record_catalog_report_receipt" ? { message: "database unavailable" } : null, data: name === "resolve_billing_workspace" ? { workspaceId } : { workspaceId, flags: {}, testers: [] } }));
    expect(await recordCatalogReport(receipt)).toBe(false);
    expect(rpc.mock.calls.filter(([name]) => name === "record_catalog_report_receipt")).toHaveLength(1);
    expect(await recordCatalogReport({ ...receipt, recipient: "invalid legacy owner address" })).toBe(false);
  });
  it("reads history using the verified workspace actor and preserves failures", async () => {
    expect(await readCatalogReportHandled(actor, workspaceId, at)).toEqual([handledReport(receipt)]);
    expect(rpc).toHaveBeenCalledWith("read_catalog_report_receipts", expect.objectContaining({ p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }));
    expect(handledReport({ ...receipt, status: "failed", reason: "provider_failed" }).sentence).toContain("Couldn't send");
    expect(handledReport({ ...receipt, status: "suppressed", reason: "email_paused" }).sentence).toContain("email paused");
    expect(handledReport(receipt).undo.state).toBe("not_undoable");
    expect(handledReport(receipt).evidence?.readBack).toBe("not_checked");
  });
  it("denies malformed and inaccessible history rather than showing an empty success", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "workspace_access_denied" } });
    await expect(readCatalogReportHandled(actor, workspaceId, at)).rejects.toThrow();
  });
});
