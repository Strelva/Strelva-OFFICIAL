/**
 * Audit history (time-series snapshot) tests.
 *
 * Covers:
 *   - saveAuditSnapshot writes a SLIM `audit_snapshot` event (overall score/grade
 *     + per-category {slug,score}; NO full checks payload).
 *   - getAuditHistory reads `audit_snapshot` events back, newest-first, typed,
 *     and ignores unrelated event types + respects the limit.
 *
 * events.ts is mocked so the tests don't need Redis.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { saveAuditSnapshot, getAuditHistory } from "../lib/audit/history";
import type { AuditSnapshot } from "../lib/audit/history";
import type { CategoryResult } from "../lib/audit/types";

// ---------- Mocks ---------------------------------------------------------- //

const mockAddEvent = vi.fn();
const mockGetEvents = vi.fn();

vi.mock("../lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
  getEvents: (...args: unknown[]) => mockGetEvents(...args),
}));

// ---------- Helpers -------------------------------------------------------- //

function makeCategory(slug: string, score: number): CategoryResult {
  return {
    name: slug,
    slug,
    weight: 1,
    score,
    checks: [
      {
        name: `${slug}-check`,
        status: "pass",
        score,
        message: "ok",
        details: "a long details string that must NOT be persisted in the snapshot",
      },
    ],
  };
}

function makeSnapshotEvent(overrides: Partial<AuditSnapshot> = {}) {
  const snapshot: AuditSnapshot = {
    tenantId: "test-tenant",
    url: "https://example.com",
    overallScore: 82,
    grade: "B",
    categories: [{ slug: "seo", score: 80 }],
    scannedAt: "2026-06-21T12:00:00.000Z",
    ...overrides,
  };
  return { type: "audit_snapshot", metadata: { snapshot } };
}

// ---------- Tests ---------------------------------------------------------- //

beforeEach(() => {
  mockAddEvent.mockReset();
  mockGetEvents.mockReset();
  mockAddEvent.mockResolvedValue({ id: "evt_1" });
});

describe("saveAuditSnapshot", () => {
  it("writes a slim audit_snapshot event without the full checks payload", async () => {
    const categories = [makeCategory("seo", 80), makeCategory("security", 90)];

    await saveAuditSnapshot("acme", {
      url: "https://acme.com",
      overallScore: 85,
      grade: "B",
      categories,
      scannedAt: "2026-06-21T12:00:00.000Z",
    });

    expect(mockAddEvent).toHaveBeenCalledTimes(1);
    const event = mockAddEvent.mock.calls[0][0];

    expect(event.tenantId).toBe("acme");
    expect(event.type).toBe("audit_snapshot");
    expect(event.status).toBe("auto_approved");

    const snapshot = event.metadata.snapshot as AuditSnapshot;
    expect(snapshot).toEqual({
      tenantId: "acme",
      url: "https://acme.com",
      overallScore: 85,
      grade: "B",
      categories: [
        { slug: "seo", score: 80 },
        { slug: "security", score: 90 },
      ],
      scannedAt: "2026-06-21T12:00:00.000Z",
    });

    // Slim guarantee: no `checks`, no `name`/`weight` carried per category.
    const serialized = JSON.stringify(event.metadata.snapshot);
    expect(serialized).not.toContain("checks");
    expect(serialized).not.toContain("must NOT be persisted");
    expect(snapshot.categories[0]).not.toHaveProperty("checks");
    expect(snapshot.categories[0]).not.toHaveProperty("weight");
  });

  it("defaults scannedAt when not provided", async () => {
    await saveAuditSnapshot("acme", {
      url: "https://acme.com",
      overallScore: 70,
      grade: "C",
      categories: [makeCategory("seo", 70)],
    });

    const snapshot = mockAddEvent.mock.calls[0][0].metadata.snapshot as AuditSnapshot;
    expect(typeof snapshot.scannedAt).toBe("string");
    expect(Number.isNaN(Date.parse(snapshot.scannedAt))).toBe(false);
  });
});

describe("getAuditHistory", () => {
  it("maps audit_snapshot rows back, newest-first, ignoring other event types", async () => {
    mockGetEvents.mockResolvedValue([
      makeSnapshotEvent({ overallScore: 90, grade: "A", scannedAt: "2026-06-21T12:00:00.000Z" }),
      { type: "visibility_snapshot", metadata: { snapshot: { tenantId: "x" } } },
      makeSnapshotEvent({ overallScore: 75, grade: "C", scannedAt: "2026-06-14T12:00:00.000Z" }),
    ]);

    const history = await getAuditHistory("test-tenant");

    expect(mockGetEvents).toHaveBeenCalledWith("test-tenant", { limit: 200 });
    expect(history).toHaveLength(2);
    expect(history[0].overallScore).toBe(90);
    expect(history[0].grade).toBe("A");
    expect(history[1].overallScore).toBe(75);
    expect(history[0].categories).toEqual([{ slug: "seo", score: 80 }]);
  });

  it("respects the limit", async () => {
    mockGetEvents.mockResolvedValue([
      makeSnapshotEvent(),
      makeSnapshotEvent(),
      makeSnapshotEvent(),
    ]);

    const history = await getAuditHistory("test-tenant", 2);
    expect(history).toHaveLength(2);
  });

  it("returns an empty array when there are no snapshots", async () => {
    mockGetEvents.mockResolvedValue([
      { type: "review", metadata: {} },
    ]);

    const history = await getAuditHistory("test-tenant");
    expect(history).toEqual([]);
  });
});
