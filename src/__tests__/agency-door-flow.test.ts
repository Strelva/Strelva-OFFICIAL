import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/platform/infra/email/send", async (importOriginal) => ({ ...await importOriginal<typeof import("@/platform/infra/email/send")>(), sendEmailWithReceipt: mail.send }));

import { addAgencyClaimQueue } from "@/experience/workspace/agency-server";
import type { AgencyClientsPage } from "@/experience/workspace/agency-clients";
import { AgencyClientDecisionStatus } from "@/experience/workspace/AgencyClientHomeSections";
import { agencySignupReleaseEnabled } from "@/platform/agency-signup-release";
import { AGENCY_EFFECTS, deriveAgencyOnboarding, type AgencyOnboardingFacts } from "@/platform/workspaces/agency-onboarding";
import { acceptOwnerClaim, addAgencyClient, type AgencyClientDeps } from "@/products/agency-clients/server";
import type { AgencyClientListItem } from "@/products/agency-clients/contracts";

// The agency door over the service seams, with owner email held: sign up,
// land on the checklist, add a client, copy a claim that was not sent, the
// owner claims, and the agency reads the outcome. The database truth for the
// same chain is tests/agency-door-schema.sql. Fictional data only.

const AGENCY = "ad0d0000-0000-4000-8000-000000000010";
const CLIENT = "ad0d0000-0000-4000-8000-000000000020";
const ADDITION = "ad0d0000-0000-4000-8000-000000000030";
const DECISION = "ad0d0000-0000-4000-8000-000000000040";
const KEY = "ad0d0000-0000-4000-8000-0000000000c1";
const agencyActor = { userId: "ad0d0000-0000-4000-8000-000000000001", verifiedEmail: "agency@door.example.test" };
const ownerActor = { userId: "ad0d0000-0000-4000-8000-000000000002", verifiedEmail: "owner@door.example.test" };
const TOKEN = "t".repeat(43);
const NOW = Date.parse("2026-10-15T12:00:00Z");
const delivery = { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false } as const;

const addition = (extra: Partial<AgencyClientListItem> = {}): AgencyClientListItem => ({
  additionId: ADDITION, agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, name: "Door Bakery", sourceKind: "url", sourceUrl: "https://door.example.test/",
  prospectId: null, factsSeeded: 0, seatId: ADDITION, addedBy: agencyActor.userId, addedAt: "2026-10-15T10:00:00Z", replayed: false, ownerClaimed: false, seatActive: true,
  pendingClaim: { claimId: ADDITION, recipientEmail: "owner@door.example.test", expiresAt: "2026-10-29T12:00:00Z", delivery }, ...extra,
});
const page = (): AgencyClientsPage => ({ agencyWorkspaceId: AGENCY, clients: [{ workspaceId: CLIENT, name: "Door Bakery", reach: "agency", role: "agency", provider: true, status: "ready", systems: [], needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null }], queue: [], team: [], total: 1, nextCursor: null, providersRead: true });

