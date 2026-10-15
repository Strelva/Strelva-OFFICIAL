import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  actor: vi.fn(), released: vi.fn(() => true), isSuperAdmin: vi.fn(), operatorContext: vi.fn(),
  read: vi.fn(), set: vi.fn(), readOperator: vi.fn(), setOperator: vi.fn(), tenantWorkspace: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: m.released }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: m.isSuperAdmin, getActorContext: m.operatorContext }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: vi.fn() }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: m.tenantWorkspace }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: m.audit }));
vi.mock("@/platform/workspaces/http", async () => ({ ...(await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http")), workspaceHttpActor: m.actor }));
vi.mock("@/platform/ai-controls/service", () => ({ readAgencyAiControls: m.read, setAgencyAiControls: m.set, readOperatorAiControls: m.readOperator, setOperatorAiControls: m.setOperator }));

import { GET, POST } from "@/app/api/workspace/agency-ai-controls/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/tenants/[id]/ai-controls/route";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

const AGENCY = "26100000-0000-4000-8000-000000000020";
const WS = "26100000-0000-4000-8000-000000000010";
const actor = { userId: "26100000-0000-4000-8000-000000000003", verifiedEmail: "agency@example.test" };
const url = "http://localhost:3000/api/workspace/agency-ai-controls";
const body = { agencyWorkspaceId: AGENCY, workspaceId: WS, paused: true, monthlyCapCents: null, reviewAutoPost: "held", expectedRevision: 0, reason: "Owner asked us to pause" };
const post = (value: unknown, origin = "http://localhost:3000") => new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) });
const params = { params: Promise.resolve({ id: "harbor" }) };
const adminPostRequest = (value: unknown) => new Request("http://localhost:3000/api/admin/tenants/harbor/ai-controls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
const { agencyWorkspaceId: _agency, ...operatorBody } = body;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_AI_CONTROLS_RELEASE", "1");
  m.released.mockReturnValue(true);
  m.audit.mockResolvedValue({});
  m.actor.mockResolvedValue(actor);
  m.isSuperAdmin.mockResolvedValue(true);
  m.operatorContext.mockResolvedValue({ userId: "op", email: "op@example.test", type: "super_admin", isSuperAdmin: true });
  m.tenantWorkspace.mockResolvedValue(WS);
  const controls = { paused: false, monthlyCapCents: null, reviewAutoPost: "client_choice", revision: 0, setBy: null, changedAt: null };
  m.read.mockResolvedValue({ agencyWorkspaceId: AGENCY, canChange: true, clients: [] });
  m.set.mockResolvedValue({ agencyWorkspaceId: AGENCY, canChange: true, clients: [] });
  m.readOperator.mockResolvedValue({ budget: { controls } });
  m.setOperator.mockResolvedValue({ budget: { controls } });
});

describe("agency usage controls route", () => {
  it("answers 503 with the flag off, before reading anything", async () => {
    vi.stubEnv("STRELVA_AI_CONTROLS_RELEASE", "");
    expect((await GET(new Request(url))).status).toBe(503);
    expect((await POST(post(body))).status).toBe(503);
    expect(m.read).not.toHaveBeenCalled();
    expect(m.set).not.toHaveBeenCalled();
  });

  it("needs a signed-in actor and passes only the session actor and exact scope", async () => {
    m.actor.mockResolvedValue(null);
    expect((await GET(new Request(url))).status).toBe(401);
    m.actor.mockResolvedValue(actor);
    const response = await GET(new Request(`${url}?agencyWorkspaceId=${AGENCY}&workspaceId=${WS}`));
    expect(response.status).toBe(200);
    expect(m.read).toHaveBeenCalledWith(actor, { agencyWorkspaceId: AGENCY, workspaceId: WS });
    expect(await response.json()).toMatchObject({ budgetEnforced: false });
  });

  it("rejects cross-origin writes, injected fields and bad bodies", async () => {
    expect((await POST(post(body, "https://untrusted.example"))).status).toBe(403);
    expect((await POST(post({ ...body, actorId: "x" }))).status).toBe(400);
    expect((await POST(post({ ...body, reason: "no" }))).status).toBe(400);
    expect((await POST(post({ ...body, monthlyCapCents: -1 }))).status).toBe(400);
    expect(m.set).not.toHaveBeenCalled();
  });

  it("does not swallow a revoked seat or a revision conflict", async () => {
    m.set.mockRejectedValue(new WorkspaceAccessError());
    expect((await POST(post(body))).status).toBe(403);
    m.set.mockRejectedValue(new WorkspaceConflictError("These controls changed since you opened them. Refresh, then save again."));
    expect((await POST(post(body))).status).toBe(409);
  });
});

describe("operator usage controls route", () => {
  it("answers 503 with the flag off and 403 for a non-operator", async () => {
    m.isSuperAdmin.mockResolvedValue(false);
    expect((await adminGet(new Request("http://localhost/x"), params)).status).toBe(403);
    expect((await adminPost(adminPostRequest(operatorBody), params)).status).toBe(403);
    m.isSuperAdmin.mockResolvedValue(true);
    vi.stubEnv("STRELVA_AI_CONTROLS_RELEASE", "");
    expect((await adminGet(new Request("http://localhost/x"), params)).status).toBe(503);
    expect((await adminPost(adminPostRequest(operatorBody), params)).status).toBe(503);
  });

  it("answers 404 for an unlinked tenant", async () => {
    m.tenantWorkspace.mockResolvedValue(null);
    expect((await adminGet(new Request("http://localhost/x"), params)).status).toBe(404);
    expect((await adminPost(adminPostRequest(operatorBody), params)).status).toBe(404);
  });

  it("400s a bad body or a workspace that is not the tenant's, 409s a conflict, and audits a write", async () => {
    expect((await adminPost(adminPostRequest({ ...operatorBody, reason: "x" }), params)).status).toBe(400);
    expect((await adminPost(adminPostRequest({ ...operatorBody, workspaceId: AGENCY }), params)).status).toBe(400);
    m.setOperator.mockRejectedValueOnce(new WorkspaceConflictError("These controls changed since you opened them. Refresh, then save again."));
    expect((await adminPost(adminPostRequest(operatorBody), params)).status).toBe(409);
    expect((await adminPost(adminPostRequest(operatorBody), params)).status).toBe(200);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.ai_controls", metadata: expect.objectContaining({ reason: body.reason }) }));
  });
});
