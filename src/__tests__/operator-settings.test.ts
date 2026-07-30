import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockGetRedis = vi.hoisted(() => vi.fn());
const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));
vi.mock("@/lib/auth", () => ({
  isSuperAdmin: mockIsSuperAdmin,
  getActorContext: mockGetActorContext,
}));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mockGetTenantConfig }));

/** Minimal in-memory Redis stand-in. */
function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    }),
  };
}

const TENANT = "acme";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSuperAdmin.mockResolvedValue(true);
  mockGetActorContext.mockResolvedValue({
    userId: "u_test",
    email: "jacob@strelva.com",
    type: "super_admin",
    isSuperAdmin: true,
    isImpersonating: false,
  });
  mockLogAuditEvent.mockResolvedValue(undefined);
  mockGetTenantConfig.mockResolvedValue({ id: TENANT });
});

// ---------------------------------------------------------------------------
// setReportCadence round-trip
// ---------------------------------------------------------------------------

describe("setReportCadence", () => {
  it("round-trips through Redis and defaults to monthly", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const { getReportCadence, setReportCadence } = await import("@/lib/report-cadence");

    expect(await getReportCadence(TENANT)).toBe("monthly");
    expect(await setReportCadence(TENANT, "weekly")).toBe("weekly");
    expect(await getReportCadence(TENANT)).toBe("weekly");
    expect(await setReportCadence(TENANT, "monthly")).toBe("monthly");
    expect(await getReportCadence(TENANT)).toBe("monthly");
  });

  it("coerces an unknown value to monthly and is a no-op without Redis", async () => {
    mockGetRedis.mockReturnValue(null);
    const { setReportCadence } = await import("@/lib/report-cadence");
    // @ts-expect-error deliberately passing a bad value to prove coercion
    expect(await setReportCadence(TENANT, "daily")).toBe("monthly");
  });
});

// ---------------------------------------------------------------------------
// client-email override store
// ---------------------------------------------------------------------------

describe("getClientEmailOverride / setClientEmailOverride", () => {
  it("defaults to 'inherit' and round-trips on/off", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const { getClientEmailOverride, setClientEmailOverride } = await import(
      "@/lib/client-email-override"
    );
    expect(await getClientEmailOverride(TENANT)).toBe("inherit");
    expect(await setClientEmailOverride(TENANT, "on")).toBe("on");
    expect(await getClientEmailOverride(TENANT)).toBe("on");
    expect(await setClientEmailOverride(TENANT, "off")).toBe("off");
    expect(await getClientEmailOverride(TENANT)).toBe("off");
  });

  it("defaults to 'inherit' without Redis (can't fabricate an 'on')", async () => {
    mockGetRedis.mockReturnValue(null);
    const { getClientEmailOverride } = await import("@/lib/client-email-override");
    expect(await getClientEmailOverride(TENANT)).toBe("inherit");
  });
});

// ---------------------------------------------------------------------------
// POST/GET /api/admin/tenants/[id]/operator-settings
// ---------------------------------------------------------------------------

function postReq(body: unknown) {
  return new Request(`http://localhost/api/admin/tenants/${TENANT}/operator-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/tenants/[id]/operator-settings", () => {
  it("rejects a non-super-admin with 403", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    mockGetRedis.mockReturnValue(fakeRedis());
    const { POST } = await import("@/app/api/admin/tenants/[id]/operator-settings/route");
    const res = await POST(postReq({ reportCadence: "weekly" }), {
      params: Promise.resolve({ id: TENANT }),
    });
    expect(res.status).toBe(403);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("404s on an unknown tenant", async () => {
    mockGetTenantConfig.mockResolvedValue(null);
    mockGetRedis.mockReturnValue(fakeRedis());
    const { POST } = await import("@/app/api/admin/tenants/[id]/operator-settings/route");
    const res = await POST(postReq({ reportCadence: "weekly" }), {
      params: Promise.resolve({ id: TENANT }),
    });
    expect(res.status).toBe(404);
  });

  it("sets each store, audit-logs the changed keys, and returns the final values", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    const { POST } = await import("@/app/api/admin/tenants/[id]/operator-settings/route");
    const res = await POST(
      postReq({
        reportCadence: "weekly",
        replyMode: "auto",
        contentAutonomy: "auto",
        clientEmail: "on",
      }),
      { params: Promise.resolve({ id: TENANT }) },
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toEqual({
      reportCadence: "weekly",
      replyMode: "auto",
      contentAutonomy: "auto",
      clientEmail: "on",
    });

    // Each store was written.
    expect(redis.store.get(`reb:report-cadence:${TENANT}`)).toBe("weekly");
    expect(redis.store.get(`reb:content-autonomy:${TENANT}`)).toBe("auto");
    expect(redis.store.get(`reb:client-email:${TENANT}`)).toBe("on");
    const voice = redis.store.get(`reb:reply-voice:${TENANT}`) as { mode: string };
    expect(voice.mode).toBe("auto");

    // Audit-logged with the changed keys.
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    const [entry] = mockLogAuditEvent.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({
      action: "tenant.operator-settings",
      targetType: "tenant",
      targetId: TENANT,
    });
    expect((entry.metadata as { fields: string[] }).fields).toEqual([
      "reportCadence",
      "replyMode",
      "contentAutonomy",
      "clientEmail",
    ]);
  });

  it("preserves reply guidance + templates when only the mode is changed", async () => {
    const redis = fakeRedis();
    redis.store.set(`reb:reply-voice:${TENANT}`, {
      mode: "approve",
      guidance: "warm and local",
      templates: [{ key: "praise", example: "Thanks so much!" }],
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    mockGetRedis.mockReturnValue(redis);
    const { POST } = await import("@/app/api/admin/tenants/[id]/operator-settings/route");
    await POST(postReq({ replyMode: "auto" }), { params: Promise.resolve({ id: TENANT }) });

    const voice = redis.store.get(`reb:reply-voice:${TENANT}`) as {
      mode: string;
      guidance: string;
      templates: { example: string }[];
    };
    expect(voice.mode).toBe("auto");
    expect(voice.guidance).toBe("warm and local");
    expect(voice.templates[0]!.example).toBe("Thanks so much!");
  });

  it("rejects an invalid value with 400 and writes nothing", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    const { POST } = await import("@/app/api/admin/tenants/[id]/operator-settings/route");
    const res = await POST(postReq({ reportCadence: "daily" }), {
      params: Promise.resolve({ id: TENANT }),
    });
    expect(res.status).toBe(400);
    expect(redis.store.has(`reb:report-cadence:${TENANT}`)).toBe(false);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("does not audit-log when no recognized key is present", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const { POST } = await import("@/app/api/admin/tenants/[id]/operator-settings/route");
    const res = await POST(postReq({ unrelated: "x" }), {
      params: Promise.resolve({ id: TENANT }),
    });
    expect(res.status).toBe(200);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/tenants/[id]/operator-settings", () => {
  it("returns the current values (defaults on an untouched tenant)", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const { GET } = await import("@/app/api/admin/tenants/[id]/operator-settings/route");
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: TENANT }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reportCadence: "monthly",
      replyMode: "approve",
      contentAutonomy: "approve",
      clientEmail: "inherit",
    });
  });

  it("rejects a non-super-admin with 403", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    mockGetRedis.mockReturnValue(fakeRedis());
    const { GET } = await import("@/app/api/admin/tenants/[id]/operator-settings/route");
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: TENANT }),
    });
    expect(res.status).toBe(403);
  });
});
