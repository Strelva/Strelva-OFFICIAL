import { describe, expect, it, vi } from "vitest";
import { addAgencyOwnerReach, type OwnerReachOptions } from "@/experience/workspace/agency/owner-reach";
import type { AgencyClientsPage, AgencyQueueItem } from "@/experience/workspace/agency-clients";

const agency = "11111111-1111-4111-8111-111111111111";
const harbor = "22222222-2222-4222-8222-222222222222";
const north = "33333333-3333-4333-8333-333333333333";
const decision = "55555555-5555-4555-8555-555555555555";
const actor = { userId: "44444444-4444-4444-8444-444444444444", verifiedEmail: "Agency@Example.test" };
const now = Date.parse("2026-10-14T12:00:00Z");
const client = (workspaceId: string, name: string) => ({ workspaceId, name, reach: "agency" as const, role: "agency" as const, provider: true, status: "ready" as const,
  systems: [], needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null });
const waiting = (): AgencyQueueItem => ({ id: "needs-you:1", kind: "needs_you", workspaceId: harbor, clientName: "Harbor Dental", title: "Make the website live",
  systemId: null, workId: null, decisionId: decision, since: "2026-10-12T12:00:00Z" });
const page = (queue: AgencyQueueItem[] = []): AgencyClientsPage => ({ agencyWorkspaceId: agency, clients: [client(harbor, "Harbor Dental"), client(north, "North Bakery")],
  queue, team: [], total: 2, nextCursor: null, providersRead: true });
const row = (workspaceId: string, extra: Record<string, unknown> = {}) => ({ workspaceId, ownerMember: false, contact: "none", contactProposed: false, invite: null,
  canIssueClaim: false, decisions: [], lapsedRecently: 0, ...extra });
const db = (data: unknown, error: { message: string } | null = null) => ({ rpc: vi.fn(async () => ({ data, error })) });
const options = (over: Partial<OwnerReachOptions> = {}): OwnerReachOptions => ({ enabled: true, clientEmailOn: async () => false, now, ...over });

