import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/workspace/businesses/route";
const mocks = vi.hoisted(() => ({ enabled: true, actor: vi.fn(), list: vi.fn(), enter: vi.fn(), limit: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => mocks.enabled }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limit }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.list }));
vi.mock("@/platform/workspaces/business-entry", () => ({ enterCustomerBusiness: mocks.enter }));
vi.mock("@/platform/workspaces/http", async original => ({ ...await original<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mocks.actor }));
const id = "b9100000-0000-4000-8000-000000000001";
const actor = { userId: id, verifiedEmail: "owner@example.test" };
const crossSiteHeaders: Array<Record<string, string>> = [{ origin: "https://outside.example" }, { "sec-fetch-site": "cross-site" }];
function request(body = "{}", headers: Record<string,string> = {}) { return new Request("http://localhost/api/workspace/businesses", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...headers }, body }); }
beforeEach(() => { vi.clearAllMocks(); mocks.enabled=true; mocks.actor.mockResolvedValue(actor); mocks.list.mockResolvedValue([]); mocks.limit.mockResolvedValue(false); mocks.enter.mockResolvedValue({workspaceId:id,requestId:null,alreadyCreated:false}); });
describe("business setup HTTP boundary", () => {
  it("keeps both reads and writes closed before release", async()=>{mocks.enabled=false;expect((await GET()).status).toBe(503);expect((await POST(request())).status).toBe(503);expect(mocks.actor).not.toHaveBeenCalled();});
  it("requires a verified session for both entry points",async()=>{mocks.actor.mockResolvedValue(null);expect((await GET()).status).toBe(401);expect((await POST(request())).status).toBe(401);expect(mocks.enter).not.toHaveBeenCalled();});
  it("returns only explicitly manageable customer businesses",async()=>{mocks.list.mockResolvedValue([{id:"owner",name:"Own",kind:"customer",access:"member",role:"owner"},{id:"admin",name:"Admin",kind:"customer",access:"member",role:"admin"},{id:"staff",name:"Staff",kind:"customer",access:"member",role:"member"},{id:"shared",name:"Shared",kind:"customer",access:"delegated_read",role:"owner"},{id:"personal",name:"Personal",kind:"personal",access:"member",role:"owner"}]);const response=await GET();expect(await response.json()).toEqual({actorId:id,businesses:[{id:"owner",name:"Own"},{id:"admin",name:"Admin"}]});expect(response.headers.get("cache-control")).toContain("no-store");});
  it.each(crossSiteHeaders)("denies cross-site mutations before actor resolution",async headers=>{expect((await POST(request("{}",headers))).status).toBe(403);expect(mocks.actor).not.toHaveBeenCalled();});
  it("requires JSON",async()=>{expect((await POST(request("{}",{"content-type":"text/plain"}))).status).toBe(415);expect(mocks.enter).not.toHaveBeenCalled();});
  it.each(["not json",JSON.stringify({large:"x".repeat(16001)})])("bounds and validates request decoding",async raw=>{expect((await POST(request(raw))).status).toBe(400);expect(mocks.enter).not.toHaveBeenCalled();});
  it("throttles authenticated setup without writing",async()=>{mocks.limit.mockResolvedValue(true);expect((await POST(request())).status).toBe(429);expect(mocks.enter).not.toHaveBeenCalled();});
  it("passes the server actor rather than a browser-supplied actor",async()=>{const body={destination:{kind:"new",name:"Juniper"},initialRequest:null,idempotencyKey:id};expect((await POST(request(JSON.stringify(body)))).status).toBe(200);expect(mocks.enter).toHaveBeenCalledWith(actor,body);});
  it("fails closed and redacts backend details",async()=>{mocks.list.mockRejectedValue(new Error("private SQL detail"));const response=await GET();expect(response.status).toBe(503);expect(await response.text()).not.toContain("private SQL detail");});
});
