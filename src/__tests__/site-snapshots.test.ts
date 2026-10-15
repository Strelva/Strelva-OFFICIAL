vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: vi.fn(async () => undefined), authorizeTenantOperatorRead: vi.fn(async () => undefined) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedCronRequest } from "@/__tests__/support/cron";

const mockGetContent = vi.hoisted(() => vi.fn());
const mockSetContent = vi.hoisted(() => vi.fn());
const mockReadDevContent = vi.hoisted(() => vi.fn());
const mockWriteDevContent = vi.hoisted(() => vi.fn());
const mockGetTenantFromHeaders = vi.hoisted(() => vi.fn());
const mockRequireTenantAccess = vi.hoisted(() => vi.fn());
const mockRequireTenantPermission = vi.hoisted(() => vi.fn());
const mockRequireActiveSubscription = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockPruneOldEvents = vi.hoisted(() => vi.fn());

const mockRevalidateClientSite = vi.hoisted(() => vi.fn());
const devStores = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("@/lib/storage/core", () => ({
  DEFAULT_TENANT: "demo",
  hasSanity: false,
  readDevContent: (...args: unknown[]) => mockReadDevContent(...args),
  writeDevContent: (...args: unknown[]) => mockWriteDevContent(...args),
}));

vi.mock("@/lib/storage/content-store", () => ({
  getContent: (...args: unknown[]) => mockGetContent(...args),
  setContent: (...args: unknown[]) => mockSetContent(...args),
}));

vi.mock("@/lib/tenant", () => ({
  getTenantFromHeaders: () => mockGetTenantFromHeaders(),
}));

vi.mock("@/platform/infra/auth", () => ({
  getActorContext: (...args: unknown[]) => mockGetActorContext(...args),
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
  requireTenantPermission: (...args: unknown[]) => mockRequireTenantPermission(...args),
}));

vi.mock("@/lib/subscription", () => ({
  requireActiveSubscription: (...args: unknown[]) => mockRequireActiveSubscription(...args),
}));

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    logActivity: (...args: unknown[]) => mockLogActivity(...args),
    logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
  };
});

vi.mock("@/lib/revalidate-client", () => ({
  revalidateClientSite: (...args: unknown[]) => mockRevalidateClientSite(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/tenants", () => ({
  getAllTenants: (...args: unknown[]) => mockGetAllTenants(...args),
}));

vi.mock("@/lib/events", () => ({
  pruneOldEvents: (...args: unknown[]) => mockPruneOldEvents(...args),
}));

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  devStores.clear();
  mockReadDevContent.mockImplementation((tenant: string) =>
    Promise.resolve({ ...(devStores.get(tenant) ?? {}) }),
  );
  mockWriteDevContent.mockImplementation((store: Record<string, unknown>, tenant: string) => {
    devStores.set(tenant, structuredClone(store));
    return Promise.resolve();
  });
  mockGetContent.mockImplementation((section: string, tenant: string) =>
    Promise.resolve({ section, tenant, value: `${section}-content` }),
  );
  mockSetContent.mockResolvedValue(undefined);
  mockGetTenantFromHeaders.mockResolvedValue("demo");
  mockRequireTenantAccess.mockResolvedValue(null);
  mockRequireTenantPermission.mockResolvedValue(null);
  mockRequireActiveSubscription.mockResolvedValue(null);
  mockGetActorContext.mockResolvedValue({
    userId: "user_123",
    email: "owner@example.com",
    type: "user",
    isSuperAdmin: false,
    isImpersonating: false,
  });
  mockLogActivity.mockResolvedValue(undefined);
  mockLogAuditEvent.mockResolvedValue(undefined);
  mockRevalidateClientSite.mockResolvedValue({ success: true, skipped: true });
  mockGetAllTenants.mockResolvedValue([{ id: "demo", active: true }]);
  mockPruneOldEvents.mockResolvedValue(2);
});

