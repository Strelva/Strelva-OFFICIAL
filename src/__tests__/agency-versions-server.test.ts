import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VersionAccessError,
  VersionReleaseNeedsApprovalError,
  createInMemoryConnectionOwnership,
  createInMemoryVersionStore,
  createSystemVersions,
  createVersionReleaseGate,
  improvementPossibility,
  improvementState,
  type JsonObject,
  type VersionActor,
} from "@/platform/system-versions";
import { postgresHarness } from "./support/versions-postgres";

const deps = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string },
  clients: vi.fn(),
  library: vi.fn(),
  review: vi.fn(),
  limited: vi.fn(),
}));

vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
vi.mock("@/experience/workspace/agency-server", async (original) => ({
  ...(await original<typeof import("@/experience/workspace/agency-server")>()),
  readAgencyClientsPage: deps.clients,
  readAgencyLibrary: deps.library,
  reviewAllImprovements: deps.review,
}));

import { GET as getClients } from "@/app/api/workspace/agency-clients/route";
import { GET as getLibrary, POST as postLibrary } from "@/app/api/workspace/agency-library/route";

const AGENCY = "a0000000-0000-4000-8000-000000000020";
const ORIGIN = "http://localhost:3000";
const SOURCE = "a0000000-0000-4000-8000-0000000000c1";
const VERSION = "a0000000-0000-4000-8000-0000000000d1";

describe("agency routes", () => {
  beforeEach(() => {
    deps.user = { id: "11111111-1111-4111-8111-111111111111", email: "Ops@Example.test", email_confirmed_at: "2026-10-01" };
    deps.clients.mockReset().mockResolvedValue({ agencyWorkspaceId: AGENCY, clients: [], queue: [], team: [], total: 0, nextCursor: null, providersRead: false });
    deps.library.mockReset().mockResolvedValue({ agencyWorkspaceId: AGENCY, sources: [] });
    deps.review.mockReset().mockResolvedValue({ sourceSystemId: SOURCE, revision: 2, results: [] });
    deps.limited.mockReset().mockResolvedValue(false);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    (await import("@/platform/release-flags/store")).setReleaseFlagsDb(null);
  });

  it("under STRELVA_SYSTEMS_RELEASE=workspace, opens the library only for an agency whose row is on", async () => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "workspace");
    const OTHER = "a0000000-0000-4000-8000-0000000000e9";
    const { setReleaseFlagsDb } = await import("@/platform/release-flags/store");
    setReleaseFlagsDb({
      rpc: async (_name, args) => ({
        data: {
          workspaceId: args.p_workspace_id,
          flags: args.p_workspace_id === AGENCY ? { systems: { state: "on", revision: 1, changedAt: "2026-10-06T00:00:00Z" } } : {},
          testers: [], testerEmails: [],
        },
        error: null,
      }),
    });
    expect((await getLibrary(new Request(`${ORIGIN}/api/workspace/agency-library?workspaceId=${AGENCY}`))).status).toBe(200);
    expect((await getLibrary(new Request(`${ORIGIN}/api/workspace/agency-library?workspaceId=${OTHER}`))).status).toBe(503);
    const post = (workspaceId: string) => postLibrary(new Request(`${ORIGIN}/api/workspace/agency-library`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ action: "review_all", workspaceId, sourceSystemId: SOURCE, revision: 2, versionIds: [VERSION] }) }));
    expect((await post(OTHER)).status).toBe(503);
    expect(deps.review).not.toHaveBeenCalled();
    expect((await post(AGENCY)).status).toBe(200);
    expect(deps.library).toHaveBeenCalledTimes(1);
  });

  it("reads every client in one call under the signed-in actor", async () => {
    const response = await getClients(new Request(`${ORIGIN}/api/workspace/agency-clients?workspaceId=${AGENCY}`));
    expect(response.status).toBe(200);
    expect(deps.clients).toHaveBeenCalledTimes(1);
    expect(deps.clients).toHaveBeenCalledWith({ userId: deps.user!.id, verifiedEmail: "ops@example.test" }, AGENCY, null);
    await getClients(new Request(`${ORIGIN}/api/workspace/agency-clients?workspaceId=${AGENCY}&cursor=${SOURCE}`));
    expect(deps.clients).toHaveBeenLastCalledWith(expect.anything(), AGENCY, SOURCE);
  });

  it("refuses signed-out, malformed and forbidden reads", async () => {
    deps.user = null;
    expect((await getClients(new Request(`${ORIGIN}/api/workspace/agency-clients?workspaceId=${AGENCY}`))).status).toBe(401);
    deps.user = { id: "11111111-1111-4111-8111-111111111111", email: "ops@example.test", email_confirmed_at: "2026-10-01" };
    expect((await getClients(new Request(`${ORIGIN}/api/workspace/agency-clients?workspaceId=nope`))).status).toBe(400);
    expect((await getClients(new Request(`${ORIGIN}/api/workspace/agency-clients?workspaceId=${AGENCY}&cursor=x`))).status).toBe(400);
    deps.clients.mockRejectedValueOnce(new VersionAccessError());
    expect((await getClients(new Request(`${ORIGIN}/api/workspace/agency-clients?workspaceId=${AGENCY}`))).status).toBe(403);
    deps.limited.mockResolvedValueOnce(true);
    expect((await getClients(new Request(`${ORIGIN}/api/workspace/agency-clients?workspaceId=${AGENCY}`))).status).toBe(429);
  });

  it("keeps the library behind STRELVA_SYSTEMS_RELEASE", async () => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "");
    expect((await getLibrary(new Request(`${ORIGIN}/api/workspace/agency-library?workspaceId=${AGENCY}`))).status).toBe(503);
    const post = await postLibrary(new Request(`${ORIGIN}/api/workspace/agency-library`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ action: "review_all", workspaceId: AGENCY, sourceSystemId: SOURCE, revision: 2, versionIds: [VERSION] }) }));
    expect(post.status).toBe(503);
    expect(deps.library).not.toHaveBeenCalled();
    expect(deps.review).not.toHaveBeenCalled();
  });

  it("runs Review all only from the app's own origin, with a strict body", async () => {
    const body = { action: "review_all", workspaceId: AGENCY, sourceSystemId: SOURCE, revision: 2, versionIds: [VERSION] };
    const send = (headers: Record<string, string>, value: unknown = body) => postLibrary(new Request(`${ORIGIN}/api/workspace/agency-library`, {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(value) }));
    expect((await send({ origin: "https://evil.example" })).status).toBe(403);
    expect((await send({ origin: ORIGIN }, { ...body, force: true })).status).toBe(400);
    expect((await send({ origin: ORIGIN }, { ...body, versionIds: [] })).status).toBe(400);
    const ok = await send({ origin: ORIGIN });
    expect(ok.status).toBe(200);
    expect(deps.review).toHaveBeenCalledWith(expect.objectContaining({ verifiedEmail: "ops@example.test" }),
      { agencyWorkspaceId: AGENCY, sourceSystemId: SOURCE, revision: 2, versionIds: [VERSION] });
  });
});

