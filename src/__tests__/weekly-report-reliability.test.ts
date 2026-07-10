import { afterEach, describe, expect, it, vi } from "vitest";
import type { TenantConfig } from "../lib/types";

// --- Gemini mock: lets each test decide whether generateText resolves or throws.
const generateTextMock = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));
vi.mock("@ai-sdk/google", () => ({
  google: () => ({ modelId: "gemini-2.5-flash" }),
}));

// --- Tenant + storage mocks for the per-tenant isolation test.
const getAllTenantsMock = vi.fn();
const getTenantConfigMock = vi.fn();
vi.mock("../lib/tenants", () => ({
  getAllTenants: (...args: unknown[]) => getAllTenantsMock(...args),
  getTenantConfig: (...args: unknown[]) => getTenantConfigMock(...args),
}));

vi.mock("../lib/storage", () => ({
  getClickCounts: vi.fn(async () => ({ total: 10, thisWeek: 4, lastWeek: 2 })),
  getClickCountsByPrefix: vi.fn(async () => ({})),
  getActivity: vi.fn(async () => []),
  getSectionTimestamps: vi.fn(async () => ({})),
  getContent: vi.fn(async (section: string) => {
    if (section === "services") return { services: [] };
    return { siteName: "Test Site" };
  }),
  getSearchData: vi.fn(async () => ({ queries: [] })),
  getDailyMetrics: vi.fn(async () => []),
}));

import {
  buildReportFallbackSummary,
  buildReportSubject,
  buildReportHeading,
  generateAllReports,
  generateWeeklyReport,
} from "../lib/reports";
import type { WeeklyReportData } from "../lib/reports";

function tenant(overrides: Partial<TenantConfig>): TenantConfig {
  return {
    id: "t1",
    subdomain: "t1",
    siteName: "Test Site",
    ownerName: "Chris",
    ownerEmail: "owner@example.com",
    industry: "wellness",
    active: true,
    createdAt: new Date().toISOString(),
    template: "wellness" as TenantConfig["template"],
    ...overrides,
  };
}

const baseSummaryInput = {
  siteName: "Test Site",
  ownerName: "Chris",
  pageViews: { total: 120, thisWeek: 47 },
  bookingClicks: { total: 30, thisWeek: 6 },
  topServices: [{ serviceId: "svc1", total: 12, thisWeek: 5 }],
  topSearchQueries: [{ query: "yoga near me", clicks: 8, impressions: 200, position: 3 }],
  staleSections: [{ section: "story", daysSinceUpdate: 40 }],
  recentActivity: [],
  serviceNames: { svc1: "Morning Flow" },
  verifiedChanges: [],
  failedVerifications: 0,
  visibilityLines: "",
  anomalyNarrative: "",
};

function reportData(overrides: Partial<WeeklyReportData> = {}): WeeklyReportData {
  return {
    tenant: tenant({ id: "t1" }),
    pageViews: { total: 0, thisWeek: 0 },
    bookingClicks: { total: 0, thisWeek: 0 },
    phoneClicks: { total: 0, thisWeek: 0 },
    topServices: [],
    topSearchQueries: [],
    staleSections: [],
    recentActivity: [],
    verifiedChanges: [],
    failedVerifications: 0,
    visibilityLines: "",
    analyticsRows: [],
    summary: "",
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildReportSubject (verdict-first)", () => {
  it("leads with the proof number when there was traffic", () => {
    const s = buildReportSubject(reportData({ pageViews: { total: 120, thisWeek: 47 } }));
    expect(s).toBe("47 people found you this week");
  });

  it("folds customer actions into the subject when present", () => {
    const s = buildReportSubject(
      reportData({
        pageViews: { total: 120, thisWeek: 47 },
        bookingClicks: { total: 30, thisWeek: 2 },
        phoneClicks: { total: 10, thisWeek: 1 },
      }),
    );
    expect(s).toBe("47 people found you and 3 took action this week");
  });

  it("singularizes a single visitor", () => {
    const s = buildReportSubject(reportData({ pageViews: { total: 1, thisWeek: 1 } }));
    expect(s).toBe("1 person found you this week");
  });

  it("frames an established-but-flat week as steady, never empty", () => {
    const s = buildReportSubject(reportData({ pageViews: { total: 120, thisWeek: 0 } }));
    expect(s).toBe("A steady week. Here's where your site stands");
    expect(s.toLowerCase()).not.toContain("update");
  });

  it("stays honest (no invented verdict) before any tracking data lands", () => {
    const s = buildReportSubject(reportData());
    expect(s).toBe("Your weekly report from Strelva");
    expect(s).not.toMatch(/\b0\b/);
  });
});

