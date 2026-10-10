import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), rate: vi.fn(), seed: vi.fn(), assess: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/products/agency-clients/seed", () => ({ seedFromSite: mocks.seed }));
vi.mock("@/products/ai-visibility/usecase", () => ({ runPrivateAiVisibilityAssessment: mocks.assess }));

import { POST as agencyClients } from "@/app/api/workspace/agency-clients/route";
import { GET as added } from "@/app/api/workspace/agency-clients/added/route";
import { GET as claimPreview, POST as claimAccept } from "@/app/api/workspace-claims/[token]/route";
import { isPublicRoute } from "@/proxy";
import { workspaceInvitationReturnTarget, workspaceReturnTarget } from "@/platform/workspaces/location";

const AGENCY = "a9100000-0000-4000-8000-000000000020";
const CLIENT = "a9100000-0000-4000-8000-000000000010";
const KEY = "a9100000-0000-4000-8000-0000000000c1";
const TOKEN = "k".repeat(43);
const ORIGIN = "https://app.strelva.com";

const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`${ORIGIN}${path}`, {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
});
const receipt = { additionId: "a9100000-0000-4000-8000-0000000000d1", agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, name: "Northside Bakery",
  sourceKind: "url", sourceUrl: "https://northside-bakery.example/", prospectId: null, factsSeeded: 2, seatId: "a9100000-0000-4000-8000-0000000000e1",
  addedBy: "a9100000-0000-4000-8000-000000000001", addedAt: "2026-10-07T12:00:00.000Z", replayed: false };
const claim = { claimId: "a9100000-0000-4000-8000-0000000000f1", customerWorkspaceId: CLIENT, workspaceName: "Northside Bakery", recipientEmail: "pat@northside-bakery.example",
  delivery: { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false }, expiresAt: "2026-10-21T12:00:00.000Z", createdAt: "2026-10-07T12:00:00.000Z", replacedPending: false };
const add = { action: "add", agencyWorkspaceId: AGENCY, url: "northside-bakery.example", ownerEmail: "pat@northside-bakery.example", idempotencyKey: KEY };

