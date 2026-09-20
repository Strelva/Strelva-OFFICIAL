import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InquiryCapabilityDefinition,
  InquiryWork,
} from "@/products/inquiries/contracts";
import type {
  InquiryRepository,
  InquiryWorkspaceSnapshot,
} from "@/products/inquiries/repository";

const mocks = vi.hoisted(() => ({
  tenants: vi.fn(),
  access: vi.fn(),
  config: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUserTenants: mocks.tenants,
  requireTenantAccess: mocks.access,
}));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.config }));
vi.mock("@/products/inquiries/workspace-exit", () => ({ resolveInquiryWorkspace: mocks.workspace }));

import {
  discoverInquiryPortfolio,
  resolveInquiryPattern,
} from "@/products/inquiries/portfolio";

const at = "2026-09-11T12:00:00.000Z";

function definition(businessId: string, version = 2): InquiryCapabilityDefinition {
  return {
    kind: "inquiry",
    id: "cap-live",
    businessId,
    version,
    name: "Buyer inquiry",
    form: { component: "form", id: "form", title: "Ask us", intro: "Tell us what you need", fields: [], disclosure: "Strelva" },
    record: { component: "record_list", type: "inquiry", singularLabel: "Inquiry", pluralLabel: "Inquiries", fields: [] },
    routing: { component: "routing_rule", id: "routing", sentence: "Send to staff", destination: "private-staff@example.test", channel: "email", withinMinutes: 60 },
    followUp: null,
    connections: [{ id: "email", provider: "email", status: "connected", consent: "explicit", lastCheckedAt: at }],
    createdAt: at,
    updatedAt: at,
  };
}

function work(businessId: string, state: InquiryWork["state"]): InquiryWork {
  return {
    id: `work-${state}`,
    businessId,
    capabilityId: "cap-live",
    actorId: "private-actor",
    intent: "Review buyer inquiry",
    shape: {} as InquiryWork["shape"],
    plan: null,
    draft: null,
    state,
    activeChangeId: null,
    publishApproval: null,
    rehearsalScenarioIds: [],
    rehearsalRunIds: [],
    lastLiveChangeId: null,
    createdAt: at,
    updatedAt: at,
    failureReason: state === "failed" ? "private provider detail" : null,
  };
}

function snapshot(tenantId: string, businessId: string, version = 2): InquiryWorkspaceSnapshot {
  const live = definition(businessId, version);
  const state = {
    stateVersion: 1,
    requests: [work(businessId, "planned"), work(businessId, "handled")],
    capabilities: [{ id: live.id, businessId, status: "live", live, previousLive: null, activeRequestId: null, updatedAt: at }],
    changes: [{ capabilityId: live.id, verification: { verified: true } }],
    actionReceipts: [],
    rehearsalScenarios: [],
    rehearsalRuns: [],
    inquiries: [],
    timeline: [],
    responsibilities: [],
    responsibilityReceipts: [],
  } as unknown as InquiryWorkspaceSnapshot["state"];
  return { tenantId, businessId, tenantStableId: businessId, revision: 1, stateVersion: 1, state, updatedAt: at };
}

function repository(read: (tenantId: string, businessId?: string) => InquiryWorkspaceSnapshot | null): InquiryRepository {
  return { getSnapshot: vi.fn(async (tenantId, businessId) => read(tenantId, businessId)) } as unknown as InquiryRepository;
}

