import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn(), save: vi.fn(), limited: vi.fn() }));
vi.mock("@/platform/workspaces/http", async original => ({ ...(await original<typeof import("@/platform/workspaces/http")>()), workspaceHttpActor: mocks.actor }));
vi.mock("@/app/workspace/business-details/native-website-facts", () => ({ createNativeWebsiteMappingService: () => ({ read: mocks.read, save: mocks.save }) }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limited }));
import { GET, POST } from "@/app/api/workspace/business-details/native-mapping/route";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
const actor = { userId: "7f000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const command = { workspaceId: "7f000000-0000-4000-8000-000000000010", tenantId: "gldf", revision: 0, mapping: { fields: ["display_name"], services: [] } };
const base = "https://app.example.test/api/workspace/business-details/native-mapping";
const request = (body: unknown = command, origin = "https://app.example.test") => new Request(base, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks();vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");vi.stubEnv("STRELVA_WEBSITE_NATIVE_FACTS_ENABLED", "1");mocks.actor.mockResolvedValue(actor);mocks.limited.mockResolvedValue(false); });
afterEach(() => vi.unstubAllEnvs());
describe("native mapping route", () => {
  it("passes exact scoped IDs, revision and mapping with verified session identity", async () => {
    mocks.save.mockResolvedValue({ mapping: { ...command.mapping, revision: 1 } });
    expect((await POST(request())).status).toBe(200);expect(mocks.save).toHaveBeenCalledExactlyOnceWith(actor,command.workspaceId,"gldf",0,command.mapping);
    mocks.read.mockResolvedValue({ mapping: command.mapping, nativeServices: [], businessServices: [] });
    expect((await GET(new Request(`${base}?workspaceId=${command.workspaceId}&tenantId=gldf`))).status).toBe(200);expect(mocks.read).toHaveBeenCalledExactlyOnceWith(actor,command.workspaceId,"gldf");
  });
  it("flags off performs no reads or writes", async () => {
    vi.stubEnv("STRELVA_WEBSITE_NATIVE_FACTS_ENABLED","0");expect((await POST(request())).status).toBe(503);expect((await GET(new Request(base))).status).toBe(503);expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("rejects unsafe input and surfaces authority/conflict failures honestly", async () => {
    expect((await POST(request(command,"https://attacker.example.test"))).status).toBe(403);
    expect((await POST(request({ ...command,mapping:{fields:["owner_recipient"],services:[]} }))).status).toBe(400);
    expect((await POST(request({ ...command,userId:actor.userId }))).status).toBe(400);expect(mocks.save).not.toHaveBeenCalled();
    mocks.save.mockRejectedValueOnce(new WorkspaceAccessError());expect((await POST(request())).status).toBe(403);
    mocks.save.mockRejectedValueOnce(new WorkspaceConflictError("Mapping changed. Reload."));expect((await POST(request())).status).toBe(409);
  });
});