describe("agency owner reach", () => {
  it("returns the same page and reads nothing while off", async () => {
    const store = db([]); const original = page();
    expect(await addAgencyOwnerReach(actor, original, store, options({ enabled: false }))).toBe(original);
    expect(store.rpc).not.toHaveBeenCalled();
  });

  it("asks for exactly the ready clients, as the actor", async () => {
    const store = db([row(harbor, { ownerMember: true }), row(north, { ownerMember: true })]);
    const input = page(); input.clients.push({ ...client("66666666-6666-4666-8666-666666666666", "Away"), status: "unavailable" });
    await addAgencyOwnerReach(actor, input, store, options());
    expect(store.rpc).toHaveBeenCalledWith("read_agency_client_owner_reach", {
      p_agency_workspace_id: agency, p_user_id: actor.userId, p_verified_email: "agency@example.test", p_workspace_ids: [harbor, north] });
  });

  it("names a staff-trusted client and says why", async () => {
    const result = await addAgencyOwnerReach(actor, page(), db([row(harbor, { contact: "trusted_staff" }), row(north, { ownerMember: true })]), options());
    expect(result.queue).toEqual([expect.objectContaining({ id: `owner-reach:${harbor}`, kind: "owner_unreachable", title: "Owner not reachable: Harbor Dental",
      label: "Owner email on record is a staff address", workspaceId: harbor })]);
    expect(result.clients[0]!.ownerReach).toMatchObject({ state: "staff_address", reachable: false, canIssueClaim: false });
    expect(result.clients[1]!.ownerReach).toMatchObject({ state: "owner_in", reachable: true });
  });

  it("gives an owner decision its lapse time and ties the Queue item to the oldest one", async () => {
    const result = await addAgencyOwnerReach(actor, page([waiting()]), db([row(harbor, { decisions: [{ id: decision, expiresAt: "2026-10-26T12:00:00Z", deliveryState: "not_sent" }] }), row(north, { ownerMember: true })]), options());
    expect(result.queue.find(item => item.kind === "needs_you")).toMatchObject({ expiresAt: "2026-10-26T12:00:00Z", ownerReachable: false });
    expect(result.queue.find(item => item.kind === "owner_unreachable")).toMatchObject({ since: "2026-10-12T12:00:00Z", label: "No owner email on record" });
    expect(result.clients[0]!.ownerReach).toMatchObject({ openDecisions: 1 });
  });

  it("makes no item for a signed-in owner", async () => {
    const result = await addAgencyOwnerReach(actor, page(), db([row(harbor, { ownerMember: true }), row(north, { ownerMember: true })]), options());
    expect(result.queue).toEqual([]);
  });

  it("asks about client email only for owners who are not signed in, and treats a failure as off", async () => {
    const emailOn = vi.fn(async () => { throw new Error("down"); });
    const result = await addAgencyOwnerReach(actor, page(), db([row(harbor, { contact: "trusted" }), row(north, { ownerMember: true })]), options({ clientEmailOn: emailOn }));
    expect(emailOn).toHaveBeenCalledTimes(1);
    expect(emailOn).toHaveBeenCalledWith(harbor);
    expect(result.clients[0]!.ownerReach).toMatchObject({ state: "email_off" });
  });

  it("replaces a claim row that only says the claim was not sent, one row per client", async () => {
    const claim: AgencyQueueItem = { id: "owner-claim:1", kind: "owner_claim", workspaceId: north, clientName: "North Bakery", title: "Claim not sent to North Bakery",
      systemId: null, workId: null, since: "2026-10-13T12:00:00Z", claimDelivery: "not_sent" };
    const invite = { kind: "agency_claim", expiresAt: "2026-10-20T12:00:00Z", deliveryStatus: "not_sent", deliveryReason: "gated", recipientStaff: false };
    const result = await addAgencyOwnerReach(actor, page([claim]), db([row(harbor, { ownerMember: true }), row(north, { invite, canIssueClaim: true })]), options());
    expect(result.queue.map(item => item.kind)).toEqual(["owner_unreachable"]);
    expect(result.queue[0]!.label).toBe("Claim not sent: email to owners is off. Share the link yourself · works until Oct 20");
  });

  it("keeps the claim row that warns not to resend an unconfirmed email", async () => {
    const claim: AgencyQueueItem = { id: "owner-claim:1", kind: "owner_claim", workspaceId: north, clientName: "North Bakery", title: "Waiting on North Bakery to claim",
      systemId: null, workId: null, since: "2026-10-13T12:00:00Z", claimDelivery: "unconfirmed" };
    const invite = { kind: "agency_claim", expiresAt: "2026-10-20T12:00:00Z", deliveryStatus: "unknown", deliveryReason: "delivery_unconfirmed", recipientStaff: false };
    const result = await addAgencyOwnerReach(actor, page([claim]), db([row(harbor, { ownerMember: true }), row(north, { invite })]), options());
    expect(result.queue.map(item => item.kind)).toEqual(["owner_claim"]);
  });

  it("refuses a row outside the page and says the read is incomplete", async () => {
    const result = await addAgencyOwnerReach(actor, page(), db([row("77777777-7777-4777-8777-777777777777")]), options());
    expect(result.queueComplete).toBe(false);
    expect(result.queueGaps).toEqual(["Owner reach: could not be read."]);
    expect(result.queue).toEqual([]);
    expect(result.clients.every(item => item.ownerReach === undefined)).toBe(true);
  });

  it("says the read is incomplete when the database fails", async () => {
    const result = await addAgencyOwnerReach(actor, page(), db(null, { message: "boom" }), options());
    expect(result).toMatchObject({ queueComplete: false, queueGaps: ["Owner reach: could not be read."] });
  });

  it("carries no email address, and running twice changes nothing", async () => {
    const store = db([row(harbor, { contact: "trusted_staff" }), row(north, { contact: "none" })]);
    const once = await addAgencyOwnerReach(actor, page([waiting()]), store, options());
    const twice = await addAgencyOwnerReach(actor, once, store, options());
    expect(JSON.stringify(once)).not.toContain("@");
    expect(twice.queue).toEqual(once.queue);
    expect(twice.queue.filter(item => item.kind === "owner_unreachable")).toHaveLength(2);
  });
});
