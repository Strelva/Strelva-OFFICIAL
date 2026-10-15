import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { assertWorkspaceMember } from "@/platform/workspaces/repository";
import { readAskBookingSummary } from "@/products/bookings/server";
import { readWorkspaceInquiryInbox } from "@/products/inquiries/workspace-inbox";
import { readSystemArrivals } from "@/products/inquiries/arrivals";
vi.mock("@/platform/workspaces/repository", () => ({ assertWorkspaceMember: vi.fn() }));
vi.mock("@/products/bookings/server", () => ({ readAskBookingSummary: vi.fn() }));
vi.mock("@/products/inquiries/workspace-inbox", () => ({ readWorkspaceInquiryInbox: vi.fn() }));
const workspaceId = "61000000-0000-4000-8000-000000000003";
const actor = { userId: "owner", verifiedEmail: "owner@example.test" };
const now = new Date("2026-10-14T12:00:00Z");
const inbox = () => ({ sites: [{ key: "site", tenantId: "site", siteName: "Harbor Dental", lastThirtyDays: 1, unavailable: false,
  leads: [{ id: "lead", name: "Lee", email: "private@example.test", message: "Private message", source: "website", fields: [], createdAt: now.toISOString() }] }], denied: [],
  held: { items: [{ rowId: "spam", tenantId: "site", name: "SPAM", email: null, message: null, reason: "spam", createdAt: now.toISOString() }], unavailable: false } });
const bookings = () => ({ sourceProof: "stored", readAt: now.toISOString(), range: { from: now.toISOString(), to: now.toISOString(), definition: "next 30 days" },
  complete: true, upcomingCount: 1, observedConfirmed: 1, pendingCount: 0, unknownCount: 0, sources: [], businessRecord: null,
  bookings: [{ id: "one", source: "legacy" as const, title: "Consultation", start: "2026-10-15T09:00:00 (America/New_York)", status: "confirmed" as const, evidence: "store" }] });
beforeEach(() => {
  vi.mocked(assertWorkspaceMember).mockReset().mockResolvedValue();
  vi.mocked(readWorkspaceInquiryInbox).mockReset().mockResolvedValue(inbox());
  vi.mocked(readAskBookingSummary).mockReset().mockResolvedValue(bookings());
});
describe("email-independent customer arrivals", () => {
  it("reads kept records through current membership and keeps messages, email and spam out of the notice", async () => {
    const result = await readSystemArrivals(actor, workspaceId, now);
    expect(assertWorkspaceMember).toHaveBeenCalledWith(actor, workspaceId);
    expect(result.items.map(row => row.title)).toEqual(["Lee reached out", "Consultation"]);
    expect(result.items.every(row => row.href.includes(workspaceId))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private@example|Private message|SPAM/);
    expect(result.unavailable).toEqual([]);
    expect(result.items.find(row => row.kind === "booking")?.href).toContain("view=day&date=2026-10-15");
    expect(result.items.find(row => row.kind === "booking")?.detail).toContain("Oct 15, 9:00 AM");
  });
  it("checks authority before either source and discards partial data after revocation", async () => {
    vi.mocked(assertWorkspaceMember).mockRejectedValueOnce(new WorkspaceAccessError());
    await expect(readSystemArrivals(actor, workspaceId, now)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(readWorkspaceInquiryInbox).not.toHaveBeenCalled();
    expect(readAskBookingSummary).not.toHaveBeenCalled();
    vi.mocked(readAskBookingSummary).mockRejectedValueOnce(new WorkspaceAccessError());
    await expect(readSystemArrivals(actor, workspaceId, now)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
  it("retains known bookings while a failed inquiry read remains unknown", async () => {
    vi.mocked(readWorkspaceInquiryInbox).mockRejectedValueOnce(new Error("database unavailable"));
    const result = await readSystemArrivals(actor, workspaceId, now);
    expect(result.unavailable).toEqual(["inquiries"]);
    expect(result.items.map(row => row.title)).toEqual(["Consultation"]);
  });
  it("reads bookings even with the inquiry release off without accessing inquiry records", async () => {
    const result = await readSystemArrivals(actor, workspaceId, now, undefined, false);
    expect(result.sources).toEqual(["bookings"]);
    expect(result.items).toHaveLength(1);
    expect(readWorkspaceInquiryInbox).not.toHaveBeenCalled();
  });
  it("preserves incomplete source evidence and caps notices without including old inquiries", async () => {
    const data = inbox();
    data.sites[0]!.leads = Array.from({ length: 20 }, (_, i) => ({ ...data.sites[0]!.leads[0]!, id: `lead-${i}`, createdAt: i === 0 ? "2020-01-01T00:00:00Z" : now.toISOString() }));
    vi.mocked(readWorkspaceInquiryInbox).mockResolvedValueOnce(data);
    vi.mocked(readAskBookingSummary).mockResolvedValueOnce({ ...bookings(), complete: false });
    const result = await readSystemArrivals(actor, workspaceId, now);
    expect(result.items.filter(row => row.kind === "inquiry")).toHaveLength(6);
    expect(result.items.some(row => row.id.endsWith(":lead-0"))).toBe(false);
    expect(result.unavailable).toEqual(["bookings"]);
  });
});

it("opens native schedule work at its recorded receipt instead of an unrelated calendar week", async () => {
  const data = bookings();
  vi.mocked(readAskBookingSummary).mockResolvedValueOnce({ ...data, bookings: [{ ...data.bookings[0]!, source: "public_booking", workId: "native-work" }] });
  const result = await readSystemArrivals(actor, workspaceId, now);
  expect(result.items.find(row => row.kind === "booking")?.href).toBe(`/workspace?workspaceId=${workspaceId}&work=native-work`);
});
