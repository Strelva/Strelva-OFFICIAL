import { describe, expect, it } from "vitest";
import {
  careReportFactsSchema, careReportOwnerViewSchema, careReportReleaseSnapshotSchema, careReportViewSchema, generateCommandSchema,
  reportActionSchema, timeEntryCommandSchema,
} from "@/platform/care-reports/contracts";
import { AGENCY, BUSINESS, facts, REPORT, RELEASE } from "./care-reports-fixtures";

describe("Care plan report contracts", () => {
  it("parses a full fixture and rejects extra keys", () => {
    expect(careReportFactsSchema.safeParse(facts()).success).toBe(true);
    expect(careReportFactsSchema.safeParse({ ...facts(), costUsd: 1 }).success).toBe(false);
    const withCost = facts(); (withCost.usage as Record<string, unknown>).costUsd = 0.1;
    expect(careReportFactsSchema.safeParse(withCost).success).toBe(false);
  });

  it("discriminates outcomes on available", () => {
    expect(careReportFactsSchema.safeParse(facts({ outcomes: { available: true, month: { visits: 1 } } })).success).toBe(true);
    expect(careReportFactsSchema.safeParse({ ...facts(), outcomes: { available: true } }).success).toBe(false);
    expect(careReportFactsSchema.safeParse({ ...facts(), outcomes: { available: false, reason: "other" } }).success).toBe(false);
  });

  it("parses a Release snapshot with its note and number", () => {
    expect(careReportReleaseSnapshotSchema.safeParse({ ...facts(), agencyNote: null, release: 1, publishedAt: "2026-11-01T00:00:00Z" }).success).toBe(true);
    expect(careReportReleaseSnapshotSchema.safeParse({ ...facts(), agencyNote: null, release: 0, publishedAt: "x" }).success).toBe(false);
  });

  it("keeps the owner view free of drafts and delivery", () => {
    const owner = {
      audience: "owner", report: { id: REPORT, agencyWorkspaceId: AGENCY, businessWorkspaceId: BUSINESS, businessName: "Harbor Dental", month: "2026-10" },
      releases: [{ id: RELEASE, number: 1, publishedAt: "2026-11-01T00:00:00Z", snapshot: {} }],
    };
    expect(careReportOwnerViewSchema.safeParse(owner).success).toBe(true);
    expect(careReportViewSchema.safeParse(owner).success).toBe(true);
    expect(careReportOwnerViewSchema.safeParse({ ...owner, deliveries: [] }).success).toBe(false);
    expect(careReportOwnerViewSchema.safeParse({ ...owner, releases: [] }).success).toBe(false);
  });

  it("validates commands", () => {
    expect(generateCommandSchema.safeParse({ agencyWorkspaceId: AGENCY, month: "2026-10" }).success).toBe(true);
    expect(generateCommandSchema.safeParse({ agencyWorkspaceId: AGENCY, month: "2026-13" }).success).toBe(false);
    expect(reportActionSchema.safeParse({ action: "note", note: "hi", expectedRevision: 2 }).success).toBe(true);
    expect(reportActionSchema.safeParse({ action: "send", release: 0 }).success).toBe(false);
    expect(reportActionSchema.safeParse({ action: "share_link", extra: 1 }).success).toBe(false);
    expect(timeEntryCommandSchema.safeParse({ agencyWorkspaceId: AGENCY, workspaceId: BUSINESS, id: REPORT, minutes: 30, category: "change", occurredOn: "2026-10-05" }).success).toBe(true);
    expect(timeEntryCommandSchema.safeParse({ agencyWorkspaceId: AGENCY, workspaceId: BUSINESS, id: REPORT, minutes: 0, category: "change", occurredOn: "2026-10-05" }).success).toBe(false);
    expect(timeEntryCommandSchema.safeParse({ agencyWorkspaceId: AGENCY, workspaceId: BUSINESS, id: REPORT, minutes: 5, category: "golf", occurredOn: "2026-10-05" }).success).toBe(false);
  });
});