describe("buildReportHeading (verdict-first h1)", () => {
  it("renders a proof verdict when there was traffic", () => {
    expect(buildReportHeading(reportData({ pageViews: { total: 120, thisWeek: 47 } }))).toBe(
      "Here's your proof this week",
    );
  });

  it("reads as steady on an established-but-flat week", () => {
    expect(buildReportHeading(reportData({ pageViews: { total: 120, thisWeek: 0 } }))).toBe(
      "A steady week. Here's where you stand",
    );
  });

  it("is honest and forward-looking before tracking data lands", () => {
    expect(buildReportHeading(reportData())).toBe("Your site is live and tracking");
  });

  it("never falls back to the generic label", () => {
    expect(buildReportHeading(reportData({ pageViews: { total: 120, thisWeek: 47 } }))).not.toBe(
      "Your weekly report",
    );
  });
});

describe("buildReportFallbackSummary — quiet established week reads as steady + a lever", () => {
  it("frames a flat week with history as steady and names the next lever", () => {
    const out = buildReportFallbackSummary({
      ...baseSummaryInput,
      pageViews: { total: 120, thisWeek: 0 },
      bookingClicks: { total: 0, thisWeek: 0 },
      topServices: [],
      topSearchQueries: [],
      staleSections: [],
    });
    expect(out).toContain("a steady week");
    expect(out).toContain("here's where you stand");
    // The next lever is a concrete action, in the owner's own terms.
    expect(out).toMatch(/share your site|ask Strelva/);
    // Never reads as failure.
    expect(out.toLowerCase()).not.toContain("failing");
  });
});

describe("buildReportFallbackSummary (deterministic, claims-safe)", () => {
  it("reports visits with the '47 people found you' phrasing", () => {
    const out = buildReportFallbackSummary(baseSummaryInput);
    expect(out).toContain("47 people found you this week");
    expect(out).toContain("120 total");
  });

  it("never promises leads or conversions (claims-safe per AGENTS.md)", () => {
    const out = buildReportFallbackSummary(baseSummaryInput).toLowerCase();
    expect(out).not.toContain("lead");
    expect(out).not.toContain("conversion");
    expect(out).not.toContain("guarantee");
    // Only ever describes booking clicks, not bookings won.
    expect(out).toContain("booking click");
  });

  it("folds phone calls into customer actions alongside booking clicks", () => {
    const out = buildReportFallbackSummary({
      ...baseSummaryInput,
      bookingClicks: { total: 30, thisWeek: 6 },
      phoneClicks: { total: 12, thisWeek: 4 },
    });
    // Combined top-line = 6 + 4, with the split spelled out honestly.
    expect(out).toContain("10 people took action this week");
    expect(out).toContain("6 clicked to book");
    expect(out).toContain("4 called you");
    expect(out).toContain("42 total");
  });

  it("reports calls even when no one clicked to book (calls are customer actions)", () => {
    const out = buildReportFallbackSummary({
      ...baseSummaryInput,
      bookingClicks: { total: 0, thisWeek: 0 },
      phoneClicks: { total: 9, thisWeek: 3 },
    });
    expect(out).toContain("3 people called you this week");
    expect(out).toContain("9 total");
    // The call is reported as a call — never as a booking/booking click.
    expect(out).not.toContain("3 booking");
    expect(out).not.toContain("3 clicked to book");
  });

  it("names the top service and the search term verbatim", () => {
    const out = buildReportFallbackSummary(baseSummaryInput);
    expect(out).toContain("Morning Flow");
    expect(out).toContain("yoga near me");
  });

  it("carries the traffic-anomaly story into the body when one is present", () => {
    const narrative =
      "Traffic is down 40% from your usual. You're averaging 5 visitors a day this week versus 9 before. Ask the AI to post this week's update.";
    const out = buildReportFallbackSummary({ ...baseSummaryInput, anomalyNarrative: narrative });
    expect(out).toContain(narrative);
  });

  it("omits the traffic story cleanly when there is no anomaly", () => {
    const out = buildReportFallbackSummary({ ...baseSummaryInput, anomalyNarrative: "" });
    expect(out).not.toContain("Traffic is down");
    expect(out).not.toContain("Traffic jumped");
    // No dangling blank paragraph from an empty narrative.
    expect(out).not.toContain("\n\n\n");
  });

  it("does not assert '0 visitors' when there is no tracking data at all", () => {
    const out = buildReportFallbackSummary({
      ...baseSummaryInput,
      pageViews: { total: 0, thisWeek: 0 },
      bookingClicks: { total: 0, thisWeek: 0 },
      topServices: [],
      topSearchQueries: [],
      staleSections: [],
    });
    // No tracking ever recorded -> "coming online", never a measured zero that
    // reads as failure to the owner.
    expect(out).toContain("visitor tracking");
    expect(out).not.toContain("no new visits");
    expect(out).not.toMatch(/0 (people|visits|person)/);
    expect(out.toLowerCase()).not.toContain("lead");
  });

  it("says 'no new visits' only when tracking has real history but a flat week", () => {
    const out = buildReportFallbackSummary({
      ...baseSummaryInput,
      pageViews: { total: 120, thisWeek: 0 },
      bookingClicks: { total: 0, thisWeek: 0 },
      topServices: [],
      topSearchQueries: [],
      staleSections: [],
    });
    expect(out).toContain("no new visits");
  });
});

