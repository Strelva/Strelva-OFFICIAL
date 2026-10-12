import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";

// Aggregation + bulk-approve for the operator "clear the whole portfolio" screen.
// The invariant under test: bulk-approve resolves EVERY item through the governed
// `resolveEventAction` spine (never a shortcut), and reports honest partial
// failure — an external write that fails leaves its item unchanged/pending.

const mockGetAllTenants = vi.fn();
const mockGetEvents = vi.fn();
const mockGetEventRaw = vi.fn();
const mockResolveEventAction = vi.fn();

vi.mock("@/lib/tenants", () => ({
  getAllTenants: (...a: unknown[]) => mockGetAllTenants(...a),
  isActiveTenant: (t: { active?: boolean }) => t.active !== false,
}));
vi.mock("@/lib/events", () => ({
  getEvents: (...a: unknown[]) => mockGetEvents(...a),
  getEventRaw: (...a: unknown[]) => mockGetEventRaw(...a),
}));
vi.mock("@/lib/event-actions", () => ({
  resolveEventAction: (...a: unknown[]) => mockResolveEventAction(...a),
  operatorActorId: (id: string) => `operator:${id}`,
}));
// The real operator decision (src/lib/operator-decisions.ts) runs; only the
// session, the super_admins read and the audit write are stubbed.
const mockSuperAdmin = vi.fn();
const mockSession = vi.fn();
const mockAudit = vi.fn();
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: () => mockSuperAdmin(), getAuthUserId: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: () => mockSession() }));
vi.mock("@/platform/infra/db/repositories", () => ({ getMembershipRole: vi.fn() }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));
const operator = { userId: "10000000-0000-4000-8000-0000000000aa", verifiedEmail: "operator@example.test", actorId: "operator:10000000-0000-4000-8000-0000000000aa" };

import {
  getPortfolioActions,
  bulkResolvePortfolioActions,
  isPortfolioApprovable,
  describePortfolioAction,
} from "@/app/admin/actions/portfolio-actions";

function evt(over: Partial<UnifiedEvent>): UnifiedEvent {
  return {
    id: "e",
    tenantId: "t",
    source: "ai",
    type: "content_update",
    title: "AI proposed changes",
    body: "",
    status: "pending",
    createdAt: "2026-07-01T00:00:00.000Z",
    metadata: {},
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSuperAdmin.mockResolvedValue(true);
  mockSession.mockResolvedValue({ id: operator.userId, email: operator.verifiedEmail, email_confirmed_at: "2026-10-01T00:00:00.000Z" });
  mockAudit.mockResolvedValue(undefined);
  // Each pending draft lives in the tenant its eventId names: "b…" in bolt, else acme.
  mockGetEventRaw.mockImplementation(async (id: string) => evt({ id, tenantId: id.startsWith("b") ? "bolt" : "acme" }));
});

describe("isPortfolioApprovable", () => {
  it("accepts pending drafts and external-write approvals", () => {
    expect(isPortfolioApprovable(evt({ type: "content_update" }))).toBe(true);
    expect(isPortfolioApprovable(evt({ type: "newsletter_draft" }))).toBe(true);
    expect(
      isPortfolioApprovable(evt({ type: "review", metadata: { kind: "review_reply_draft" } })),
    ).toBe(true);
  });

  it("rejects non-pending, custom-build requests, and raw signal events", () => {
    expect(isPortfolioApprovable(evt({ status: "approved" }))).toBe(false);
    expect(isPortfolioApprovable(evt({ type: "change_request" }))).toBe(false);
    expect(isPortfolioApprovable(evt({ type: "review", metadata: {} }))).toBe(false);
    expect(isPortfolioApprovable(evt({ type: "booking" }))).toBe(false);
  });
});

describe("describePortfolioAction", () => {
  it("labels each kind in plain operator language", () => {
    expect(describePortfolioAction(evt({ type: "review" }))).toBe("Review reply");
    expect(describePortfolioAction(evt({ type: "newsletter_draft" }))).toBe("Newsletter");
    expect(
      describePortfolioAction(evt({ type: "content_update", metadata: { kind: "gbp_post_draft" } })),
    ).toBe("Google post");
    expect(
      describePortfolioAction(evt({ type: "content_update", metadata: { kind: "gbp_hours_draft" } })),
    ).toBe("Business hours");
    expect(describePortfolioAction(evt({ type: "content_update", metadata: {} }))).toBe(
      "Content update",
    );
  });
});

