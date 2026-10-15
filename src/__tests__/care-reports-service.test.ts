import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import {
  generateCareReports, listCareReports, publishCareReport, readCareReport, reserveCareReportDelivery, saveCareReportNote, setCareReportsDb,
} from "@/platform/care-reports/service";
import { AGENCY, BUSINESS, REPORT } from "./care-reports-fixtures";

const actor = { userId: "7f000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const fail = (message: string) => ({ data: null, error: { message } });
afterEach(() => setCareReportsDb(null));

describe("Care plan reports service", () => {
  it("sends the month as the first of the month and checks the list belongs to the agency", async () => {
    const rpc = vi.fn(async () => ({ data: { agencyWorkspaceId: AGENCY, month: "2026-10", canGenerate: true, clients: [] }, error: null }));
    setCareReportsDb({ rpc });
    await expect(listCareReports(actor, AGENCY, "2026-10")).resolves.toMatchObject({ canGenerate: true });
    expect(rpc).toHaveBeenCalledWith("list_care_reports", { p_agency: AGENCY, p_user: actor.userId, p_email: actor.verifiedEmail, p_month: "2026-10-01" });
    setCareReportsDb({ rpc: async () => ({ data: { agencyWorkspaceId: BUSINESS, month: "2026-10", canGenerate: true, clients: [] }, error: null }) });
    await expect(listCareReports(actor, AGENCY, "2026-10")).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("maps each database error to its class", async () => {
    const cases: Array<[string, unknown]> = [
      ["workspace_access_denied", WorkspaceAccessError],
      ["care_report_not_found", WorkspaceAccessError],
      ["care_report_revision_conflict", WorkspaceConflictError],
      ["care_report_delivery_exists", WorkspaceConflictError],
      ["care_report_not_published", WorkspaceConflictError],
      ["care_time_conflict", WorkspaceConflictError],
      ["care_report_invalid", ZodError],
      ["care_time_invalid", ZodError],
      ["something_else", WorkspaceStoreError],
    ];
    for (const [message, cls] of cases) {
      setCareReportsDb({ rpc: async () => fail(message) });
      await expect(readCareReport(actor, REPORT), message).rejects.toBeInstanceOf(cls as new () => Error);
    }
    setCareReportsDb({ rpc: async () => fail("care_report_revision_conflict") });
    await expect(saveCareReportNote(actor, REPORT, "x", 1)).rejects.toThrow("This report changed since you opened it. Reload, then try again.");
    setCareReportsDb({ rpc: async () => fail("care_report_delivery_exists") });
    await expect(reserveCareReportDelivery(actor, REPORT)).rejects.toThrow("This Release was already emailed.");
  });

  it("treats a schema mismatch as a store error", async () => {
    setCareReportsDb({ rpc: async () => ({ data: { releaseId: "nope" }, error: null }) });
    await expect(publishCareReport(actor, REPORT, 1)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("passes named arguments to generate", async () => {
    const rpc = vi.fn(async () => ({ data: { reports: [], skipped: [] }, error: null }));
    setCareReportsDb({ rpc });
    await generateCareReports(actor, { agencyWorkspaceId: AGENCY, month: "2026-10", workspaceIds: [BUSINESS], siteChecks: {} });
    expect(rpc).toHaveBeenCalledWith("generate_care_reports", expect.objectContaining({ p_month: "2026-10-01", p_workspace_ids: [BUSINESS], p_site_checks: {} }));
  });
});