describe("generateReportSummary fallback path", () => {
  it("falls back to the deterministic summary when Gemini throws", async () => {
    getTenantConfigMock.mockResolvedValue(tenant({ id: "t1" }));
    generateTextMock.mockRejectedValue(new Error("Gemini 503"));

    const report = await generateWeeklyReport("t1");
    expect(report).not.toBeNull();
    // Deterministic phrasing proves the fallback ran instead of the model.
    expect(report!.summary).toContain("people found you this week");
  });

  it("falls back when Gemini returns empty text", async () => {
    getTenantConfigMock.mockResolvedValue(tenant({ id: "t1" }));
    generateTextMock.mockResolvedValue({ text: "   " });

    const report = await generateWeeklyReport("t1");
    expect(report!.summary).toContain("people found you this week");
  });

  it("uses the model output when Gemini succeeds", async () => {
    getTenantConfigMock.mockResolvedValue(tenant({ id: "t1" }));
    generateTextMock.mockResolvedValue({ text: "Great week! The model wrote this." });

    const report = await generateWeeklyReport("t1");
    expect(report!.summary).toBe("Great week! The model wrote this.");
  });
});

describe("generateAllReports per-tenant isolation", () => {
  it("one tenant's failure does not block the others", async () => {
    getAllTenantsMock.mockResolvedValue([
      tenant({ id: "good1", ownerEmail: "a@example.com" }),
      tenant({ id: "boom", ownerEmail: "b@example.com" }),
      tenant({ id: "good2", ownerEmail: "c@example.com" }),
    ]);
    getTenantConfigMock.mockImplementation(async (id: string) => {
      if (id === "boom") throw new Error("Redis exploded");
      return tenant({ id });
    });
    generateTextMock.mockResolvedValue({ text: "model summary" });

    const { reports, skipped } = await generateAllReports();

    expect(reports.map((r) => r.tenant.id).sort()).toEqual(["good1", "good2"]);
    const boom = skipped.find((s) => s.tenantId === "boom");
    expect(boom?.reason).toBe("generation_failed");
    expect(boom?.detail).toContain("Redis exploded");
  });

  it("records tenants missing an owner email with a distinct reason", async () => {
    getAllTenantsMock.mockResolvedValue([
      tenant({ id: "hasEmail", ownerEmail: "a@example.com" }),
      tenant({ id: "noEmail", ownerEmail: undefined }),
      tenant({ id: "inactive", ownerEmail: "c@example.com", active: false }),
    ]);
    getTenantConfigMock.mockImplementation(async (id: string) => tenant({ id }));
    generateTextMock.mockResolvedValue({ text: "model summary" });

    const { reports, skipped } = await generateAllReports();

    expect(reports.map((r) => r.tenant.id)).toEqual(["hasEmail"]);
    expect(skipped.find((s) => s.tenantId === "noEmail")?.reason).toBe("missing_owner_email");
    expect(skipped.find((s) => s.tenantId === "inactive")?.reason).toBe("inactive");
  });
});