const definition: JsonObject = { followUp: { message: "We will call you back soon." }, routing: { minutes: 30 } };

describe("improvements and the release gate", () => {
  async function setup() {
    const versions = createSystemVersions({ store: createInMemoryVersionStore(), connections: createInMemoryConnectionOwnership() });
    const agency: VersionActor = { userId: crypto.randomUUID(), memberships: [{ businessId: "agency", role: "owner" }] };
    const owner: VersionActor = { userId: crypto.randomUUID(), memberships: [{ businessId: "mooney", role: "owner" }] };
    const source = { businessId: "agency", systemId: "intake" };
    const v1 = await versions.publishSourceRevision(agency, { source, definition, summary: "Intake" });
    await versions.shareSource(agency, source, "mooney");
    let mooney = await versions.createVersion(owner, { source: v1.source, version: { businessId: "mooney", systemId: "inquiries" }, context: { kind: "agency_client", label: "The Mooney Firm" } });
    mooney = await versions.setOverride(owner, mooney.id, { path: "followUp.message", value: "We'll call you within one business day", expectedRowRevision: mooney.rowRevision });
    await versions.publishSourceRevision(agency, { source, definition: { followUp: { message: "A new default." }, routing: { minutes: 15 } }, summary: "Faster routing" });
    return { versions, owner, mooney };
  }

  it("turns a compare into the Library states and a Possibility with both values", async () => {
    const { versions, owner, mooney } = await setup();
    const offers = await versions.listAvailableImprovements(owner, mooney.id);
    expect(improvementState(offers, []).state).toBe("conflicts");
    expect(improvementState([], []).state).toBe("up_to_date");
    expect(improvementState(offers, [{ sourceRevision: 2, choice: "declined", reason: "Not now", by: "x", at: "2026-10-07T00:00:00.000Z" }]))
      .toMatchObject({ state: "declined", declinedReason: "Not now" });
    const possibility = improvementPossibility(mooney, offers[0]!, "Inquiry intake");
    expect(possibility).toMatchObject({ kind: "possibility", system: { businessId: "mooney", systemId: "inquiries" }, status: "exploring",
      makeReal: { kind: "version_release", versionId: mooney.id } });
    expect(possibility.conflicts).toEqual([{ path: "followUp.message", local: "We'll call you within one business day", upstream: "A new default.", reason: "overlapping_edit" }]);
    expect(possibility.title).toBe("Inquiry intake got an update. Bring it to The Mooney Firm?");
  });

  it("releases only with an approval for the exact row revision, and changes nothing without one", async () => {
    const { versions, owner, mooney } = await setup();
    const approvals = { approved: vi.fn(async () => null as { approvalId: string } | null) };
    const gate = createVersionReleaseGate({ versions, approvals });
    await expect(gate.release(owner, mooney.id, { expectedRowRevision: mooney.rowRevision })).rejects.toBeInstanceOf(VersionReleaseNeedsApprovalError);
    expect((await versions.readVersion(owner, mooney.id)).releases).toEqual([]);
    approvals.approved.mockResolvedValueOnce({ approvalId: "needs-you:1" });
    const released = await gate.release(owner, mooney.id, { expectedRowRevision: mooney.rowRevision });
    expect(released.approvalId).toBe("needs-you:1");
    expect(released.lineage.currentRelease).toBe(1);
    expect(approvals.approved).toHaveBeenLastCalledWith(owner, { businessId: "mooney", versionId: mooney.id, rowRevision: mooney.rowRevision });
  });
});

