import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/auth", () => ({
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
    expect("data" in summaries[0]).toBe(false);
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

  it("maintenance creates one daily backup per active tenant while pruning events", async () => {
    const { GET } = await import("@/app/api/cron/maintenance/route");

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      tenants: 1,
      eventsPruned: 2,
      snapshotsCreated: 1,
      errors: 0,
    });
  });
});
