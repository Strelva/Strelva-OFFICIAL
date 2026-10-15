import { describe, expect, it } from "vitest";
import { classifyOperatorRow } from "@/platform/owner-reach/operator";
import type { OperatorOwnerReachRow } from "@/platform/owner-reach/contracts";
import { formatOwnerReachReport, parseOwnerReachArgs } from "../../scripts/owner-reach-report-ops";

const row = (over: Partial<OperatorOwnerReachRow> = {}): OperatorOwnerReachRow => ({
  workspaceId: "aaaaaaaa-0000-4000-8000-000000000001", name: "The Mooney Firm", sites: ["mooney"], ownerMember: false,
  trusted: null, tenantOwnerEmails: [], proposed: null, invite: null, openDecisions: 0, soonestLapse: null, lapsed14d: 0, ...over,
});
const trusted = (staffReason: "platform_operator" | "agency_member" | "staff_domain" | null = null) => ({ email: "owner@mooney.example", trustedVia: "conversion", staffReason });

describe("classifyOperatorRow", () => {
  it("an owner who is signed in is reachable whatever else is on record", () => {
    expect(classifyOperatorRow(row({ ownerMember: true, trusted: trusted("platform_operator") }), false)).toEqual({ problem: "owner_in", unreachable: false });
  });
  it("a pending invitation to a real address still needs the link handed over", () => {
    const invite = { kind: "owner_invitation" as const, recipientEmail: "o@x.example", expiresAt: "2026-10-30T12:00:00Z", deliveryStatus: "not_sent", recipientStaffReason: null };
    expect(classifyOperatorRow(row({ invite }), true)).toEqual({ problem: "invite_pending", unreachable: true });
  });
  it("an invitation to a staff address does not count", () => {
    const invite = { kind: "agency_claim" as const, recipientEmail: "s@x.example", expiresAt: "2026-10-30T12:00:00Z", deliveryStatus: "not_sent", recipientStaffReason: "agency_member" as const };
    expect(classifyOperatorRow(row({ invite, trusted: trusted("agency_member") }), true).problem).toBe("staff_address");
  });
  it("a trusted staff address is a staff address", () => {
    expect(classifyOperatorRow(row({ trusted: trusted("staff_domain") }), true)).toEqual({ problem: "staff_address", unreachable: true });
  });
  it("every site email being staff or empty, with nothing trusted, is a staff address", () => {
    const tenantOwnerEmails = [{ tenantId: "a", email: "s@x.example", staffReason: "staff_domain" as const }, { tenantId: "b", email: null, staffReason: null }];
    expect(classifyOperatorRow(row({ tenantOwnerEmails }), true)).toEqual({ problem: "staff_address", unreachable: true });
  });
  it("nothing trusted, with an address an agency added, waits for the owner", () => {
    expect(classifyOperatorRow(row({ proposed: { email: "p@x.example", actorKind: "agency", at: "2026-10-01T00:00:00Z" } }), true)).toEqual({ problem: "proposed_waiting", unreachable: true });
  });
  it("nothing at all is missing", () => {
    expect(classifyOperatorRow(row(), true)).toEqual({ problem: "missing", unreachable: true });
  });
  it("a real trusted address is reachable only while client email is on", () => {
    expect(classifyOperatorRow(row({ trusted: trusted() }), true)).toEqual({ problem: "trusted_real", unreachable: false });
    expect(classifyOperatorRow(row({ trusted: trusted() }), false)).toEqual({ problem: "trusted_real", unreachable: true });
  });
});

describe("owner reach report", () => {
  it("accepts only --json and --all", () => {
    expect(parseOwnerReachArgs([])).toEqual({ json: false, all: false });
    expect(parseOwnerReachArgs(["--all", "--json"])).toEqual({ json: true, all: true });
    expect(() => parseOwnerReachArgs(["--apply"])).toThrow(/Unknown argument/);
  });

  const rows = [
    row({ name: "Zed Co", trusted: trusted() }),
    row({ name: "Beta Bakery", trusted: trusted("platform_operator"), openDecisions: 2, soonestLapse: "2026-10-20T12:00:00Z" }),
    row({ name: "Alpha Auto" }),
    row({ name: "Signed In", ownerMember: true }),
  ];

  it("lists unreachable businesses first and counts those with no real owner email", () => {
    const lines = formatOwnerReachReport(rows, { all: false, emailOn: true });
    expect(lines[0]).toBe("name | sites | problem | contact on record | pending invite | open decisions | soonest lapse");
    expect(lines.slice(1, -1).map((line) => line.split(" | ")[0])).toEqual(["Alpha Auto", "Beta Bakery"]);
    expect(lines[2]).toBe("Beta Bakery | mooney | staff address | owner@mooney.example (platform_operator) | none | 2 | 2026-10-20");
    expect(lines.at(-1)).toBe("2 of 4 businesses have no real owner email");
  });

  it("--all adds the reachable ones after the unreachable", () => {
    const lines = formatOwnerReachReport(rows, { all: true, emailOn: true });
    expect(lines.slice(1, -1).map((line) => line.split(" | ")[0])).toEqual(["Alpha Auto", "Beta Bakery", "Signed In", "Zed Co"]);
  });
});
