import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readWorkspaceLeads, type LeadDependencies } from "@/products/inquiries/linked-leads";
import { readWorkspaceInquiryInbox } from "@/products/inquiries/workspace-inbox";
import type { WorkspaceInquiryLead } from "@/products/inquiries/workspace-records";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { forwardingErrorMessage } from "@/experience/places/ForwardInquiries";

const WS = "24500000-0000-4000-8000-0000000000b1";
const ACTOR = { userId: "24500000-0000-4000-8000-000000000001", verifiedEmail: "owner@bakery.example.test" };
const site = { tenantId: "forwarded-email", tenantStableId: "24500000-0000-4000-8000-0000000000c1", siteName: "Bakery site" };
const forwardedRow = (patch: Partial<WorkspaceInquiryLead> = {}): WorkspaceInquiryLead => ({
  id: "24500000-0000-4000-8000-000000000201", tenantId: "forwarded-email", leadId: `lead_fwd_${"1".repeat(40)}`, name: "Jane Doe", email: "jane.doe@customer.example.test",
  message: "Do you make three-tier wedding cakes?", source: "forwarded_email", fields: { subject: "Wedding cake for June", format: "gmail", forwardedBy: "pat@bakery.example.test" },
  intakeState: "kept", heldReason: null, intakeStateAt: null, contactId: null, capturedAt: "2026-10-12T13:14:00.000Z", recordedVia: "forwarded_email", ...patch,
});

describe("forwarded inquiries in the workspace inbox", () => {
  const deps = (patch: Partial<LeadDependencies> = {}): LeadDependencies => ({
    // A tenant whose slug collides with the forwarded marker must not absorb forwarded rows.
    sites: async () => ({ sites: [site], denied: [] }),
    storeReady: () => true,
    leads: async () => [],
    now: () => Date.parse("2026-10-12T14:00:00Z"),
    ...patch,
  });
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("adds one Forwarded email section, with held forwarded rows in review, only while forwarding is on", async () => {
    const held = forwardedRow({ id: "24500000-0000-4000-8000-000000000202", intakeState: "held_as_spam", heldReason: "spam_header" });
    const released = forwardedRow({ id: "24500000-0000-4000-8000-000000000203", leadId: `lead_fwd_${"3".repeat(40)}`, intakeState: "released", capturedAt: "2026-10-12T13:30:00.000Z" });
    const on = await readWorkspaceLeads(ACTOR, WS, deps({ records: async () => ({ held: [held], released: [released] }), forwarded: async () => [forwardedRow(), released] }));
    const section = on.sites.find((item) => item.key === "forwarded");
    expect(section).toMatchObject({ forwarded: true, siteName: "Forwarded email", tenantId: null, lastThirtyDays: 2 });
    expect(section!.leads.map((lead) => [lead.name, lead.source, lead.releasedRowId ?? null])).toEqual([["Jane Doe", "Forwarded email", released.id], ["Jane Doe", "Forwarded email", null]]);
    expect(section!.leads[1]!.fields).toEqual([["subject", "Wedding cake for June"], ["forwardedBy", "pat@bakery.example.test"]]);
    expect(on.sites.find((item) => item.key === "forwarded-email")!.leads).toHaveLength(0);
    expect(on.held!.items.map((item) => item.rowId)).toEqual([held.id]);

    const off = await readWorkspaceLeads(ACTOR, WS, deps({ records: async () => ({ held: [held], released: [released] }), forwarded: async () => null }));
    expect(off.sites.some((item) => item.key === "forwarded")).toBe(false);
    expect(off.held!.items).toEqual([]);
  });

  it("a failed forwarded read is unavailable, never an empty inbox", async () => {
    const result = await readWorkspaceLeads(ACTOR, WS, deps({ forwarded: async () => { throw new Error("pg down"); } }));
    expect(result.sites.find((item) => item.key === "forwarded")).toMatchObject({ unavailable: true, leads: [] });
  });

  it("the paged Postgres inbox puts forwarded rows only in the forwarded section", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    const base = { denied: [], sites: [
      { key: "forwarded-email", tenantId: "forwarded-email", siteName: "Bakery site", leads: [], lastThirtyDays: 0, unavailable: false },
      { key: "forwarded", tenantId: null, forwarded: true as const, siteName: "Forwarded email", leads: [], lastThirtyDays: 0, unavailable: false },
    ] };
    const rows = [{ ...forwardedRow(), recordedVia: "forwarded_email" }];
    const result = await readWorkspaceInquiryInbox(ACTOR, WS, undefined, { base: vi.fn(async () => base), source: vi.fn(async () => "postgres" as const), rpc: vi.fn(async () => rows) });
    expect(result.sites[0]!.leads).toHaveLength(0);
    expect(result.sites[1]!.leads.map((lead) => [lead.name, lead.source])).toEqual([["Jane Doe", "Forwarded email"]]);
  });

  it("renders the section, its empty state and the forwarding panel only when on", () => {
    const data = { denied: [], sites: [{ key: "forwarded", tenantId: null, forwarded: true as const, siteName: "Forwarded email", leads: [], lastThirtyDays: 0, unavailable: false }] };
    const on = renderToStaticMarkup(<WorkspaceInquiries workspaceId={WS} state={{ kind: "ready", data }} forwarding />);
    expect(on).toContain("Forward your inquiries");
    expect(on).toContain("No forwarded email yet.");
    expect(on).toContain("Loading your forwarding address");
    const off = renderToStaticMarkup(<WorkspaceInquiries workspaceId={WS} state={{ kind: "ready", data: { denied: [], sites: [] } }} />);
    expect(off).not.toContain("Forward your inquiries");
    expect(off).toContain("No site is connected");
    const denied = renderToStaticMarkup(<WorkspaceInquiries workspaceId={WS} state={{ kind: "permission" }} forwarding />);
    expect(denied).not.toContain("Forward your inquiries");
  });

  it("explains refusals plainly", () => {
    expect(forwardingErrorMessage(403, null)).toContain("Only the owner, an admin or the agency running inquiries");
    expect(forwardingErrorMessage(409, { error: "Someone changed the forwarding address at the same time. Reload and try again." })).toContain("Reload");
    expect(forwardingErrorMessage(500, null)).toContain("Reload");
  });
});