beforeEach(() => {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_AGENCY_SIGNUP_RELEASE", "1");
  vi.stubEnv("STRELVA_AGENCY_ADD_CLIENT_RELEASE", "1");
  vi.stubEnv("STRELVA_AGENCY_OWNER_CLAIM_EMAIL_RELEASE", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("agency door end to end (email held)", () => {
  it("walks signup, add, claim not sent, claim, and the outcome without sending anything", async () => {
    // 1) Signing up lands on a checklist whose next step is Add your first client.
    expect(agencySignupReleaseEnabled()).toBe(true);
    const facts: AgencyOnboardingFacts = { agency: { id: AGENCY, name: "Door Agency", role: "owner" }, members: 2, pendingInvitations: 0, clients: 0,
      effects: AGENCY_EFFECTS.map((effect) => ({ effect, verified: false, recordedAt: null })) };
    expect(deriveAgencyOnboarding(facts, { addClient: true }).next).toBe("first_client");

    // 2) Adding a client with the owner's address returns a copyable link and sends nothing.
    const rpc = vi.fn(async (name: string) => {
      if (name === "authorize_agency_client_add") return { data: "owner", error: null };
      if (name === "agency_add_client_enrolled") return { data: { additionId: ADDITION, agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, name: "Door Bakery", sourceKind: "url",
        sourceUrl: "https://door.example.test/", prospectId: null, factsSeeded: 0, seatId: ADDITION, addedBy: agencyActor.userId, addedAt: "2026-10-15T10:00:00Z", replayed: false }, error: null };
      if (name === "issue_agency_client_owner_claim") return { data: { claimId: ADDITION, customerWorkspaceId: CLIENT, workspaceName: "Door Bakery", recipientEmail: "owner@door.example.test",
        delivery, expiresAt: "2026-10-29T12:00:00Z", createdAt: "2026-10-15T12:00:00Z", replacedPending: false }, error: null };
      if (name === "accept_agency_client_owner_claim") return { data: { workspaceId: CLIENT, workspaceName: "Door Bakery", status: "accepted", alreadyAccepted: false }, error: null };
      return { data: null, error: { message: `unexpected ${name}` } };
    });
    const deps: AgencyClientDeps = {
      rpc, token: () => TOKEN, now: () => new Date(NOW),
      seed: async () => ({ scan: { status: "scanned", seeded: [], name: "Door Bakery", message: null }, facts: {} }),
      assess: vi.fn(async () => { throw new Error("assessment unavailable"); }),
    };
    const added = await addAgencyClient(agencyActor, { action: "add", agencyWorkspaceId: AGENCY, url: "https://door.example.test", ownerEmail: "owner@door.example.test", sendOwnerEmail: true, idempotencyKey: KEY }, deps);
    expect(added.ownerClaim?.claimPath).toMatch(/^\/workspace\/claim\/[A-Za-z0-9_-]{43}$/);
    expect(added.ownerClaim?.delivery.status).toBe("not_sent");
    expect(mail.send).not.toHaveBeenCalled();

    // 3) The Queue says so, in words, and carries no address or token.
    const waiting = await addAgencyClaimQueue(agencyActor, page(), { rpc: vi.fn(async () => ({ data: [addition()], error: null })) }, true, NOW);
    expect(waiting.queue[0]).toMatchObject({ kind: "owner_claim", title: "Claim not sent to Door Bakery", claimDelivery: "not_sent" });
    expect(JSON.stringify(waiting)).not.toContain("owner@door.example.test");
    expect(JSON.stringify(waiting)).not.toContain(TOKEN);

    // 4) The owner claims; the waiting item is gone.
    expect((await acceptOwnerClaim(ownerActor, TOKEN, deps)).status).toBe("accepted");
    const claimed = await addAgencyClaimQueue(agencyActor, page(), { rpc: vi.fn(async () => ({ data: [addition({ ownerClaimed: true })], error: null })) }, true, NOW);
    expect(claimed.queue.filter((item) => item.kind === "owner_claim")).toEqual([]);
    // Every client's owner column reads "Claimed" from the same read; the waiting one never does.
    expect(claimed.clients.find(client => client.workspaceId === CLIENT)).toMatchObject({ ownerClaimWaiting: false, ownerClaimed: true });
    expect(waiting.clients.find(client => client.workspaceId === CLIENT)?.ownerClaimed).toBeUndefined();

    // 5) After the owner decides, the agency reads the outcome in the client's Home.
    const html = renderToStaticMarkup(createElement(AgencyClientDecisionStatus, { businessName: "Door Bakery", workspaceId: CLIENT, onRetry: vi.fn(),
      state: { status: "ready", data: { workspaceId: CLIENT, decisions: [{ id: DECISION, title: "Make the Door Bakery website live", systemId: null, since: "2026-10-15T13:00:00Z", state: "approved" }], deliveries: [], changes: [], deliveryChecks: [] } } }));
    expect(html).toContain("Recently decided");
    expect(html).toContain("Approved by the business");

    expect(mail.send).not.toHaveBeenCalled();
  });
});
