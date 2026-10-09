// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RebuildExperience, flaggedFacts } from "@/experience/websites/RebuildExperience";
import { fixtureRebuild, fixtureSiteDocument, mooneyFixtureDocument } from "@/experience/websites/rebuild-fixture";
import { serverRebuildTransport, parseRebuildView, rebuildViewSchema, type RebuildTransport } from "@/experience/websites/rebuild-transport";
import { siteDocumentHash } from "@/products/websites/site-document";
import { WebsiteExperience } from "@/experience/websites/WebsiteExperience";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });
async function mount(element: ReturnType<typeof createElement>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(element); });
}
function button(name: string) { return Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === name)!; }
describe("website rebuild review", () => {
  it("keeps skipped source paths and their reasons visible after checkpoints are pruned", async () => {
    const record = fixtureRebuild();
    const skippedPaths = [{ url: "https://attymooney.com/blocked", reason: "robots" as const }, { url: "https://attymooney.com/app", reason: "javascript_only" as const }, { url: "https://attymooney.com/missing", reason: "unreachable" as const }];
    const at = "2026-10-01T20:00:00.000Z";
    const view = parseRebuildView({ workId: record.workId, workspaceId: record.workspaceId, rebuild: { version: 2, revision: 1, title: record.title, input: { requestId: "skipped-request", url: "https://attymooney.com" }, status: "review_ready", stages: [], checkpoint: null, skippedPaths, candidate: { revision: 1, contentHash: "a".repeat(64), document: fixtureSiteDocument, previewHref: `/api/websites/${record.workId}/preview` }, approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null, createdBy: "owner", createdAt: at, history: [] } });
    expect(view.skippedPaths).toEqual(skippedPaths);
    await mount(createElement(RebuildExperience, { workspaceId: view.workspaceId, initialRecord: view }));
    const panel = container.querySelector('[aria-labelledby="rebuild-skipped-heading"]')!;
    expect(panel.textContent).toContain("robots.txt blocks");
    expect(panel.textContent).toContain("needs a browser");
    expect(panel.textContent).toContain("could not be opened");
    expect(panel.textContent).toContain("business description instead");
    for (const page of skippedPaths) expect(panel.textContent).toContain(page.url);
    expect(rebuildViewSchema.parse({ ...record, skippedPaths: undefined }).skippedPaths).toEqual([]);
  });
  it("blocks approval while a supported sensitive claim awaits confirmation", async () => {
    const record = fixtureRebuild();
    delete record.candidate!.facts.uncertain;
    const mutate = vi.fn(async () => record);
    const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate };
    await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
    expect(flaggedFacts(record)).toHaveLength(1);
    expect(button("Approve this preview").disabled).toBe(true);
    await act(async () => button("Confirm").click());
    expect(mutate).toHaveBeenCalledWith(record, "confirm", { factId: "sensitive" });
  });
  it("keeps failed decisions visible and disables read-only changes", async () => {
    const record = fixtureRebuild();
    const mutate = vi.fn(async () => { throw new Error("Revision conflict. Reload the saved website."); });
    const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate };
    await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
    await act(async () => button("Confirm").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Revision conflict");
    expect(container.textContent).toContain("2 decisions need you");
    await act(async () => root!.render(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport, readOnly: true })));
    expect(button("Confirm").disabled).toBe(true);
    expect(button("Edit").disabled).toBe(true);
  });
  it("preserves provider errors and reports unavailable measurements after publication", async () => {
    const record = fixtureRebuild("domain-error");
    const domain = rebuildViewSchema.shape.domain.parse(record.domain);
    expect(domain?.error).toContain("unexpected target");
    const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate: async () => record };
    await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(domain!.error);
    expect(container.textContent).toContain("Published, but readback failed.");
    expect(container.textContent).toContain("no real inquiry, booking or visibility measurements");
  });
  it("sends the exact candidate identity through fact corrections", async () => {
    const record = fixtureRebuild();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "Not permitted" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(serverRebuildTransport.mutate(record, "edit", { factId: "sensitive", text: "Owner correction" })).rejects.toThrow("Not permitted");
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/websites/${record.workId}/facts/sensitive`);
    expect(JSON.parse(String(init.body))).toEqual({ expectedRevision: record.revision, candidateRevision: record.candidate!.revision, candidateContentHash: record.candidate!.contentHash, action: "edit", text: "Owner correction" });
  });
  it("requires the exact rendered candidate hash before approval", async () => {
    const record = fixtureRebuild();
    record.candidate!.facts = {};
    await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record }));
    expect(button("Approve this preview").disabled).toBe(true);
    const frame = container.querySelector("iframe")!;
    const document = frame.contentDocument!;
    const meta = document.createElement("meta"); meta.setAttribute("name", "strelva-site-hash"); meta.setAttribute("content", "wrong-hash"); document.open(); document.write("<!doctype html><html><head></head><body></body></html>"); document.close(); document.head.append(meta);
    await act(async () => frame.dispatchEvent(new Event("load")));
    expect(button("Approve this preview").disabled).toBe(true);
    expect(container.textContent).toContain("The preview has not opened");
    meta.setAttribute("content", record.candidate!.contentHash);
    await act(async () => frame.dispatchEvent(new Event("load")));
    expect(button("Approve this preview").disabled).toBe(false);
  });
  it("shows the latest stage checkpoint and exports the exact candidate", async () => {
    const record = fixtureRebuild();
    const at = "2026-10-01T20:00:00.000Z";
    const view = parseRebuildView({ workId: record.workId, workspaceId: record.workspaceId, rebuild: { version: 2, revision: 1, title: record.title, input: { requestId: "test-request", url: "https://attymooney.com" }, status: "review_ready", stages: [{ stage: "crawl", status: "running", message: "Reading", at }, { stage: "crawl", status: "completed", message: "Read source pages", at }], checkpoint: null, candidate: { revision: 2, contentHash: "a".repeat(64), document: fixtureSiteDocument, previewHref: `/api/websites/${record.workId}/preview` }, approvedCandidateRevision: null, tenantId: null, launch: { receipt: { status: "published", receiptId: "earlier-publication", provider: "strelva", providerUrl: "https://example.test", evidence: "Earlier revision publication recorded", artifactHash: "b".repeat(64), candidateRevision: 1, publishedAt: at }, readBack: null }, lastError: null, createdBy: "owner", createdAt: at, history: [] } });
    expect(flaggedFacts(fixtureRebuild("mooney"))).toHaveLength(40);
    expect(fixtureRebuild("mooney").candidate?.contentHash).toBe(siteDocumentHash(mooneyFixtureDocument));
    expect(view.stages).toHaveLength(1);
    expect(view.stages[0]?.message).toBe("Read source pages");
    await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record }));
    const href = Array.from(container.querySelectorAll("a")).find(link => link.textContent?.includes("Export website"))!.href;
    const query = new URL(href).searchParams;
    expect(query.get("revision")).toBe("1");
    expect(query.get("contentHash")).toBe(record.candidate!.contentHash);
    const transport: RebuildTransport = { read: async () => view, start: async () => view, mutate: async () => view };
    await act(async () => root!.render(createElement(RebuildExperience, { key: "prior-publication", workspaceId: view.workspaceId, initialRecord: view, transport })));
    expect(view.status).toBe("review");
    expect(view.candidate?.revision).toBe(2);
    expect(container.textContent).toContain("Monthly website report");
    expect(container.textContent).toContain("Your website");
  });
  it("shows owner publication separately from operator domain authority on managed native work", async () => {
    const record = fixtureRebuild(); record.status = "approved"; record.approved = true; record.candidate!.facts = {};
    await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, managed: true }));
    expect(button("Publish approved website")).toBeUndefined();
    expect(button("Choose forms")).toBeUndefined();
    await act(async () => root!.render(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, managed: true, canPublish: true })));
    expect(button("Publish approved website").disabled).toBe(false);
    expect(button("Choose forms").disabled).toBe(false);
    expect(container.querySelector('input[placeholder="your-business.com"]')).toBeNull();
    await act(async () => root!.render(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, managed: true, canPublish: true, readOnly: true })));
    expect(button("Publish approved website").disabled).toBe(true);
    expect(button("Choose forms").disabled).toBe(true);
  });
  it("retains v1 creation while rebuild release is off", async () => {
    await mount(createElement(WebsiteExperience, { workspaceId: fixtureRebuild().workspaceId }));
    expect(container.textContent).toContain("Business name");
    expect(container.textContent).not.toContain("Your current website");
    await act(async () => root!.render(createElement(WebsiteExperience, { workspaceId: fixtureRebuild().workspaceId, rebuildEnabled: true })));
    expect(container.textContent).toContain("Your current website");
    expect(container.textContent).not.toContain("Audience");
  });
});
