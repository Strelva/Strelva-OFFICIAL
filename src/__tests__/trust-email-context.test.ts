import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), db: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mock.db }));
import { resolveEmailBusinessContext } from "@/platform/infra/email/business-context";
const workspaceId = "cc000000-0000-4000-8000-000000000003";
const context = { workspaceId, tenantIds: ["fixture"], ownerAuthorship: "platform", businessName: "Lakeview Yoga", replyTo: "hello@lakeview.example", timeZone: "America/New_York" };
beforeEach(() => { vi.resetAllMocks(); mock.db.mockReturnValue({ rpc: mock.rpc }); mock.rpc.mockResolvedValue({ data: context, error: null }); });
it("uses one service-only read with both scopes bound", async () => {
  expect(await resolveEmailBusinessContext({ workspaceId, tenantId: "fixture" })).toEqual(context);
  expect(mock.rpc).toHaveBeenCalledWith("read_email_business_context", { p_workspace_id: workspaceId, p_tenant_id: "fixture" });
});
it("rejects mismatched workspaces, tenants and workspace aliases", async () => {
  expect(await resolveEmailBusinessContext({ workspaceId: "cc000000-0000-4000-8000-000000000004" })).toBeNull();
  expect(await resolveEmailBusinessContext({ tenantId: "another" })).toBeNull();
  expect(await resolveEmailBusinessContext({ tenantId: "workspace:cc000000-0000-4000-8000-000000000004" })).toBeNull();
});
it.each([null, {}, { ...context, ownerAuthorship: "unknown" }, { ...context, replyTo: "unverified" }, { ...context, businessName: "Bad\r\nName" }])("holds unavailable or malformed identity", async data => {
  mock.rpc.mockResolvedValue({ data, error: null }); expect(await resolveEmailBusinessContext({ workspaceId })).toBeNull();
});
it("holds absent storage, read errors and transport exceptions", async () => {
  mock.db.mockReturnValue(null); expect(await resolveEmailBusinessContext({ workspaceId })).toBeNull();
  mock.db.mockReturnValue({ rpc: mock.rpc }); mock.rpc.mockResolvedValue({ data: context, error: "unavailable" }); expect(await resolveEmailBusinessContext({ workspaceId })).toBeNull();
  mock.rpc.mockRejectedValue(new Error("unavailable")); expect(await resolveEmailBusinessContext({ workspaceId })).toBeNull();
});

it("accepts a positively read legacy tenant scope without inventing its business or agency", async () => {
  const legacy = { workspaceId: null, tenantIds: ["fixture"], ownerAuthorship: null, businessName: null, replyTo: null, timeZone: null };
  mock.rpc.mockResolvedValue({ data: legacy, error: null });
  expect(await resolveEmailBusinessContext({ tenantId: "fixture" })).toEqual(legacy);
});
