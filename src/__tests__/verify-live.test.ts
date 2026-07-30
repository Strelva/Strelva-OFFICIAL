/**
 * Tests for the verified-live receipt feature.
 *
 * Coverage:
 * 1. verifyContentLive — verified, mismatch, fetch-error paths
 * 2. scheduleVerification — emits change_verified and change_verify_failed events
 * 3. Report rendering — formatVerificationLines and extractVerificationData
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "../lib/types";

// ---- Mock the storage layer ----
const mockGetContent = vi.fn();
const mockInvalidateCachedContent = vi.fn();

vi.mock("../lib/storage/content-store", () => ({
  getContent: (...args: unknown[]) => mockGetContent(...args),
}));

vi.mock("../lib/storage/content-cache", () => ({
  invalidateCachedContent: (...args: unknown[]) =>
    mockInvalidateCachedContent(...args),
}));

// ---- Mock the events layer ----
const mockAddEvent = vi.fn();
vi.mock("../lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
}));

// ---- Mock the Slack notification helper ----
const mockSendSlack = vi.fn();
vi.mock("../lib/slack", () => ({
  sendSlackNotification: (...args: unknown[]) => mockSendSlack(...args),
}));

import {
  verifyContentLive,
  scheduleVerification,
} from "../lib/verify-live";

import {
  formatVerificationLines,
  extractVerificationData,
} from "../lib/reports";

// ---------------------------------------------------------------------------
// verifyContentLive unit tests
// ---------------------------------------------------------------------------

describe("verifyContentLive", () => {
  const tenantId = "test-tenant";
  const section = "hero" as const;

  const payload = {
    headline: "Open Saturdays",
    subheadline: "See you soon",
    tagline: "",
    ctaText: "Book now",
    ctaLink: "/book",
    backgroundImageUrl: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateCachedContent.mockResolvedValue(undefined);
  });

  it("returns verified=true when live content matches expected payload", async () => {
    mockGetContent.mockResolvedValue({ ...payload });

    const result = await verifyContentLive(tenantId, section, payload);

    expect(result.verified).toBe(true);
    expect(result.checkedAt).toBeTruthy();
    expect(result.evidence).toContain("match=true");
    expect(mockInvalidateCachedContent).toHaveBeenCalledWith(section, tenantId);
  });

  it("returns verified=false when live content differs from expected payload", async () => {
    mockGetContent.mockResolvedValue({ ...payload, headline: "Old headline" });

    const result = await verifyContentLive(tenantId, section, payload);

    expect(result.verified).toBe(false);
    expect(result.evidence).toContain("match=false");
  });

  it("returns verified=false and surfaces the error when fetch throws", async () => {
    mockGetContent.mockRejectedValue(new Error("Redis timeout"));

    const result = await verifyContentLive(tenantId, section, payload);

    expect(result.verified).toBe(false);
    expect(result.evidence).toContain("fetch-error=Redis timeout");
  });
});

// ---------------------------------------------------------------------------
// Event emission via scheduleVerification
// ---------------------------------------------------------------------------

describe("scheduleVerification — event emission", () => {
  const tenantId = "tenant-x";
  const section = "contact" as const;
  const expected = { email: "hi@example.com", phone: "555-1234", locationTitle: "Downtown", locationDescription: "Main St" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateCachedContent.mockResolvedValue(undefined);
    mockAddEvent.mockResolvedValue({ id: "evt_test" });
    mockSendSlack.mockResolvedValue(true);
  });

  it("emits change_verified when content matches", async () => {
    mockGetContent.mockResolvedValue({ ...expected });

    scheduleVerification(tenantId, section, expected);
    // Drain microtask queue
    await new Promise((r) => setTimeout(r, 20));

    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        type: "change_verified",
        status: "auto_approved",
        metadata: expect.objectContaining({ section }),
      })
    );
    expect(mockSendSlack).not.toHaveBeenCalled();
  });

  it("emits change_verify_failed when content does not match", async () => {
    mockGetContent.mockResolvedValue({ ...expected, email: "other@example.com" });

    scheduleVerification(tenantId, section, expected);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        type: "change_verify_failed",
        status: "pending",
        metadata: expect.objectContaining({ section }),
      })
    );
    // Failed verification must also ping Slack
    expect(mockSendSlack).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("FAILED"),
      })
    );
  });

  it("emits change_verify_failed when getContent throws", async () => {
    mockGetContent.mockRejectedValue(new Error("DB error"));

    scheduleVerification(tenantId, section, expected);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "change_verify_failed" })
    );
  });
});

// ---------------------------------------------------------------------------
// Report rendering — formatVerificationLines
// ---------------------------------------------------------------------------

describe("formatVerificationLines", () => {
  it("renders a client-facing proof-of-work line for a refreshed section — no internal timestamps", () => {
    const verifiedAt = new Date("2026-06-10T16:12:00.000Z").toISOString();
    const writtenAt = new Date("2026-06-10T15:00:00.000Z").toISOString();

    const lines = formatVerificationLines(
      [{ section: "hours", writtenAt, verifiedAt }],
      0
    );

    expect(lines).toBe("We refreshed your Hours this week.");
    // Internal verification plumbing must never reach the owner.
    expect(lines).not.toContain("checked live");
    expect(lines).not.toMatch(/\d:\d\d/);
  });

  it("groups multiple refreshed sections into one natural sentence", () => {
    const at = new Date("2026-06-10T16:12:00.000Z").toISOString();
    const lines = formatVerificationLines(
      [
        { section: "hours", writtenAt: at, verifiedAt: at },
        { section: "services", writtenAt: at, verifiedAt: at },
      ],
      0
    );
    expect(lines).toBe("We refreshed your Hours and Services this week.");
  });

  it("NEVER surfaces an internal verification failure to the client", () => {
    // failedVerifications is an operator concern (change_verify_failed event),
    // never a line in the owner's report.
    expect(formatVerificationLines([], 2)).toBe("");
    expect(formatVerificationLines([], 3)).not.toContain("could not be confirmed");
    const at = new Date("2026-06-10T16:12:00.000Z").toISOString();
    const withFailure = formatVerificationLines(
      [{ section: "services", writtenAt: at, verifiedAt: at }],
      1
    );
    expect(withFailure).toBe("We refreshed your Services this week.");
    expect(withFailure).not.toContain("could not be confirmed");
  });

  it("filters operator-only sections the owner wouldn't recognize", () => {
    const at = new Date("2026-06-10T16:12:00.000Z").toISOString();
    // "settings" is operator plumbing — must not appear; only real sections do.
    const onlyOperator = formatVerificationLines(
      [{ section: "settings", writtenAt: at, verifiedAt: at }],
      0
    );
    expect(onlyOperator).toBe("");

    const mixed = formatVerificationLines(
      [
        { section: "settings", writtenAt: at, verifiedAt: at },
        { section: "hours", writtenAt: at, verifiedAt: at },
      ],
      0
    );
    expect(mixed).toBe("We refreshed your Hours this week.");
  });

  it("returns empty string when there are no changes", () => {
    expect(formatVerificationLines([], 0)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// extractVerificationData
// ---------------------------------------------------------------------------

describe("extractVerificationData", () => {
  const weekStart = new Date("2026-06-09T00:00:00.000Z"); // Monday
  const weekEnd = new Date("2026-06-15T23:59:59.999Z"); // Sunday

  function makeEvent(
    type: "change_verified" | "change_verify_failed",
    section: string,
    createdAt: string
  ): UnifiedEvent {
    return {
      id: `evt_${Math.random()}`,
      tenantId: "t1",
      source: "ai",
      type,
      title: `${section} update`,
      body: "",
      status: type === "change_verified" ? "auto_approved" : "pending",
      metadata: {
        section,
        checkedAt: createdAt,
      },
      createdAt,
    };
  }

  it("counts verified events within the week window", () => {
    const events: UnifiedEvent[] = [
      makeEvent("change_verified", "hero", "2026-06-10T10:00:00.000Z"),
      makeEvent("change_verified", "services", "2026-06-11T09:00:00.000Z"),
    ];

    const { verifiedChanges, failedVerifications } = extractVerificationData(
      events,
      weekStart,
      weekEnd
    );

    expect(verifiedChanges).toHaveLength(2);
    expect(failedVerifications).toBe(0);
  });

  it("counts failed events within the window", () => {
    const events: UnifiedEvent[] = [
      makeEvent("change_verify_failed", "contact", "2026-06-12T14:00:00.000Z"),
    ];

    const { verifiedChanges, failedVerifications } = extractVerificationData(
      events,
      weekStart,
      weekEnd
    );

    expect(verifiedChanges).toHaveLength(0);
    expect(failedVerifications).toBe(1);
  });

  it("excludes events outside the week window", () => {
    const events: UnifiedEvent[] = [
      makeEvent("change_verified", "hero", "2026-06-08T23:59:59.000Z"), // before window
      makeEvent("change_verified", "hero", "2026-06-16T00:00:00.000Z"), // after window
    ];

    const { verifiedChanges } = extractVerificationData(
      events,
      weekStart,
      weekEnd
    );

    expect(verifiedChanges).toHaveLength(0);
  });

  it("populates section from metadata", () => {
    const events: UnifiedEvent[] = [
      makeEvent("change_verified", "story", "2026-06-10T10:00:00.000Z"),
    ];

    const { verifiedChanges } = extractVerificationData(
      events,
      weekStart,
      weekEnd
    );

    expect(verifiedChanges[0]?.section).toBe("story");
  });
});
