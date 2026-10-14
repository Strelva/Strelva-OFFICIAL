import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), rate: vi.fn(), seed: vi.fn(), assess: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/products/agency-clients/seed", () => ({ seedFromSite: mocks.seed }));
vi.mock("@/products/ai-visibility/usecase", () => ({ runPrivateAiVisibilityAssessment: mocks.assess }));

import { POST } from "@/app/api/workspace/agency-clients/import/route";
import { clientImportIdempotencyKey } from "@/products/agency-clients/import-server";

const AGENCY = "c4000000-0000-4000-8000-000000000020";
const CLIENT = "c4000000-0000-4000-8000-000000000010";
const ORIGIN = "https://app.strelva.com";
const rows = [{ sourceRef: "name:corner plumbing", name: "Corner Plumbing", ownerEmail: "sam@corner.example", phone: "(716) 555-0199" }];
const post = (body: unknown, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/api/workspace/agency-clients/import`, {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
});
const limits = { agencyWorkspaceId: AGENCY, daily: 25, waitingForOwner: 100, raised: false, revision: 0, usedToday: 0, waiting: 0 };
const receipt = { additionId: "c4000000-0000-4000-8000-0000000000d1", agencyWorkspaceId: AGENCY, customerWorkspaceId: CLIENT, name: "Corner Plumbing",
  sourceKind: "url", sourceUrl: null, prospectId: null, factsSeeded: 2, seatId: null, addedBy: "c4000000-0000-4000-8000-000000000001", addedAt: "2026-10-12T12:00:00.000Z", replayed: false };
const claim = { claimId: "c4000000-0000-4000-8000-0000000000f1", customerWorkspaceId: CLIENT, workspaceName: "Corner Plumbing", recipientEmail: "sam@corner.example",
  delivery: { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false }, expiresAt: "2026-10-26T12:00:00.000Z", createdAt: "2026-10-12T12:00:00.000Z", replacedPending: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_AGENCY_ADD_CLIENT_RELEASE", "1");
  vi.stubEnv("STRELVA_AGENCY_IMPORT_RELEASE", "1");
  mocks.session.mockResolvedValue({ id: "c4000000-0000-4000-8000-000000000001", email: "Owner@Agency.example.test", email_confirmed_at: "2026-10-12" });
  mocks.rate.mockResolvedValue(false);
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "authorize_agency_client_add" ? "owner" : name === "agency_client_import_preview" ? { addedCommandIds: [], sameHost: [], limits }
      : name === "agency_add_client_enrolled" ? receipt : name === "issue_agency_client_owner_claim" ? claim : null,
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/workspace/agency-clients/import", () => {
  it.each([
    ["the import flag is off", { STRELVA_AGENCY_IMPORT_RELEASE: "0" }],
    ["the add-client release is off", { STRELVA_AGENCY_ADD_CLIENT_RELEASE: "0" }],
    ["the workspace release is off", { STRELVA_WORKSPACE_RELEASE: "0" }],
  ])("changes nothing when %s", async (_label, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const response = await POST(post({ action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows }));
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("refuses cross-site writes and signed-out callers before any read", async () => {
    expect((await POST(post({ action: "preview", agencyWorkspaceId: AGENCY, source: "sheet", rows }, { origin: "https://evil.example" }))).status).toBe(403);
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(post({ action: "preview", agencyWorkspaceId: AGENCY, source: "sheet", rows }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("previews without adding", async () => {
    const response = await POST(post({ action: "preview", agencyWorkspaceId: AGENCY, source: "sheet", rows }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ rows: [{ state: "ready" }], canAddToday: 1 });
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["agency_client_import_preview"]);
  });

  it("adds through the ordinary add with the row's import key, returning the claim link once and sending nothing", async () => {
    const response = await POST(post({ action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows[0]).toMatchObject({ state: "added", businessId: CLIENT });
    expect(body.rows[0].ownerClaimPath).toMatch(/^\/workspace\/claim\/[A-Za-z0-9_-]{43}$/);
    const add = mocks.rpc.mock.calls.find(([name]) => name === "agency_add_client_enrolled")![1];
    expect(add.p_command_id).toBe(clientImportIdempotencyKey(AGENCY, "sheet", "name:corner plumbing"));
    expect(add.p_input.facts).toEqual({ phone: { value: "(716) 555-0199" } });
    const issued = mocks.rpc.mock.calls.find(([name]) => name === "issue_agency_client_owner_claim")![1];
    expect(issued.p_recipient_email).toBe("sam@corner.example");
  });

  it("rejects an apply larger than one batch and unknown fields", async () => {
    const many = Array.from({ length: 4 }, (_, index) => ({ sourceRef: `name:${index}`, name: `Client ${index}` }));
    expect((await POST(post({ action: "apply", agencyWorkspaceId: AGENCY, source: "sheet", rows: many }))).status).toBe(400);
    expect((await POST(post({ action: "preview", agencyWorkspaceId: AGENCY, source: "sheet", rows: [{ ...rows[0], verified: true }] }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
