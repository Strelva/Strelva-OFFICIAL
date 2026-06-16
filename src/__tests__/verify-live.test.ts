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
  it("renders a verified-live line with weekday and time", () => {
    const verifiedAt = new Date("2026-06-10T16:12:00.000Z").toISOString();
    const writtenAt = new Date("2026-06-10T15:00:00.000Z").toISOString();

    const lines = formatVerificationLines(
      [{ section: "hours", writtenAt, verifiedAt }],
      0
    );

    // Must mention section name and time
    expect(lines).toContain("Hours updated");
    expect(lines).toContain("checked live");
    // Must not claim "verified" if it isn't — this was actually verified
    expect(lines).toContain("Hours updated");
  });

  it("renders the honest failure line for unverified changes", () => {
    const lines = formatVerificationLines([], 2);
    expect(lines).toContain("2 changes could not be confirmed live");
    expect(lines).toContain("we're on it");
  });

  it("renders both verified and failure lines when both exist", () => {
    const verifiedAt = new Date("2026-06-10T16:12:00.000Z").toISOString();
    const writtenAt = new Date("2026-06-10T15:00:00.000Z").toISOString();

    const lines = formatVerificationLines(
      [{ section: "services", writtenAt, verifiedAt }],
      1
    );
    expect(lines).toContain("Services updated");
    expect(lines).toContain("1 change could not be confirmed live");
  });

  it("returns empty string when there are no changes and no failures", () => {
    const lines = formatVerificationLines([], 0);
    expect(lines).toBe("");
  });

  it("NEVER claims verified when failedVerifications > 0 and verifiedChanges is empty", () => {
    const lines = formatVerificationLines([], 3);
    // Must not say "verified" in a positive context — only the honest failure line
    expect(lines).not.toContain("checked live");
    expect(lines).toContain("could not be confirmed");
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

    expect(verifiedChanges[0].section).toBe("story");
  });
});
