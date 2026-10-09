import { createPreviewRequest } from "@/experience/workspace/preview/fixture";
import { fixtureSiteDocument } from "@/experience/websites/rebuild-fixture";
import { websiteRebuildSchema } from "@/products/websites/rebuild-contracts";
import type { WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";

export const BUSINESS = "33333333-3333-4333-8333-333333333333";
export const WORK = "61000000-0000-4000-8000-000000000001";
export const SYSTEM = "61000000-0000-4000-8000-000000000002";
export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
export const source = (id = WORK): WorkspaceWork => ({ id, workspaceId: BUSINESS, productId: "websites", resourceKind: "website", website: { version: 2 }, title: "Fictional website", payload: null, input: {}, createdAt: "2026-10-09T12:00:00Z" });
export function envelope(id = WORK, revision = 1) {
  const document = structuredClone(fixtureSiteDocument);
  if (revision > 1) document.facts.sensitive!.origin = "owner_confirmed";
  return { workId: id, workspaceId: BUSINESS, rebuild: websiteRebuildSchema.parse({
    version: 2, revision, title: "Fictional website", input: { requestId: "fictional-source", url: "https://example.test" },
    status: "review_ready", stages: [], checkpoint: null,
    candidate: { revision, contentHash: (revision > 1 ? "b" : "a").repeat(64), document, previewHref: `/api/websites/${id}/preview` },
    approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null,
    createdBy: "fictional-owner", createdAt: "2026-10-09T12:00:00Z", history: [],
  }) };
}
/** Closed fictional responses for DOM and disposable browser proof; no provider or native authority. */
export async function createOpenedWorkFixture(command: () => Promise<Response>, read?: (id: string) => Promise<Response>, readOnly = false) {
  const preview = createPreviewRequest("business");
  const state = await (await preview(`/api/workspace?workspaceId=${BUSINESS}`)).json() as WorkspaceSnapshot;
  state.work = [source()]; state.releases = { systems: true, websiteRebuild: false };
  state.workspaces = [{ id: BUSINESS, name: "Fictional business", kind: "customer", role: "owner", access: readOnly ? "delegated_read" : "member" }];
  state.systems = { status: "ready", systems: [{ ref: { businessId: BUSINESS, systemId: SYSTEM }, name: "Fictional website", kind: "website", lifecycle: "draft", basis: null, savedWorkId: WORK, tenantId: null, health: { status: "unknown", summary: "Fictional fixture", lastVerifiedAt: null } }], connections: [], possibilities: [] };
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input), "http://fictional.invalid");
    if (url.pathname === "/api/workspace") return json(state);
    if (init?.method === "POST" && url.pathname.includes("/facts/")) return command();
    if (/^\/api\/websites\/[^/]+\/rebuild$/.test(url.pathname)) { const id = url.pathname.split("/")[3]!; return read ? read(id) : json(envelope(id)); }
    if (url.pathname === `/api/websites/${WORK}/history`) return json({ history: [] });
    return json({ error: "Outside this fictional proof." }, 503);
  };
  return { state, request };
}