describe("site snapshots", () => {
  it("captures all editable site sections and returns summaries without content blobs", async () => {
    const { createSiteSnapshot, getSiteSnapshots, SITE_SNAPSHOT_SECTIONS } = await import("@/lib/storage/site-snapshot-store");

    const snapshot = await createSiteSnapshot("demo", {
      reason: "manual",
      label: "Before launch edits",
      author: "user",
    });
    const summaries = await getSiteSnapshots("demo");

    expect(snapshot.sections).toEqual(SITE_SNAPSHOT_SECTIONS);
    expect(mockGetContent).toHaveBeenCalledTimes(SITE_SNAPSHOT_SECTIONS.length);
    expect(summaries[0]).toMatchObject({
      id: snapshot.id,
      label: "Before launch edits",
      reason: "manual",
      status: "available",
    });
    expect("data" in summaries[0]!).toBe(false);
  });

  it("restores a snapshot and saves a pre-restore backup", async () => {
    const { createSiteSnapshot, getSiteSnapshots, restoreSiteSnapshot, SITE_SNAPSHOT_SECTIONS } = await import("@/lib/storage/site-snapshot-store");
    const snapshot = await createSiteSnapshot("demo", {
      reason: "manual",
      label: "Known good",
      author: "user",
    });

    const result = await restoreSiteSnapshot("demo", snapshot.id, {
      actor: {
        userId: "user_123",
        email: "owner@example.com",
        type: "user",
        isSuperAdmin: false,
      },
    });
    const summaries = await getSiteSnapshots("demo");

    expect(result.restored.status).toBe("restored");
    expect(result.preRestore.reason).toBe("pre_restore");
    expect(mockSetContent).toHaveBeenCalledTimes(SITE_SNAPSHOT_SECTIONS.length);
    expect(summaries.map((item) => item.reason)).toContain("pre_restore");
  });

  it("dedupes daily backups for the same tenant and date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
    const { createDailySiteSnapshot, getSiteSnapshots } = await import("@/lib/storage/site-snapshot-store");

    const first = await createDailySiteSnapshot("demo");
    const second = await createDailySiteSnapshot("demo");
    const snapshots = await getSiteSnapshots("demo");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(snapshots.filter((snapshot) => snapshot.reason === "daily")).toHaveLength(1);
  });

  it("site snapshot route creates and restores owner-visible backups", async () => {
    const { POST } = await import("@/app/api/site-snapshots/route");

    const createResponse = await POST(new Request("http://localhost/api/site-snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", label: "Manual backup" }),
    }));
    const createBody = await createResponse.json();
    const restoreResponse = await POST(new Request("http://localhost/api/site-snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", snapshotId: createBody.snapshot.id }),
    }));

    expect(createResponse.status).toBe(201);
    expect(restoreResponse.status).toBe(200);
    await expect(restoreResponse.json()).resolves.toMatchObject({
      restored: { label: "Manual backup", status: "restored" },
      preRestore: { reason: "pre_restore" },
    });
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({
      text: "Saved a full-site backup",
    }), "demo");
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({
      text: "Restored full site from Manual backup",
    }), "demo");
  });

  async function restoreViaRoute(snapshotId?: string) {
    const { POST } = await import("@/app/api/site-snapshots/route");
    const post = (body: Record<string, unknown>) => POST(new Request("http://localhost/api/site-snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    const id = snapshotId ?? (await (await post({ action: "create" })).json()).snapshot.id;
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSetContent.mockClear();
    return post({ action: "restore", snapshotId: id });
  }

  it("restoring an unknown backup is a 404", async () => {
    const response = await restoreViaRoute("snap_missing");
    expect(response.status).toBe(404);
  });

  it("a failed section write rolls back and says so", async () => {
    const { POST } = await import("@/app/api/site-snapshots/route");
    const created = await (await POST(new Request("http://localhost/x", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }),
    }))).json();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSetContent.mockClear();
    mockSetContent.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk"));
    const response = await POST(new Request("http://localhost/x", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", snapshotId: created.snapshot.id }),
    }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ restored: false, rolledBack: true, sectionsNeedingAttention: [] });
    // The first section was written, then put back with its prior content.
    expect(mockSetContent).toHaveBeenCalledTimes(3);
    expect(mockSetContent.mock.calls[2]![1]).toMatchObject({ value: `${mockSetContent.mock.calls[0]![0]}-content` });
  });

  it("names the sections that could not be put back", async () => {
    const { POST } = await import("@/app/api/site-snapshots/route");
    const created = await (await POST(new Request("http://localhost/x", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }),
    }))).json();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSetContent.mockClear();
    mockSetContent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("disk"))
      .mockRejectedValueOnce(new Error("still down"));
    const response = await POST(new Request("http://localhost/x", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", snapshotId: created.snapshot.id }),
    }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.rolledBack).toBe(false);
    expect(body.sectionsNeedingAttention).toHaveLength(1);
    expect(body.error).toContain(body.sectionsNeedingAttention[0]);
  });

  it("a bookkeeping failure after a successful restore is still a 200", async () => {
    mockLogActivity.mockImplementation(async (entry: { text: string }) => {
      if (entry.text.startsWith("Restored")) throw new Error("activity down");
    });
    const response = await restoreViaRoute();
    expect(response.status).toBe(200);
  });

  it("a successful restore refreshes the live site and reports it", async () => {
    const response = await restoreViaRoute();
    expect(response.status).toBe(200);
    expect(mockRevalidateClientSite).toHaveBeenCalledWith("demo", "all");
    await expect(response.json()).resolves.toMatchObject({ liveSite: { status: "not_configured" } });
  });

  it("maintenance creates one daily backup per active tenant while pruning events", async () => {
    const { GET } = await import("@/app/api/cron/maintenance/route");

    const response = await GET(authenticatedCronRequest());

    await expect(response.json()).resolves.toMatchObject({
      tenants: 1,
      eventsPruned: 2,
      snapshotsCreated: 1,
      errors: 0,
    });
  });
});
