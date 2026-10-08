import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionAccessError, VersionStaleError } from "@/platform/system-versions";
const deps = vi.hoisted(() => ({ enabled: true, systems: true, scoped: true, actor: vi.fn(), create: vi.fn(), manage: vi.fn(), choices: vi.fn(), view: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => deps.enabled }));
vi.mock("@/platform/systems-release", () => ({ systemsReleaseMayBeOn: () => deps.systems, systemsReleasedFor: async () => deps.scoped }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: async () => false }));
vi.mock("@/platform/workspaces/http", async () => ({ ...(await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http")), workspaceHttpActor: deps.actor }));
vi.mock("@/experience/workspace/agency/version-server", () => ({ createBusinessVersion: deps.create, manageBusinessVersion: deps.manage, readVersionCreationChoices: deps.choices, readVersionManagement: deps.view }));
import { GET, POST } from "@/app/api/workspace/versions/manage/route";
const workspaceId = crypto.randomUUID(), systemId = crypto.randomUUID(), versionId = crypto.randomUUID(), agencyWorkspaceId = crypto.randomUUID();
const actor = { userId: crypto.randomUUID(), verifiedEmail: "version-manager@example.test" };
const command = { action: "override", workspaceId, systemId, versionId, rowRevision: 1, path: "title", value: "Local" };
function post(body: unknown, origin = "http://localhost:3000") { return new Request("http://localhost:3000/api/workspace/versions/manage", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); deps.enabled = true; deps.systems = true; deps.scoped = true; deps.actor.mockResolvedValue(actor); deps.manage.mockResolvedValue({ outcome: "saved", rowRevision: 2, receipt: null }); });
describe("Version management route boundaries", () => {
  it("keeps all new reads and writes out with flags off", async () => {
    deps.systems = false;
    expect((await POST(post(command))).status).toBe(503);
    expect((await GET(new Request(`http://localhost:3000/api/workspace/versions/manage?agencyWorkspaceId=${agencyWorkspaceId}`))).status).toBe(503);
    expect(deps.actor).not.toHaveBeenCalled(); expect(deps.manage).not.toHaveBeenCalled(); expect(deps.choices).not.toHaveBeenCalled();
  });
  it("refuses cross-origin, signed-out, unselected business and malformed requests before mutation", async () => {
    expect((await POST(post(command, "https://other.example"))).status).toBe(403);
    deps.actor.mockResolvedValueOnce(null); expect((await POST(post(command))).status).toBe(401);
    deps.scoped = false; expect((await POST(post(command))).status).toBe(503); deps.scoped = true;
    expect((await POST(post({ ...command, ownerApproval: true }))).status).toBe(400);
    expect(deps.manage).not.toHaveBeenCalled();
  });
  it("passes draft commands under the authenticated actor and keeps release out of this route", async () => {
    expect((await POST(post(command))).status).toBe(200);
    expect(deps.manage).toHaveBeenCalledWith(actor, command);
    expect((await POST(post({ ...command, action: "release" }))).status).toBe(400);
  });
  it("maps foreign access and stale writes honestly", async () => {
    deps.manage.mockRejectedValueOnce(new VersionAccessError()); expect((await POST(post(command))).status).toBe(403);
    deps.manage.mockRejectedValueOnce(new VersionStaleError()); expect((await POST(post(command))).status).toBe(409);
    deps.manage.mockRejectedValueOnce(new Error("store offline")); expect((await POST(post(command))).status).toBe(503);
  });
  it("requires a strict source/context creation command and both businesses released", async () => {
    const create = { action: "create", agencyWorkspaceId, workspaceId, source: { businessId: agencyWorkspaceId, systemId, revisionId: crypto.randomUUID(), number: 1 },
      context: { kind: "agency_client", label: "Client" }, name: "Client intake", commandId: crypto.randomUUID() };
    deps.create.mockResolvedValue({ outcome: "created", workspaceId, systemId, versionId, rowRevision: 1 });
    expect((await POST(post(create))).status).toBe(201); expect(deps.create).toHaveBeenCalledWith(actor, create);
    expect((await POST(post({ ...create, bindings: ["foreign"] }))).status).toBe(400);
  });
});
