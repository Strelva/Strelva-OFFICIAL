import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const readBuiltInAppRelease = vi.fn();
const listCareReports = vi.fn();
const generateCareReports = vi.fn();
vi.mock("@/platform/app-releases/server", () => ({ readBuiltInAppRelease: (...args: unknown[]) => readBuiltInAppRelease(...args) }));
vi.mock("@/platform/care-reports/service", () => ({
  listCareReports: (...args: unknown[]) => listCareReports(...args),
  generateCareReports: (...args: unknown[]) => generateCareReports(...args),
  readCareReport: vi.fn(),
}));
vi.mock("@/platform/infra/domain-health", () => ({ getDomainHealth: vi.fn(async () => null) }));
vi.mock("@/platform/care-reports/delivery", () => ({ sendCareReportRelease: vi.fn() }));

import type { DomainCheck } from "@/platform/infra/domain-health";
import { careReportsAvailableFor, generateAgencyCareReports, siteChecksFor } from "@/server/care-reports/server";

const actor = { userId: "u", verifiedEmail: "a@example.test" };
const AGENCY = "7f000000-0000-4000-8000-0000000000a0";
const id = (n: number) => `7f000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const client = (n: number, patch: Record<string, unknown> = {}) => ({
  workspaceId: id(n), name: `Client ${n}`, canWrite: true, tenantIds: [], report: null, soFar: { releasesRecorded: 0, changesVerified: 0 }, ...patch,
});
const list = (clients: unknown[]) => ({ agencyWorkspaceId: AGENCY, month: "2026-10", canGenerate: true, clients });

beforeEach(() => {
  readBuiltInAppRelease.mockReset().mockResolvedValue({ appId: "care_reports", available: true, release: 1, requiredConnections: [] });
  listCareReports.mockReset();
  generateCareReports.mockReset().mockImplementation(async (_actor, input: { workspaceIds: string[] }) => ({
    reports: input.workspaceIds.map(workspaceId => ({ reportId: workspaceId, workspaceId, revision: 1 })), skipped: [],
  }));
});

describe("Care plan reports server", () => {
  it("leaves out a business where the App is off or unreadable", async () => {
    readBuiltInAppRelease.mockImplementation(async (_app: string, workspaceId: string) => {
      if (workspaceId === id(2)) return { appId: "care_reports", available: false };
      if (workspaceId === id(3)) throw new Error("down");
      return { appId: "care_reports", available: true, release: 1, requiredConnections: [] };
    });
    expect([...await careReportsAvailableFor([id(1), id(2), id(3)])]).toEqual([id(1)]);
  });

  it("skips clients whose App is not available and never calls the RPC for them", async () => {
    listCareReports.mockResolvedValue(list([client(1), client(2)]));
    readBuiltInAppRelease.mockImplementation(async (_app: string, workspaceId: string) => workspaceId === id(2)
      ? { appId: "care_reports", available: false } : { appId: "care_reports", available: true, release: 1, requiredConnections: [] });
    const result = await generateAgencyCareReports(actor, { agencyWorkspaceId: AGENCY, month: "2026-10" });
    expect(result.skipped).toEqual([{ workspaceId: id(2), name: "Client 2", reason: "not_available" }]);
    expect(generateCareReports).toHaveBeenCalledTimes(1);
    expect(generateCareReports.mock.calls[0]![1].workspaceIds).toEqual([id(1)]);
  });

  it("refuses staff ids and unknown ids as not allowed", async () => {
    listCareReports.mockResolvedValue(list([client(1, { canWrite: false }), client(2)]));
    const result = await generateAgencyCareReports(actor, { agencyWorkspaceId: AGENCY, month: "2026-10", workspaceIds: [id(1), id(9)] });
    expect(result.skipped).toEqual(expect.arrayContaining([
      { workspaceId: id(9), name: "", reason: "not_allowed" }, { workspaceId: id(1), name: "Client 1", reason: "not_allowed" },
    ]));
    expect(generateCareReports).not.toHaveBeenCalled();
    expect(result.generated).toBe(0);
  });

  it("generates 60 clients in three calls", async () => {
    listCareReports.mockResolvedValue(list(Array.from({ length: 60 }, (_, i) => client(i + 1))));
    const result = await generateAgencyCareReports(actor, { agencyWorkspaceId: AGENCY, month: "2026-10" });
    expect(generateCareReports).toHaveBeenCalledTimes(3);
    expect(generateCareReports.mock.calls.map(call => call[1].workspaceIds.length)).toEqual([25, 25, 10]);
    expect(result.generated).toBe(60);
  });

  it("makes no RPC when there is nobody to generate for", async () => {
    listCareReports.mockResolvedValue(list([]));
    await expect(generateAgencyCareReports(actor, { agencyWorkspaceId: AGENCY, month: "2026-10" })).resolves.toEqual({ generated: 0, reports: [], skipped: [] });
    expect(generateCareReports).not.toHaveBeenCalled();
  });

  it("maps a tenant to host, state and the latest check time, capped at ten", async () => {
    const check = (host: string, checkedAt: string): DomainCheck => ({ host, kind: "custom", url: `https://${host}`, httpStatus: 200, bytes: 1, state: "up", expiresAt: null, daysToExpiry: null, checkedAt, latencyMs: 1 });
    const result = await siteChecksFor(
      [{ workspaceId: id(1), tenantIds: ["a", "b"] }, { workspaceId: id(2), tenantIds: Array.from({ length: 12 }, (_, i) => `t${i}`) }, { workspaceId: id(3), tenantIds: ["none"] }],
      { read: async () => ({
        scannedAt: "2026-10-15T00:00:00Z",
        results: [
          { tenantId: "a", siteName: "A", ownerName: "", primaryHost: "juniper.com", checks: [check("juniper.com", "2026-10-14T09:00:00Z"), check("x.juniper.com", "2026-10-14T11:00:00Z")], worst: "up", nearestExpiryDays: null },
          { tenantId: "b", siteName: "B", ownerName: "", primaryHost: null, checks: [], worst: "down", nearestExpiryDays: null },
          ...Array.from({ length: 12 }, (_, i) => ({ tenantId: `t${i}`, siteName: "T", ownerName: "", primaryHost: `h${i}.test`, checks: [check(`h${i}.test`, "2026-10-14T00:00:00Z")], worst: "up" as const, nearestExpiryDays: null })),
        ],
      }) },
    );
    expect(result[id(1)]).toEqual([
      { host: "juniper.com", state: "up", checkedAt: "2026-10-14T11:00:00Z" },
      { host: "b", state: "down", checkedAt: "2026-10-15T00:00:00Z" },
    ]);
    expect(result[id(2)]).toHaveLength(10);
    expect(result[id(3)]).toBeUndefined();
  });

  it("returns nothing when there is no stored snapshot", async () => {
    await expect(siteChecksFor([{ workspaceId: id(1), tenantIds: ["a"] }], { read: async () => null })).resolves.toEqual({});
  });
});