describe("inquiry portfolio discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenants.mockResolvedValue(["active", "revoked", "inactive"]);
    mocks.access.mockImplementation(async (tenantId: string) => tenantId === "revoked" ? { status: 403 } : null);
    mocks.config.mockImplementation(async (tenantId: string) => ({
      id: tenantId,
      stableId: `${tenantId}-business`,
      siteName: tenantId === "active" ? "Active Business" : "Inactive Business",
      active: tenantId !== "inactive",
    }));
    mocks.workspace.mockImplementation(async ({ fallbackBusinessId }: { fallbackBusinessId: string }) => ({
      businessId: fallbackBusinessId,
      workspaceIds: [],
      exitCompleted: false,
      mapped: false,
    }));
  });

  it("returns whitelisted attention and opaque live-pattern summaries for granted active tenants", async () => {
    const repo = repository((tenantId, businessId) => snapshot(tenantId, businessId!));
    const result = await discoverInquiryPortfolio(repo);

    expect(result.attention).toEqual([expect.objectContaining({ tenantId: "active", businessName: "Active Business", state: "planned", requiredDecision: "Review the plan" })]);
    expect(result.patterns).toEqual([expect.objectContaining({ sourceTenantId: "active", sourceBusinessName: "Active Business", name: "Buyer inquiry", version: 2 })]);
    expect(result.patterns[0]!.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result)).not.toContain("private-staff");
    expect(JSON.stringify(result)).not.toContain("private-actor");
    expect(repo.getSnapshot).toHaveBeenCalledTimes(1);
    expect(repo.getSnapshot).toHaveBeenCalledWith("active", "active-business");
  });

  it("keeps repository outages explicit instead of presenting an empty portfolio", async () => {
    mocks.tenants.mockResolvedValue(["active"]);
    const repo = repository(() => { throw new Error("storage unavailable"); });
    await expect(discoverInquiryPortfolio(repo)).resolves.toEqual({
      attention: [],
      patterns: [],
      unavailableTenantIds: ["active"],
    });
  });

  it("rejects snapshots and capabilities that assert a different source business", async () => {
    mocks.tenants.mockResolvedValue(["active"]);
    const wrongSnapshot = snapshot("active", "foreign-business");
    const repo = repository(() => wrongSnapshot);
    const result = await discoverInquiryPortfolio(repo);
    expect(result.attention).toEqual([]);
    expect(result.patterns).toEqual([]);
  });
});

describe("inquiry pattern resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenants.mockResolvedValue(["active"]);
    mocks.access.mockResolvedValue(null);
    mocks.config.mockResolvedValue({ id: "active", stableId: "active-business", siteName: "Active Business", active: true });
    mocks.workspace.mockResolvedValue({ businessId: "active-business", workspaceIds: [], exitCompleted: false, mapped: false });
  });

  it("reauthorizes and rereads the exact live version before returning only copy input", async () => {
    const repo = repository((tenantId, businessId) => snapshot(tenantId, businessId!, 2));
    const portfolio = await discoverInquiryPortfolio(repo);
    vi.mocked(repo.getSnapshot).mockClear();
    mocks.access.mockClear();

    const resolved = await resolveInquiryPattern(portfolio.patterns[0]!.id, repo);

    expect(resolved).toEqual({ sourceBusinessName: "Active Business", definition: definition("active-business", 2) });
    expect(mocks.access).toHaveBeenCalledTimes(2);
    expect(repo.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("denies a pattern after source access is revoked", async () => {
    const repo = repository((tenantId, businessId) => snapshot(tenantId, businessId!, 2));
    const portfolio = await discoverInquiryPortfolio(repo);
    vi.mocked(repo.getSnapshot).mockClear();
    mocks.access.mockResolvedValue({ status: 403 });

    await expect(resolveInquiryPattern(portfolio.patterns[0]!.id, repo)).resolves.toBeNull();
    expect(repo.getSnapshot).not.toHaveBeenCalled();
  });

  it("denies stale versions and foreign opaque references", async () => {
    let version = 2;
    const repo = repository((tenantId, businessId) => snapshot(tenantId, businessId!, version));
    const portfolio = await discoverInquiryPortfolio(repo);
    version = 3;

    await expect(resolveInquiryPattern(portfolio.patterns[0]!.id, repo)).resolves.toBeNull();
    await expect(resolveInquiryPattern("a".repeat(43), repo)).resolves.toBeNull();
  });
});