describe("getPortfolioActions", () => {
  it("aggregates pending approvals across tenants, grouped and busiest-first", async () => {
    mockGetAllTenants.mockResolvedValue([
      { id: "acme", siteName: "Acme Co", active: true },
      { id: "bolt", siteName: "Bolt Studio", active: true },
      { id: "gone", siteName: "Archived", active: false }, // filtered out
    ]);
    mockGetEvents.mockImplementation(async (tenantId: string) => {
      if (tenantId === "acme")
        return [
          evt({ id: "a1", tenantId: "acme", metadata: { kind: "gbp_post_draft" } }),
          evt({ id: "a2", tenantId: "acme", type: "review", metadata: { kind: "review_reply_draft" } }),
          evt({ id: "a3", tenantId: "acme", type: "booking" }), // not approvable → excluded
        ];
      if (tenantId === "bolt")
        return [evt({ id: "b1", tenantId: "bolt", metadata: { kind: "agent_preview" } })];
      return [];
    });

    const snap = await getPortfolioActions();

    expect(snap.totalClients).toBe(2);
    expect(snap.totalItems).toBe(3); // 2 acme + 1 bolt (booking excluded)
    // Busiest client first.
    expect(snap.groups[0]!.tenantId).toBe("acme");
    expect(snap.groups[0]!.items).toHaveLength(2);
    expect(snap.groups[0]!.items.map((i) => i.label)).toEqual(["Google post", "Review reply"]);
    expect(snap.groups[1]!.tenantId).toBe("bolt");
    // The archived tenant never appears.
    expect(snap.groups.some((g) => g.tenantId === "gone")).toBe(false);
    expect(snap.availability).toBe("complete");
    expect(snap.incomplete).toEqual([]);
  });

  it("threads each event's type + metadata so the queue can render the real diff", async () => {
    mockGetAllTenants.mockResolvedValue([{ id: "acme", siteName: "Acme Co", active: true }]);
    const diffs = [{ field: "hero.title", type: "changed", before: "Old", after: "New" }];
    mockGetEvents.mockResolvedValue([
      evt({ id: "a1", tenantId: "acme", type: "content_update", metadata: { diffs } }),
    ]);

    const snap = await getPortfolioActions();
    const item = snap.groups[0]!.items[0]!;
    expect(item.type).toBe("content_update");
    expect(item.metadata).toEqual({ diffs });
  });

  it("flags a group as capped when the pending read hits the fetch limit", async () => {
    mockGetAllTenants.mockResolvedValue([
      { id: "big", siteName: "Big Co", active: true },
      { id: "small", siteName: "Small Co", active: true },
    ]);
    mockGetEvents.mockImplementation(async (tenantId: string) => {
      if (tenantId === "big")
        // 100 raw pending events (the cap) → capped, even if not all approvable.
        return Array.from({ length: 100 }, (_, i) => evt({ id: `big-${i}`, tenantId: "big" }));
      return [evt({ id: "small-1", tenantId: "small" })];
    });

    const snap = await getPortfolioActions();
    const big = snap.groups.find((g) => g.tenantId === "big");
    const small = snap.groups.find((g) => g.tenantId === "small");
    expect(big?.capped).toBe(true);
    expect(small?.capped).toBe(false);
    expect(snap.availability).toBe("partial");
    expect(snap.incomplete).toEqual([
      { source: "pending_approvals", tenantId: "big", siteName: "Big Co", capped: true },
    ]);
  });

  it("blocks a false clear when the capped read contains no approvable items", async () => {
    mockGetAllTenants.mockResolvedValue([{ id: "big", siteName: "Big Co", active: true }]);
    mockGetEvents.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) =>
        evt({ id: `signal-${i}`, tenantId: "big", type: "booking" }),
      ),
    );

    const snap = await getPortfolioActions();

    expect(snap.groups).toEqual([]);
    expect(snap.totalItems).toBe(0);
    expect(snap.availability).toBe("partial");
    expect(snap.incomplete).toEqual([
      { source: "pending_approvals", tenantId: "big", siteName: "Big Co", capped: true },
    ]);
  });

  it("keeps a per-tenant read failure explicit while preserving other clients", async () => {
    mockGetAllTenants.mockResolvedValue([
      { id: "acme", siteName: "Acme Co", active: true },
      { id: "bolt", siteName: "Bolt Studio", active: true },
    ]);
    mockGetEvents.mockImplementation(async (tenantId: string) => {
      if (tenantId === "acme") return [evt({ id: "a1", tenantId: "acme" })];
      throw new Error("redis down");
    });

    const snap = await getPortfolioActions();
    expect(snap.totalClients).toBe(1);
    expect(snap.groups[0]!.tenantId).toBe("acme");
    expect(snap.availability).toBe("partial");
    expect(snap.incomplete).toEqual([
      { source: "pending_approvals", tenantId: "bolt", siteName: "Bolt Studio" },
    ]);
  });

  it("never calls a fully unreadable client directory a clear portfolio", async () => {
    mockGetAllTenants.mockRejectedValue(new Error("redis down"));

    const snap = await getPortfolioActions();

    expect(snap).toEqual({
      groups: [],
      totalItems: 0,
      totalClients: 0,
      availability: "unavailable",
      incomplete: [{ source: "client_directory" }],
    });
    expect(mockGetEvents).not.toHaveBeenCalled();
  });

  it("marks a verified empty directory complete", async () => {
    mockGetAllTenants.mockResolvedValue([]);

    const snap = await getPortfolioActions();

    expect(snap).toEqual({
      groups: [],
      totalItems: 0,
      totalClients: 0,
      availability: "complete",
      incomplete: [],
    });
  });
});

describe("retired platform bulk approval", () => {
  it("leaves every valid client draft pending without content effects", async () => {
    expect(await bulkResolvePortfolioActions([{ tenantId: "acme", eventId: "a1" }, { tenantId: "bolt", eventId: "b1" }], operator)).toEqual([
      { tenantId: "acme", eventId: "a1", changed: false, reason: "platform_content_authority_retired" },
      { tenantId: "bolt", eventId: "b1", changed: false, reason: "platform_content_authority_retired" },
    ]);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
  it("preserves tenant binding and active operator admission", async () => {
    expect(await bulkResolvePortfolioActions([{ tenantId: "acme", eventId: "b1" }], operator)).toEqual([{ tenantId: "acme", eventId: "b1", changed: false, reason: "wrong_tenant" }]);
    mockSuperAdmin.mockResolvedValue(false);
    const result = await bulkResolvePortfolioActions([{ tenantId: "acme", eventId: "a1" }, { tenantId: "acme", eventId: "a2" }], operator);
    expect(result.map(item => item.reason)).toEqual(["operator_access_changed", "operator_access_changed"]);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });
});