const PSQL = process.env.STRELVA_VERSIONS_PSQL;
describe.runIf(Boolean(PSQL))("Library and Review all on local PostgreSQL", () => {
  it("shows 2 ready, 1 conflict and 1 missing account, then prepares only the ready ones", async () => {
    const { readAgencyLibrary, reviewAllImprovements } = await vi.importActual<typeof import("@/experience/workspace/agency-server")>("@/experience/workspace/agency-server");
    const h = postgresHarness(PSQL!);
    const agency = await h.business("Strelva (fictional)", "agency");
    const clients = await Promise.all(["Harbor Dental", "Twin Trees", "The Mooney Firm", "Leslie Bookkeeping"].map((name) => h.business(name)));
    // Strelva's operator: owner of the agency, admin member of each converted client.
    const operator = await h.actor([{ businessId: agency, role: "owner" }, ...clients.map((businessId) => ({ businessId, role: "admin" as const }))]);
    const owners = await Promise.all(clients.map((businessId) => h.actor([{ businessId, role: "owner" }])));
    const source = await h.system(agency, "Inquiry intake");
    const versions = createSystemVersions({ store: h.store, connections: h.connections });
    const v1 = await versions.publishSourceRevision(operator, { source, definition, requires: { bindingKinds: ["booking_calendar"] }, summary: "Intake" });
    const ids: string[] = [];
    for (const [index, businessId] of clients.entries()) {
      await versions.shareSource(operator, source, businessId);
      let version = await versions.createVersion(owners[index]!, { source: v1.source, version: await h.system(businessId, "Inquiries"), context: { kind: "agency_client", label: `Client ${index}` } });
      if (index !== 3) version = await versions.bindAccount(owners[index]!, version.id, { kind: "booking_calendar", connectionId: await h.connection(businessId, "google"), expectedRowRevision: version.rowRevision });
      if (index === 2) version = await versions.setOverride(owners[index]!, version.id, { path: "followUp.message", value: "We'll call you within one business day", expectedRowRevision: version.rowRevision });
      ids.push(version.id);
    }
    await versions.publishSourceRevision(operator, { source, definition: { followUp: { message: "A new default." }, routing: { minutes: 15 } }, requires: { bindingKinds: ["booking_calendar"] }, summary: "Faster routing" });
    const actor = { userId: operator.userId, verifiedEmail: operator.verifiedEmail! };
    const library = await readAgencyLibrary(actor, agency, h.db!);
    expect(library.sources).toHaveLength(1);
    const states = Object.fromEntries(library.sources[0]!.versions.map((version) => [version.clientName, version.state]));
    expect(states).toEqual({ "Harbor Dental": "ready", "Twin Trees": "ready", "The Mooney Firm": "conflicts", "Leslie Bookkeeping": "missing_accounts" });
    const mooney = library.sources[0]!.versions.find((version) => version.clientName === "The Mooney Firm")!;
    expect(mooney.conflicts).toEqual([{ path: "followUp.message", local: "We'll call you within one business day", upstream: "A new default." }]);

    const review = await reviewAllImprovements(actor, { agencyWorkspaceId: agency, sourceSystemId: source.systemId, revision: 2, versionIds: ids }, h.db!);
    expect(Object.fromEntries(review.results.map((item) => [item.clientName, item.outcome]))).toEqual({
      "Harbor Dental": "prepared", "Twin Trees": "prepared", "The Mooney Firm": "skipped_conflicts", "Leslie Bookkeeping": "skipped_missing_accounts",
    });
    // Prepared means adopted into the working definition, not released.
    const harbor = await versions.readVersion(owners[0]!, ids[0]!);
    expect(harbor.baselineRevision).toBe(2);
    expect(harbor.currentRelease).toBeNull();
    expect((await versions.readVersion(owners[2]!, ids[2]!)).baselineRevision).toBe(1);
    // A stale revision is refused as a whole.
    await expect(reviewAllImprovements(actor, { agencyWorkspaceId: agency, sourceSystemId: source.systemId, revision: 1, versionIds: ids }, h.db!)).rejects.toThrow(/newer revision/);
    // Someone outside the agency reads nothing.
    await expect(readAgencyLibrary({ userId: owners[0]!.userId, verifiedEmail: owners[0]!.verifiedEmail! }, agency, h.db!)).rejects.toBeInstanceOf(VersionAccessError);
  });
});
