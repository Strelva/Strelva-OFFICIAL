vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: vi.fn(async () => undefined), authorizeTenantOperatorRead: vi.fn(async () => undefined) }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ actor: vi.fn(), manage: vi.fn(), resolve: vi.fn(), tenant: vi.fn(), list: vi.fn(), access: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/workspaces/http", async original => ({ ...await original<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mock.actor }));
vi.mock("@/platform/agency-brand/server", async original => ({ ...await original<typeof import("@/platform/agency-brand/server")>(), manageAgencyBrand: mock.manage, resolveOwnerBrand: mock.resolve, resolveTenantBrand: mock.tenant, brandRpc: mock.rpc }));
vi.mock("@/platform/workspaces/repository", () => ({ listWorkspaces: mock.list }));
vi.mock("@/platform/infra/auth", () => ({ requireTenantAccess: mock.access }));
import { GET as getConfig, PUT } from "@/app/api/workspace/agency-brand/route";
import { GET as getOwnerBrand } from "@/app/api/workspace/owner-brand/route";
import { GET as getLogo } from "@/app/api/agency-brand/logo/[workspaceId]/[digest]/route";
import { AgencyBrandReplyToError, logoDigest, presentBrand } from "@/platform/agency-brand/server";
const id = "b2640000-0000-4000-8000-000000000010";
const input = { displayName: "Northside", accentColor: "#ffff00", replyTo: "reply@north.example", logo: null, credit: "runs_on_strelva" as const };
function put(brand: unknown = input, origin = "https://app.strelva.com") { return new Request("https://app.strelva.com/api/workspace/agency-brand", { method: "PUT", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ workspaceId: id, brand }) }); }
beforeEach(() => { vi.clearAllMocks(); mock.actor.mockResolvedValue({ userId: id, verifiedEmail: "owner@example.test" }); mock.manage.mockResolvedValue(input); mock.list.mockResolvedValue([{ id }]); mock.resolve.mockResolvedValue(presentBrand({ agencyId: id, name: "Agency", brand: input })); });
afterEach(() => vi.unstubAllEnvs());
describe("agency brand routes", () => {
  it("requires a verified sign-in and same-origin writes", async () => {
    expect((await PUT(put(input, "https://attacker.example"))).status).toBe(403);
    mock.actor.mockResolvedValue(null); expect((await PUT(put())).status).toBe(401); expect((await getConfig(new Request(`https://app.strelva.com/api/workspace/agency-brand?workspaceId=${id}`))).status).toBe(401);
    expect(mock.manage).not.toHaveBeenCalled();
  });
  it("writes validated settings and retains credit; invalid colors and logo bytes never write", async () => {
    expect((await PUT(put())).status).toBe(200); expect(mock.manage).toHaveBeenCalledWith({ userId: id, verifiedEmail: "owner@example.test" }, id, input); mock.manage.mockClear();
    for (const brand of [{ ...input, accentColor: "red" }, { ...input, credit: "hidden" }, { ...input, logo: { type: "image/png", data: btoa("<svg/>") } }]) expect((await PUT(put(brand))).status).toBe(400);
    expect(mock.manage).not.toHaveBeenCalled();
    const huge = new Request("https://app.strelva.com/api/workspace/agency-brand", { method: "PUT", headers: { origin: "https://app.strelva.com", "content-type": "application/json" }, body: "x".repeat(360001) });
    expect((await PUT(huge)).status).toBe(413);
  });
  it("returns a useful validation error for a reply address without current verified membership", async () => {
    mock.manage.mockRejectedValueOnce(new AgencyBrandReplyToError("Reply-to must be a verified email of a current agency member."));
    const response = await PUT(put());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Reply-to must be a verified email of a current agency member." });
  });
  it("checks resource access before resolving owner presentation", async () => {
    const request = new Request(`https://app.strelva.com/api/workspace/owner-brand?workspaceId=${id}`);
    mock.list.mockResolvedValue([]); expect((await getOwnerBrand(request)).status).toBe(403); expect(mock.resolve).not.toHaveBeenCalled();
    mock.list.mockResolvedValue([{ id }]); expect((await getOwnerBrand(request)).status).toBe(200);
  });
  it("serves only matching public raster logo hashes, with explicit type and nosniff", async () => {
    const logo = { type: "image/png" as const, data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mV8AAAAASUVORK5CYII=" };
    mock.rpc.mockResolvedValue({ agencyId: id, brand: { ...input, logo } });
    const request = new Request("https://app.strelva.com/api/agency-brand/logo");
    const res = await getLogo(request, { params: Promise.resolve({ workspaceId: id, digest: logoDigest(logo) }) });
    expect(res.status).toBe(200); expect(res.headers.get("Content-Type")).toBe("image/png"); expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff"); expect(Buffer.from(await res.arrayBuffer()).toString("base64")).toBe(logo.data);
    expect((await getLogo(request, { params: Promise.resolve({ workspaceId: id, digest: "0".repeat(64) }) })).status).toBe(404);
    mock.rpc.mockResolvedValue(null); expect((await getLogo(request, { params: Promise.resolve({ workspaceId: id, digest: logoDigest(logo) }) })).status).toBe(404);
  });
});
