import { describe, expect, it, vi } from "vitest";
import { addAgencyClaimQueue, ownerClaimQueueState } from "@/experience/workspace/agency-server";
import type { AgencyClientsPage } from "@/experience/workspace/agency-clients";
import { ownerClaimDeliveryCopy, type AgencyClientListItem, type OwnerClaimDelivery } from "@/products/agency-clients/contracts";

const agency = "11111111-1111-4111-8111-111111111111";
const client = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const actor = { userId: "44444444-4444-4444-8444-444444444444", verifiedEmail: "agency@example.test" };
const now = Date.parse("2026-10-14T12:00:00Z");
const page = (): AgencyClientsPage => ({ agencyWorkspaceId: agency, clients: [{ workspaceId: client, name: "Harbor Dental", reach: "agency", role: "agency", provider: true, status: "ready", systems: [], needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null }], queue: [], team: [], total: 1, nextCursor: null, providersRead: true });
const addition = (extra: Partial<AgencyClientListItem> = {}): AgencyClientListItem => ({ additionId: other, agencyWorkspaceId: agency, customerWorkspaceId: client, name: "Harbor Dental", sourceKind: "url", sourceUrl: "https://harbor.example", prospectId: null, factsSeeded: 1, seatId: other, addedBy: actor.userId, addedAt: "2026-10-13T12:00:00Z", replayed: false, ownerClaimed: false, seatActive: true, pendingClaim: { claimId: other, recipientEmail: "private-owner@example.test", expiresAt: "2026-10-20T12:00:00Z", delivery: { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false } }, ...extra });
const db = (data: unknown, error: { message: string } | null = null) => ({ rpc: vi.fn(async () => ({ data, error })) });

describe("agency owner-claim Queue", () => {
  it("projects the actor-scoped waiting claim without email addresses or tokens, with Needs you off", async () => {
    const store = db([addition()]);
    const result = await addAgencyClaimQueue(actor, page(), store, true, now);
    expect(store.rpc).toHaveBeenCalledWith("list_agency_client_additions", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_agency_workspace_id: agency });
    expect(result.queue).toEqual([expect.objectContaining({ kind: "owner_claim", workspaceId: client, title: "Claim not sent to Harbor Dental", claimDelivery: "not_sent", label: "Claim not sent: email to owners is off. Create a fresh link and share it yourself.", href: `/workspace/agency/clients/new?workspaceId=${agency}&client=${client}` })]);
    expect(JSON.stringify(result)).not.toContain("private-owner");
    expect(JSON.stringify(result)).not.toContain("claimPath");
    expect(result.clients[0]!.ownerClaimWaiting).toBe(true);
  });
  it("does no additional read while adding clients is off", async () => {
    const store = db([addition()]); const original = page();
    expect(await addAgencyClaimQueue(actor, original, store, false, now)).toBe(original);
    expect(store.rpc).not.toHaveBeenCalled();
  });
  it("excludes claimed owners, inactive seats, unavailable clients and clients outside the scoped page", async () => {
    for (const extra of [{ ownerClaimed: true }, { seatActive: false }, { customerWorkspaceId: other }]) {
      expect((await addAgencyClaimQueue(actor, page(), db([addition(extra)]), true, now)).queue).toEqual([]);
    }
    const unavailable = page(); unavailable.clients[0]!.status = "unavailable";
    expect((await addAgencyClaimQueue(actor, unavailable, db([addition()]), true, now)).queue).toEqual([]);
  });
  it("keeps a waiting business actionable when its claim is missing or expired", async () => {
    for (const pendingClaim of [null, { ...addition().pendingClaim!, expiresAt: "2026-10-01T12:00:00Z" }]) {
      expect((await addAgencyClaimQueue(actor, page(), db([addition({ pendingClaim })]), true, now)).queue[0]).toMatchObject({ claimDelivery: "no_link", title: "Waiting on Harbor Dental to claim", label: "No current owner link. Create one and share it yourself." });
    }
  });
  it.each([
    ["accepted", "sent", "Waiting on Harbor Dental to claim", "Email accepted for delivery."],
    ["sending", "unconfirmed", "Waiting on Harbor Dental to claim", "Email delivery unconfirmed. Don't resend; create a fresh link and share it yourself if needed."],
    ["unknown", "unconfirmed", "Waiting on Harbor Dental to claim", "Email delivery unconfirmed. Don't resend; create a fresh link and share it yourself if needed."],
  ] as const)("says %s honestly", async (status, claimDelivery, title, label) => {
    const pendingClaim = { ...addition().pendingClaim!, delivery: { status, reason: "x", decision: "R08", agencyEmailVerified: true } };
    const item = (await addAgencyClaimQueue(actor, page(), db([addition({ pendingClaim })]), true, now)).queue[0]!;
    expect(item).toMatchObject({ claimDelivery, title, label });
    expect(JSON.stringify(item)).not.toContain("private-owner");
  });
  it("derives the state from the claim and the clock alone", () => {
    expect(ownerClaimQueueState("Harbor Dental", null, now).claimDelivery).toBe("no_link");
    expect(ownerClaimQueueState("Harbor Dental", addition().pendingClaim, now).title).toBe("Claim not sent to Harbor Dental");
  });
  it("words every delivery state in one place", () => {
    const d = (status: OwnerClaimDelivery["status"], reason: string): OwnerClaimDelivery => ({ status, reason, decision: "R08", agencyEmailVerified: false });
    expect(ownerClaimDeliveryCopy(d("accepted", "")).headline).toBe("Email accepted for delivery.");
    expect(ownerClaimDeliveryCopy(d("unknown", "")).headline).toBe("Email delivery unconfirmed.");
    expect(ownerClaimDeliveryCopy(d("not_sent", "email_suppressed")).headline).toBe("Claim not sent: email to owners is off.");
    expect(ownerClaimDeliveryCopy(d("not_sent", "permission_or_email_gate")).headline).toContain("not permitted for your agency");
    expect(ownerClaimDeliveryCopy(d("not_sent", "other")).headline).toBe("Claim not sent.");
  });
  it("refuses foreign/malformed claim responses and names denied or failed reads", async () => {
    for (const store of [db([addition({ agencyWorkspaceId: other })]), db({ claims: [] }), db(null, { message: "agency_client_access_denied" })]) {
      const result = await addAgencyClaimQueue(actor, page(), store, true, now);
      expect(result.queue).toEqual([]);
      expect(result.queueComplete).toBe(false);
      expect(result.queueGaps).toContain("Owner claims: status could not be read.");
    }
  });
  it("does not count duplicated waiting rows twice on a repeated projection", async () => {
    const store = db([addition()]);
    const first = await addAgencyClaimQueue(actor, page(), store, true, now);
    expect((await addAgencyClaimQueue(actor, first, store, true, now)).queue).toHaveLength(1);
  });
});