function answer(map: Record<string, { data?: unknown; error?: { message: string } }>) {
  mocks.rpc.mockImplementation(async (name: string) => ({ data: map[name]?.data ?? (name === "authorize_agency_client_add" ? "owner" : null), error: map[name]?.error ?? null }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_AGENCY_ADD_CLIENT_RELEASE", "1");
  mocks.session.mockResolvedValue({ id: "a9100000-0000-4000-8000-000000000001", email: "Owner@Agency.example.test", email_confirmed_at: "2026-10-07" });
  mocks.rate.mockResolvedValue(false);
  mocks.seed.mockResolvedValue({ scan: { status: "scanned", seeded: ["phone"], name: "Northside Bakery", message: null }, facts: { phone: { value: "(716) 555-0142" } } });
  mocks.assess.mockResolvedValue({ id: KEY, workspaceId: AGENCY, productId: "ai_visibility", resourceKind: "private_ai_visibility_work",
    payload: { business: "Northside Bakery", score: 70, grade: "C", verdict: "Readiness measured", topFix: "Add schema", signals: [],
      citation: { probed: false, mentioned: false, recommended: false, note: "Not run" }, privateSecret: "must-not-return" } });
  answer({ agency_add_client: { data: receipt }, issue_agency_client_owner_claim: { data: claim } });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/workspace/agency-clients", () => {
  it("is off by default and changes nothing", async () => {
    vi.stubEnv("STRELVA_AGENCY_ADD_CLIENT_RELEASE", "");
    const response = await agencyClients(post("/api/workspace/agency-clients", add));
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.seed).not.toHaveBeenCalled();
  });

  it("refuses a cross-site write and an unsigned request before reading anything", async () => {
    expect((await agencyClients(post("/api/workspace/agency-clients", add, { origin: "https://evil.example" }))).status).toBe(403);
    mocks.session.mockResolvedValue(null);
    expect((await agencyClients(post("/api/workspace/agency-clients", add))).status).toBe(401);
    mocks.session.mockResolvedValue({ id: "u", email: "x@example.test", email_confirmed_at: null });
    expect((await agencyClients(post("/api/workspace/agency-clients", add))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed input and an unknown action", async () => {
    expect((await agencyClients(post("/api/workspace/agency-clients", { ...add, idempotencyKey: "nope" }))).status).toBe(400);
    expect((await agencyClients(post("/api/workspace/agency-clients", { ...add, extra: true }))).status).toBe(400);
    expect((await agencyClients(post("/api/workspace/agency-clients", { action: "delete", agencyWorkspaceId: AGENCY }))).status).toBe(400);
    expect((await agencyClients(post("/api/workspace/agency-clients", { action: "add", agencyWorkspaceId: AGENCY, idempotencyKey: KEY }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("adds the client and returns the owner link once, not sent", async () => {
    const response = await agencyClients(post("/api/workspace/agency-clients", add));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.client).toMatchObject({ customerWorkspaceId: CLIENT, name: "Northside Bakery" });
    expect(body.ownerClaim).toMatchObject({ claimPath: expect.stringMatching(/^\/workspace\/claim\/[A-Za-z0-9_-]{43}$/), delivery: { status: "not_sent", reason: "gated" } });
    expect(body.website.connect).toBe(`/workspace/site?workspaceId=${CLIENT}&entry=connect`);
    expect(body.aiCheck).toMatchObject({ status: "ready", workId: KEY, href: `/workspace?workspaceId=${AGENCY}&work=${KEY}` });
    expect(JSON.stringify(body.aiCheck)).not.toContain("must-not-return");
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["authorize_agency_client_add", "agency_add_client", "issue_agency_client_owner_claim"]);
    expect(mocks.rpc.mock.calls[0]![1]).toMatchObject({ p_verified_email: "owner@agency.example.test" });
  });

  it("passes the database's refusal through with its status", async () => {
    answer({ agency_add_client: { error: { message: "agency_client_access_denied" } } });
    const denied = await agencyClients(post("/api/workspace/agency-clients", add));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: "Only an owner or admin of this agency can add clients.", code: "agency_client_access_denied" });
    answer({ agency_add_client: { error: { message: "agency_client_daily_limit" } } });
    expect((await agencyClients(post("/api/workspace/agency-clients", add))).status).toBe(429);
  });

  it("holds a person to a human pace", async () => {
    mocks.rate.mockResolvedValue(true);
    expect((await agencyClients(post("/api/workspace/agency-clients", add))).status).toBe(429);
    expect(mocks.rate).toHaveBeenCalledWith("workspace:agency-client-add:a9100000-0000-4000-8000-000000000001", 10, 60_000);
    expect(mocks.seed).not.toHaveBeenCalled();
  });

  it("issues or replaces an owner link for an added client", async () => {
    const response = await agencyClients(post("/api/workspace/agency-clients", { action: "owner_link", agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, ownerEmail: "pat@northside-bakery.example" }));
    expect(response.status).toBe(201);
    expect((await response.json()).ownerClaim.recipientEmail).toBe("pat@northside-bakery.example");
  });
});

describe("GET /api/workspace/agency-clients/added", () => {
  it("lists the agency's additions for a member and hides another agency's", async () => {
    answer({ list_agency_client_additions: { data: [{ ...receipt, ownerClaimed: false, seatActive: true, pendingClaim: null }] } });
    const response = await added(new Request(`${ORIGIN}/api/workspace/agency-clients/added?workspaceId=${AGENCY}`));
    expect(response.status).toBe(200);
    expect((await response.json()).clients).toHaveLength(1);
    answer({ list_agency_client_additions: { error: { message: "agency_client_access_denied" } } });
    const denied = await added(new Request(`${ORIGIN}/api/workspace/agency-clients/added?workspaceId=${AGENCY}`));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "This agency isn't available to your account." });
  });
});

describe("owner claim link routes", () => {
  const context = { params: Promise.resolve({ token: TOKEN }) };

  it("shows the claim terms to whoever holds the link, and nothing for a bad token", async () => {
    answer({ read_agency_client_owner_claim: { data: { workspaceName: "Northside Bakery", agencyName: "Northside Web", recipientEmail: "pat@northside-bakery.example", status: "pending", expiresAt: "2026-10-21T12:00:00.000Z" } } });
    mocks.session.mockResolvedValue(null);
    const response = await claimPreview(new Request(`${ORIGIN}/api/workspace-claims/${TOKEN}`), context);
    expect(response.status).toBe(200);
    expect((await response.json()).claim).toMatchObject({ agencyName: "Northside Web", status: "pending" });
    const bad = await claimPreview(new Request(`${ORIGIN}/api/workspace-claims/bad`), { params: Promise.resolve({ token: "bad" }) });
    expect(bad.status).toBe(404);
  });

  it("requires a signed-in verified account to accept, and maps replaced and wrong-account links", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await claimAccept(post(`/api/workspace-claims/${TOKEN}`, {}), context)).status).toBe(401);
    mocks.session.mockResolvedValue({ id: "a9100000-0000-4000-8000-000000000009", email: "pat@northside-bakery.example", email_confirmed_at: "2026-10-07" });
    answer({ accept_agency_client_owner_claim: { data: { workspaceId: CLIENT, workspaceName: "Northside Bakery", status: "accepted", alreadyAccepted: false } } });
    const accepted = await claimAccept(post(`/api/workspace-claims/${TOKEN}`, {}), context);
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).accepted.workspaceId).toBe(CLIENT);
    answer({ accept_agency_client_owner_claim: { data: { workspaceId: CLIENT, workspaceName: "Northside Bakery", status: "revoked", alreadyAccepted: false } } });
    expect((await claimAccept(post(`/api/workspace-claims/${TOKEN}`, {}), context)).status).toBe(410);
    answer({ accept_agency_client_owner_claim: { error: { message: "agency_client_claim_recipient_mismatch" } } });
    expect((await claimAccept(post(`/api/workspace-claims/${TOKEN}`, {}), context)).status).toBe(403);
    expect((await claimAccept(post(`/api/workspace-claims/${TOKEN}`, {}, { origin: "https://evil.example" }), context)).status).toBe(403);
  });

  it("is unavailable while the release is off", async () => {
    vi.stubEnv("STRELVA_AGENCY_ADD_CLIENT_RELEASE", "0");
    expect((await claimPreview(new Request(`${ORIGIN}/api/workspace-claims/${TOKEN}`), context)).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("is public only at the claim paths, and sign-in returns there", () => {
    const req = (pathname: string) => ({ nextUrl: { pathname } }) as unknown as NextRequest;
    expect(isPublicRoute(req(`/workspace/claim/${TOKEN}`))).toBe(true);
    expect(isPublicRoute(req(`/api/workspace-claims/${TOKEN}`))).toBe(true);
    expect(isPublicRoute(req("/api/workspace/agency-clients"))).toBe(false);
    expect(workspaceInvitationReturnTarget(`/workspace/claim/${TOKEN}`)).toBe(`/workspace/claim/${TOKEN}`);
    expect(workspaceInvitationReturnTarget(`/workspace/claim/${TOKEN}?x=1`)).toBeNull();
    expect(workspaceInvitationReturnTarget("//workspace/claim/" + TOKEN)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/agency/clients/new?workspaceId=${AGENCY}`)).toBe(`/workspace/agency/clients/new?workspaceId=${AGENCY}`);
    expect(workspaceReturnTarget(`/workspace/agency/clients/new?workspaceId=${AGENCY}&next=//evil.example`)).toBeNull();
  });
});
