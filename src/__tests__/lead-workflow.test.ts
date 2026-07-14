import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

vi.mock("@/lib/auth", () => ({
  isSuperAdmin: mockIsSuperAdmin,
  getActorContext: mockGetActorContext,
}));

vi.mock("@/lib/storage", () => ({ logAuditEvent: mockLogAuditEvent }));

import {
  getLeadWorkflow,
  getAllLeadWorkflow,
  setLeadWorkflowStatus,
} from "@/lib/lead-workflow";

const TOKEN = "a".repeat(36); // 36 hex chars, matches the lead statusToken shape
const TOKEN_B = "b".repeat(36);

/** Minimal in-memory Redis stand-in covering the get/set/mget this store uses. */
function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    }),
    mget: vi.fn(async (...keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    zadd: vi.fn(async () => 1),
  };
}

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
});

describe("getLeadWorkflow", () => {
  it("defaults to `new` when nothing is stored", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    expect(await getLeadWorkflow(TOKEN)).toEqual({ token: TOKEN, status: "new", updatedAt: null });
  });

  it("defaults to `new` when Redis is unconfigured", async () => {
    mockGetRedis.mockReturnValue(null);
    expect(await getLeadWorkflow(TOKEN)).toEqual({ token: TOKEN, status: "new", updatedAt: null });
  });
});

describe("setLeadWorkflowStatus", () => {
  it("persists so a subsequent read sees the status and timestamp", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const set = await setLeadWorkflowStatus(TOKEN, "contacted");
    expect(set.status).toBe("contacted");
    expect(set.updatedAt).not.toBeNull();

    const read = await getLeadWorkflow(TOKEN);
    expect(read.status).toBe("contacted");
  });

  it("keeps an existing note across a bare status change and stores a new note", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    await setLeadWorkflowStatus(TOKEN, "contacted", "  called, left VM  ");
    const kept = await setLeadWorkflowStatus(TOKEN, "converted");
    expect(kept.status).toBe("converted");
    expect(kept.note).toBe("called, left VM"); // trimmed + preserved
  });

  it("accepts the intermediate `converting` state distinctly from `converted`", async () => {
    // Convert-click sets `converting` (onboard handoff); only a successful
    // provision later flips it to `converted`. Both must round-trip.
    mockGetRedis.mockReturnValue(fakeRedis());
    const converting = await setLeadWorkflowStatus(TOKEN, "converting");
    expect(converting.status).toBe("converting");
    expect((await getLeadWorkflow(TOKEN)).status).toBe("converting");

    const converted = await setLeadWorkflowStatus(TOKEN, "converted");
    expect(converted.status).toBe("converted");
    expect((await getLeadWorkflow(TOKEN)).status).toBe("converted");
  });

  it("updates the canonical customer delivery lifecycle with the operator projection", async () => {
    const redis = fakeRedis();
    const lead = {
      businessName: "Acme",
      email: "owner@acme.test",
      statusToken: TOKEN,
      deliveryStatus: "received",
      submittedAt: "2026-07-01T00:00:00.000Z",
      statusUpdatedAt: "2026-07-01T00:00:00.000Z",
    };
    redis.store.set(`lead-status:${TOKEN}`, JSON.stringify(lead));
    redis.store.set(`lead:${lead.email}`, JSON.stringify(lead));
    mockGetRedis.mockReturnValue(redis);

    await setLeadWorkflowStatus(TOKEN, "converted");

    const stored = JSON.parse(String(redis.store.get(`lead-status:${TOKEN}`)));
    expect(stored.deliveryStatus).toBe("launched");
    expect((await getLeadWorkflow(TOKEN)).status).toBe("converted");
  });

  it("is a no-op returning computed state without Redis", async () => {
    mockGetRedis.mockReturnValue(null);
    const set = await setLeadWorkflowStatus(TOKEN, "dismissed");
    expect(set.status).toBe("dismissed");
    // Nothing persisted -> next read is back to default.
    expect((await getLeadWorkflow(TOKEN)).status).toBe("new");
  });
});

describe("getAllLeadWorkflow", () => {
  it("returns stored records and fills `new` defaults for the rest", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    await setLeadWorkflowStatus(TOKEN, "converted");

    const all = await getAllLeadWorkflow([TOKEN, TOKEN_B]);
    expect(all[TOKEN].status).toBe("converted");
    expect(all[TOKEN_B]).toEqual({ token: TOKEN_B, status: "new", updatedAt: null });
  });

  it("fills defaults for every token when Redis is unconfigured", async () => {
    mockGetRedis.mockReturnValue(null);
    const all = await getAllLeadWorkflow([TOKEN, TOKEN_B]);
    expect(Object.keys(all)).toEqual([TOKEN, TOKEN_B]);
    expect(all[TOKEN].status).toBe("new");
    expect(all[TOKEN].updatedAt).toBeNull();
  });
});

function workflowReq(body: unknown) {
  return new Request(`http://localhost/api/admin/leads/${TOKEN}/workflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/leads/[token]/workflow", () => {
  it("rejects a non-super-admin with 403", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    mockGetRedis.mockReturnValue(fakeRedis());
    const { POST } = await import("@/app/api/admin/leads/[token]/workflow/route");
    const res = await POST(workflowReq({ status: "contacted" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(403);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("sets the workflow status, audits it, and returns the record", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const { POST } = await import("@/app/api/admin/leads/[token]/workflow/route");
    const res = await POST(workflowReq({ status: "contacted" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.workflow).toMatchObject({ token: TOKEN, status: "contacted" });
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    const [entry] = mockLogAuditEvent.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({ action: "lead.workflow", targetType: "lead", targetId: TOKEN });
  });

  it("rejects an invalid status with 400", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const { POST } = await import("@/app/api/admin/leads/[token]/workflow/route");
    const res = await POST(workflowReq({ status: "won" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(400);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a malformed lead token with 400", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const { POST } = await import("@/app/api/admin/leads/[token]/workflow/route");
    const res = await POST(workflowReq({ status: "contacted" }), {
      params: Promise.resolve({ token: "not-a-real-token" }),
    });
    expect(res.status).toBe(400);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });
});
