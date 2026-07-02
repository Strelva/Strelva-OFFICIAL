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
  generateAllReports,
  generateWeeklyReport,
} from "../lib/reports";

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

afterEach(() => {
  vi.clearAllMocks();
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

  it("handles a zero-traffic week without inventing activity", () => {
    const out = buildReportFallbackSummary({
      ...baseSummaryInput,
      pageViews: { total: 0, thisWeek: 0 },
      bookingClicks: { total: 0, thisWeek: 0 },
      topServices: [],
      topSearchQueries: [],
      staleSections: [],
    });
    expect(out).toContain("no new visits");
    expect(out.toLowerCase()).not.toContain("lead");
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
