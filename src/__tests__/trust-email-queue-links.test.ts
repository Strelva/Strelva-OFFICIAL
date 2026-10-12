import { expect, it, vi } from "vitest";
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({}) }));
vi.mock("@/lib/events", () => ({ getEventsRaw: async () => [{ id: "draft", tenantId: "fixture", type: "content_update", status: "pending", title: "Client draft", createdAt: "2026-10-12T00:00:00Z" }] }));
import { readEventKinds } from "@/server/operator-queue/sources";
const workspaceId = "cc000000-0000-4000-8000-000000000003";
it("opens linked client drafts in ordinary workspace authority, without an operator approval destination", async () => {
  const sources = await readEventKinds([{ id: "fixture" }], { links: [{ tenantId: "fixture", tenantStableId: "cc000000-0000-4000-8000-000000000004", workspaceId, workspaceName: "Fixture business", systemId: null }], businesses: [], delegations: [], documentHealth: [], operators: [], marks: [], readbackFailures: [] });
  expect(sources[0]).toMatchObject({ source: "Client drafts", ok: true, rows: [{ workspaceId, href: `/workspace?workspaceId=${workspaceId}` }] });
});
it("keeps unlinked client drafts as support inspection instead of opening bulk operator approval", async () => {
  const sources = await readEventKinds([{ id: "fixture" }], null);
  expect(sources[0]).toMatchObject({ ok: true, rows: [{ workspaceId: null, href: "/admin/clients/fixture#needs-you" }] });
});
