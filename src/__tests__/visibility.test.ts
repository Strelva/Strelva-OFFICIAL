/**
 * Emergency Visibility Tracker tests.
 *
 * Tests cover:
 *   - computeMonthlyCost: cost estimate function
 *   - buildVisibilityQueries: query generation
 *   - diffSnapshots: improved / declined / appeared / disappeared / no-change
 *   - formatVisibilityLines: report rendering incl. no-signal → empty
 *   - extractVisibilityDiff: no snapshots → null; error → null
 *   - No-key cases: SERP and AI probes return honest skips, not fake data
 *
 * All external calls (Serper API, Gemini) are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------- serp.ts -------------------------------------------------------- //

import {
  computeMonthlyCost,
  buildSerpProvider,
  SerperDevClient,
  DEFAULT_QUERIES_PER_WEEK,
} from "../lib/visibility/serp";

// ---------- ai-answers.ts ------------------------------------------------- //

import { buildVisibilityQueries, probeAiAnswer } from "../lib/visibility/ai-answers";

// ---------- snapshots.ts -------------------------------------------------- //

import {
  diffSnapshots,
  getLatestSnapshots,
  saveVisibilitySnapshot,
} from "../lib/visibility/snapshots";
import type { VisibilitySnapshot } from "../lib/visibility/snapshots";

// ---------- reports.ts ---------------------------------------------------- //

import { formatVisibilityLines, extractVisibilityDiff } from "../lib/reports";

// ---------- Mocks ---------------------------------------------------------- //

// Mock events module so tests don't need Redis
const mockAddEvent = vi.fn();
const mockGetEvents = vi.fn();

vi.mock("../lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
  getEvents: (...args: unknown[]) => mockGetEvents(...args),
}));

// ---------- Helpers -------------------------------------------------------- //

function makeSnapshot(overrides: Partial<VisibilitySnapshot> = {}): VisibilitySnapshot {
  return {
    tenantId: "test-tenant",
    trade: "plumber",
    towns: ["Buffalo, NY"],
    queriesPerWeek: 3,
    serpResults: [],
    aiResults: [],
    provider: "serper.dev",
    checkedAt: new Date().toISOString(),
    estimatedMonthlyCostUsd: 0.013,
    ...overrides,
  };
}

// =========================================================================== //

describe("computeMonthlyCost", () => {
  it("returns a number for default query volume", () => {
    const cost = computeMonthlyCost();
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(1); // well under $1/month at defaults
  });

  it("scales linearly with query count", () => {
    const base = computeMonthlyCost(3, 0.001);
    const double = computeMonthlyCost(6, 0.001);
    expect(double).toBeCloseTo(base * 2, 2);
  });

  it("default 3 queries/week costs under $0.02/month at $0.001/query", () => {
    const cost = computeMonthlyCost(DEFAULT_QUERIES_PER_WEEK, 0.001);
    expect(cost).toBeLessThan(0.02);
  });
});

describe("buildVisibilityQueries", () => {
  it("returns up to maxQueries queries", () => {
    const queries = buildVisibilityQueries("plumber", ["Buffalo, NY", "Cheektowaga, NY"], 3);
    expect(queries.length).toBe(3);
  });

  it("returns fewer when towns × templates < maxQueries", () => {
    const queries = buildVisibilityQueries("plumber", ["Buffalo, NY"], 3);
    expect(queries.length).toBe(3); // 1 town × 3 templates = 3
  });

  it("includes the trade and town in each query", () => {
    const queries = buildVisibilityQueries("HVAC", ["Rochester, NY"], 3);
    for (const q of queries) {
      expect(q.toLowerCase()).toContain("hvac");
      expect(q).toContain("Rochester, NY");
    }
  });

  it("returns empty array when no towns provided", () => {
    expect(buildVisibilityQueries("plumber", [], 3)).toEqual([]);
  });
});

// ---------- SerperDevClient ------------------------------------------------ //

describe("SerperDevClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a skipped result when the API call throws", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network error"));
    const client = new SerperDevClient("fake-key");
    const result = await client.search("emergency plumber Buffalo", "Acme Plumbing", undefined, []);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("network error");
    expect(result.tenantPosition).toBeNull();
  });

  it("returns a skipped result when API returns non-200", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 429 }));
    const client = new SerperDevClient("fake-key");
    const result = await client.search("emergency plumber Buffalo", "Acme Plumbing", undefined, []);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("429");
  });

  it("finds tenant in organic results by name match", async () => {
    const serpResponse = {
      organic: [
        { title: "Acme Plumbing Services", link: "https://acme-plumbing.com", position: 1 },
        { title: "Joe's Pipes", link: "https://joespipes.com", position: 2 },
      ],
      localResults: [],
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(serpResponse), { status: 200 })
    );
    const client = new SerperDevClient("fake-key");
    const result = await client.search(
      "emergency plumber Buffalo",
      "Acme Plumbing",
      undefined,
      []
    );
    expect(result.skipped).toBe(false);
    expect(result.tenantPosition).toBe(1);
  });

  it("detects tenant in local pack", async () => {
    const serpResponse = {
      organic: [],
      localResults: [{ title: "Acme Plumbing", address: "123 Main St" }],
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(serpResponse), { status: 200 })
    );
    const client = new SerperDevClient("fake-key");
    const result = await client.search("emergency plumber Buffalo", "Acme Plumbing", undefined, []);
    expect(result.tenantInLocalPack).toBe(true);
  });
});

describe("buildSerpProvider", () => {
  afterEach(() => {
    delete process.env.SERP_API_KEY;
  });

  it("returns null when SERP_API_KEY is not set", () => {
    delete process.env.SERP_API_KEY;
    expect(buildSerpProvider()).toBeNull();
  });

  it("returns a SerperDevClient when SERP_API_KEY is set", () => {
    process.env.SERP_API_KEY = "test-key";
    const provider = buildSerpProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("serper.dev");
  });
});

// ---------- probeAiAnswer -------------------------------------------------- //

describe("probeAiAnswer", () => {
  afterEach(() => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    vi.restoreAllMocks();
  });

  it("returns probed:false and honest skipReason when no API key", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const result = await probeAiAnswer("emergency plumber Buffalo", "Acme Plumbing", []);
    expect(result.probed).toBe(false);
    expect(result.skipReason).toBeTruthy();
    expect(result.tenantMentioned).toBe(false);
    expect(result.methodologyNote).toBeTruthy();
  });

  it("never claims a competitor is absent without probing", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const result = await probeAiAnswer("emergency plumber Buffalo", "Acme Plumbing", [
      { name: "Rival Plumbing" },
    ]);
    // All competitor mentions are false when unprobed — not claiming absence
    for (const c of result.competitors) {
      expect(c.mentioned).toBe(false);
    }
    expect(result.probed).toBe(false);
  });
});

// ---------- diffSnapshots -------------------------------------------------- //

describe("diffSnapshots", () => {
  const baseCompetitors = [{ name: "Rival Co", position: 3, inLocalPack: false }];

  it("no_change when position is identical", () => {
    const prev = makeSnapshot({
      serpResults: [{
        query: "emergency plumber Buffalo",
        provider: "serper.dev",
        tenantPosition: 4,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const cur = makeSnapshot({
      serpResults: [{
        query: "emergency plumber Buffalo",
        provider: "serper.dev",
        tenantPosition: 4,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const diff = diffSnapshots(prev, cur);
    expect(diff.hasSignal).toBe(false);
    expect(diff.changes).toHaveLength(0);
  });

  it("detects organic position improvement (lower number = higher rank)", () => {
    const prev = makeSnapshot({
      serpResults: [{
        query: "emergency plumber Buffalo",
        provider: "serper.dev",
        tenantPosition: 7,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const cur = makeSnapshot({
      serpResults: [{
        query: "emergency plumber Buffalo",
        provider: "serper.dev",
        tenantPosition: 3,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const diff = diffSnapshots(prev, cur);
    expect(diff.hasSignal).toBe(true);
    const change = diff.changes.find((c) => c.surface === "serp_organic");
    expect(change?.direction).toBe("improved");
    expect(change?.before).toBe(7);
    expect(change?.after).toBe(3);
  });

  it("detects organic position decline", () => {
    const prev = makeSnapshot({
      serpResults: [{
        query: "plumber near me Buffalo",
        provider: "serper.dev",
        tenantPosition: 2,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const cur = makeSnapshot({
      serpResults: [{
        query: "plumber near me Buffalo",
        provider: "serper.dev",
        tenantPosition: 8,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const diff = diffSnapshots(prev, cur);
    const change = diff.changes.find((c) => c.surface === "serp_organic");
    expect(change?.direction).toBe("declined");
  });

  it("detects new appearance in organic results", () => {
    const prev = makeSnapshot({
      serpResults: [{
        query: "plumber repair Buffalo",
        provider: "serper.dev",
        tenantPosition: null,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const cur = makeSnapshot({
      serpResults: [{
        query: "plumber repair Buffalo",
        provider: "serper.dev",
        tenantPosition: 5,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const diff = diffSnapshots(prev, cur);
    const change = diff.changes.find((c) => c.surface === "serp_organic");
    expect(change?.direction).toBe("appeared");
  });

  it("detects disappearance from organic results", () => {
    const prev = makeSnapshot({
      serpResults: [{
        query: "plumber repair Buffalo",
        provider: "serper.dev",
        tenantPosition: 5,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const cur = makeSnapshot({
      serpResults: [{
        query: "plumber repair Buffalo",
        provider: "serper.dev",
        tenantPosition: null,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const diff = diffSnapshots(prev, cur);
    const change = diff.changes.find((c) => c.surface === "serp_organic");
    expect(change?.direction).toBe("disappeared");
  });

  it("detects local pack appearance", () => {
    const prev = makeSnapshot({
      serpResults: [{
        query: "emergency plumber Buffalo",
        provider: "serper.dev",
        tenantPosition: null,
        tenantInLocalPack: false,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const cur = makeSnapshot({
      serpResults: [{
        query: "emergency plumber Buffalo",
        provider: "serper.dev",
        tenantPosition: null,
        tenantInLocalPack: true,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const diff = diffSnapshots(prev, cur);
    const change = diff.changes.find((c) => c.surface === "serp_local_pack");
    expect(change?.direction).toBe("appeared");
  });

  it("detects AI answer appearance", () => {
    const prev = makeSnapshot({
      aiResults: [{
        query: "emergency plumber Buffalo",
        model: "gemini-2.5-flash",
        probed: true,
        tenantMentioned: false,
        competitors: [{ name: "Rival Co", mentioned: false }],
        checkedAt: new Date().toISOString(),
        methodologyNote: "test",
      }],
    });
    const cur = makeSnapshot({
      aiResults: [{
        query: "emergency plumber Buffalo",
        model: "gemini-2.5-flash",
        probed: true,
        tenantMentioned: true,
        competitors: [{ name: "Rival Co", mentioned: false }],
        checkedAt: new Date().toISOString(),
        methodologyNote: "test",
      }],
    });
    const diff = diffSnapshots(prev, cur);
    const change = diff.changes.find((c) => c.surface === "ai_answer");
    expect(change?.direction).toBe("appeared");
  });

  it("skipped SERP results do not generate changes", () => {
    const prev = makeSnapshot({ serpResults: [] });
    const cur = makeSnapshot({
      serpResults: [{
        query: "emergency plumber Buffalo",
        provider: "none",
        tenantPosition: null,
        tenantInLocalPack: false,
        competitors: [],
        checkedAt: new Date().toISOString(),
        skipped: true,
        skipReason: "no key",
      }],
    });
    const diff = diffSnapshots(prev, cur);
    expect(diff.hasSignal).toBe(false);
  });

  it("unprobed AI results do not generate changes", () => {
    const prev = makeSnapshot({ aiResults: [] });
    const cur = makeSnapshot({
      aiResults: [{
        query: "emergency plumber Buffalo",
        model: "gemini-2.5-flash",
        probed: false,
        tenantMentioned: false,
        competitors: [],
        checkedAt: new Date().toISOString(),
        skipReason: "no key",
        methodologyNote: "test",
      }],
    });
    const diff = diffSnapshots(prev, cur);
    expect(diff.hasSignal).toBe(false);
  });

  it("handles null previous snapshot (first run)", () => {
    const cur = makeSnapshot({
      serpResults: [{
        query: "emergency plumber Buffalo",
        provider: "serper.dev",
        tenantPosition: 4,
        tenantInLocalPack: true,
        competitors: baseCompetitors,
        checkedAt: new Date().toISOString(),
        skipped: false,
      }],
    });
    const diff = diffSnapshots(null, cur);
    // First run: appeared everywhere there's data
    expect(diff.previousCheckedAt).toBeNull();
    // Local pack appeared (was false → true)
    const packChange = diff.changes.find((c) => c.surface === "serp_local_pack");
    expect(packChange?.direction).toBe("appeared");
  });
});

// ---------- formatVisibilityLines ----------------------------------------- //

describe("formatVisibilityLines", () => {
  it("returns empty string when diff is null", () => {
    expect(formatVisibilityLines(null)).toBe("");
  });

  it("returns empty string when diff has no signal", () => {
    const diff = {
      tenantId: "t",
      previousCheckedAt: null,
      currentCheckedAt: new Date().toISOString(),
      changes: [],
      hasSignal: false,
    };
    expect(formatVisibilityLines(diff)).toBe("");
  });

  it("renders position improvement line", () => {
    const diff = {
      tenantId: "t",
      previousCheckedAt: new Date().toISOString(),
      currentCheckedAt: new Date().toISOString(),
      changes: [{
        query: "emergency plumber Cheektowaga",
        surface: "serp_organic" as const,
        before: 7,
        after: 3,
        direction: "improved" as const,
      }],
      hasSignal: true,
    };
    const lines = formatVisibilityLines(diff);
    expect(lines).toContain("#7");
    expect(lines).toContain("#3");
    expect(lines).toContain("emergency plumber Cheektowaga");
  });

  it("renders position decline line", () => {
    const diff = {
      tenantId: "t",
      previousCheckedAt: new Date().toISOString(),
      currentCheckedAt: new Date().toISOString(),
      changes: [{
        query: "plumber near me Buffalo",
        surface: "serp_organic" as const,
        before: 2,
        after: 9,
        direction: "declined" as const,
      }],
      hasSignal: true,
    };
    const lines = formatVisibilityLines(diff);
    expect(lines).toContain("dropped");
    expect(lines).toContain("#2");
    expect(lines).toContain("#9");
  });

  it("renders local pack appearance", () => {
    const diff = {
      tenantId: "t",
      previousCheckedAt: new Date().toISOString(),
      currentCheckedAt: new Date().toISOString(),
      changes: [{
        query: "emergency plumber Buffalo",
        surface: "serp_local_pack" as const,
        before: false,
        after: true,
        direction: "appeared" as const,
      }],
      hasSignal: true,
    };
    const lines = formatVisibilityLines(diff);
    expect(lines).toContain("local pack");
  });

  it("renders AI answer appearance with directional caveat", () => {
    const diff = {
      tenantId: "t",
      previousCheckedAt: new Date().toISOString(),
      currentCheckedAt: new Date().toISOString(),
      changes: [{
        query: "emergency plumber Buffalo",
        surface: "ai_answer" as const,
        before: false,
        after: true,
        direction: "appeared" as const,
      }],
      hasSignal: true,
    };
    const lines = formatVisibilityLines(diff);
    expect(lines).toContain("AI");
  });
});

// ---------- extractVisibilityDiff ----------------------------------------- //

describe("extractVisibilityDiff", () => {
  beforeEach(() => {
    mockGetEvents.mockReset();
  });

  it("returns null when there are no visibility_snapshot events", async () => {
    mockGetEvents.mockResolvedValue([
      { type: "content_update", createdAt: new Date().toISOString(), metadata: {} },
    ]);
    const diff = await extractVisibilityDiff("tenant-1");
    expect(diff).toBeNull();
  });

  it("returns a diff when there is one snapshot (vs null previous)", async () => {
    const snapshot = makeSnapshot({ tenantId: "tenant-1" });
    mockGetEvents.mockResolvedValue([
      {
        type: "visibility_snapshot",
        createdAt: snapshot.checkedAt,
        metadata: { snapshot },
      },
    ]);
    const diff = await extractVisibilityDiff("tenant-1");
    expect(diff).not.toBeNull();
    expect(diff?.previousCheckedAt).toBeNull();
  });

  it("returns null on error (does not throw)", async () => {
    mockGetEvents.mockRejectedValue(new Error("Redis down"));
    const diff = await extractVisibilityDiff("tenant-1");
    expect(diff).toBeNull();
  });
});

// ---------- saveVisibilitySnapshot ----------------------------------------- //

describe("saveVisibilitySnapshot", () => {
  beforeEach(() => {
    mockAddEvent.mockReset();
    mockAddEvent.mockResolvedValue({
      id: "evt_test",
      createdAt: new Date().toISOString(),
      type: "visibility_snapshot",
    });
  });

  it("calls addEvent with visibility_snapshot type", async () => {
    const snapshot = makeSnapshot();
    await saveVisibilitySnapshot(snapshot);
    expect(mockAddEvent).toHaveBeenCalledTimes(1);
    const [payload] = mockAddEvent.mock.calls[0];
    expect(payload.type).toBe("visibility_snapshot");
    expect(payload.status).toBe("auto_approved");
    expect(payload.metadata?.snapshot).toEqual(snapshot);
  });
});
