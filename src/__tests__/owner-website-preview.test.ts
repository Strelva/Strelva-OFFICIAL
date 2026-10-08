import { load } from "cheerio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signWorkspaceApproveToken } from "@/lib/approve-link";
import { ownerWebsitePreviewHref, ownerWebsitePreviewResponse } from "@/app/api/owner-website-preview/preview";
import { websiteDocumentCopyItems, websiteDocumentItem } from "@/platform/needs-you/sources/website-document";
import { websiteRebuildSchema, type WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import { siteDocumentSchema, siteDocumentHash } from "@/products/websites/site-document";
import { needsYouMemoryStore } from "./support/needs-you-memory";

const WS = "b6000000-0000-4000-8000-000000000001";
const WORK = "b6000000-0000-4000-8000-000000000002";
const EMAIL = "owner@example.test";
const LONG_COPY = `${"A complete sentence. ".repeat(70)}<script>untrusted text</script>`;
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc }) }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const flag of ["STRELVA_WORKSPACE_RELEASE", "STRELVA_OWNER_ENTRY", "STRELVA_NEEDS_YOU_RELEASE",
    "STRELVA_OWNER_DECISION_LINKS_RELEASE", "STRELVA_WEBSITE_REBUILD_RELEASE"]) vi.stubEnv(flag, "1");
  vi.stubEnv("APPROVE_LINK_SECRET", "fictional-preview-secret");
});
afterEach(() => vi.unstubAllEnvs());

async function fixture(stage: "copy" | "approve" | "launch" = "copy") {
  const document = siteDocumentSchema.parse({ version: 2, siteName: "Fictional Firm", theme: { palette: "light", typeScale: "standard" },
    pages: [{ path: "/", title: "Firm", description: "", root: "root" }, { path: "/about", title: "About", description: "", root: "root" }],
    nodes: {
      root: { id: "root", type: "Section", variant: "container", props: {}, children: ["nav", "hero", "contact"], factIds: [] },
      nav: { id: "nav", type: "Header", variant: "logo-left", props: { brand: "Firm", links: [{ label: "About", href: "/about?token=untrusted&revision=999" }] }, children: [], factIds: [] },
      hero: { id: "hero", type: "Hero", variant: "split", props: { title: "Firm", body: LONG_COPY,
        cta: { label: "External", href: "https://external.example.test" }, image: "photo" },
        children: [], factIds: [], verification: { supported: stage !== "copy", confidence: stage === "copy" ? 0.5 : 1, needsReview: stage === "copy" } },
      contact: { id: "contact", type: "InquiryForm", variant: "inline", props: { title: "Contact us" }, children: [], factIds: [] },
    }, facts: {}, assets: { photo: { url: "https://fictional.public.blob.vercel-storage.com/photo.png", alt: "Fictional photo" } }, redirects: [], provenance: { composer: "rules" },
  });
  const record: WebsiteRebuildRecord = { workId: WORK, workspaceId: WS, rebuild: websiteRebuildSchema.parse({
    version: 2, revision: 4, title: "Firm", input: { requestId: "fictional-request", description: "A firm website", businessName: "Firm" },
    status: stage === "launch" ? "approved" : "review_ready", stages: [], checkpoint: null,
    candidate: { revision: 2, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${WORK}/preview` },
    approvedCandidateRevision: stage === "launch" ? 2 : null, tenantId: null, launch: { receipt: null, readBack: null },
    lastError: null, createdBy: WORK, createdAt: "2026-10-07T14:00:00Z", history: [],
  }) };
  const proposed = stage === "copy" ? websiteDocumentCopyItems(record)[0]! : websiteDocumentItem(record)!;
  const mem = needsYouMemoryStore({ clock: { now: Date.now() } });
  const item = await mem.store.open(WS, proposed);
  const claims = { workspaceId: WS, itemId: item.id, recipient: EMAIL, revision: item.revisionHash, action: "approve" as const };
  const token = signWorkspaceApproveToken(claims);
  const read = vi.fn(async () => ({ item, record }));
  const flag = vi.fn(async (_name: string, _workspaceId: string) => true);
  const request = (extra = "") => new Request(`https://app.example.test${ownerWebsitePreviewHref(token)}${extra}`);
  return { item, record, token, claims, read, flag, request, mem };
}

describe("signed read-only owner website preview", () => {
  it.each(["copy", "approve", "launch"] as const)("renders the exact %s preview without account, session, decision or provider writes", async stage => {
    const s = await fixture(stage);
    rpc.mockResolvedValue({ data: { item: s.item, record: s.record }, error: null });
    const response = await ownerWebsitePreviewResponse(s.request(), { flag: s.flag });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("read_owner_decision_website_preview", {
      p_workspace_id: WS, p_decision_id: s.item.id, p_revision_hash: s.item.revisionHash, p_recipient: EMAIL,
    });
    expect(s.item.state).toBe("open");
    const html = load(await response.text());
    expect(html("script,form[action],[data-strelva-capability]")).toHaveLength(0);
    expect(html("button:not([disabled]),input:not([disabled]),textarea:not([disabled])")).toHaveLength(0);
    expect(html("a[href^='https:']")).toHaveLength(0);
    expect(html("body").text()).toContain(LONG_COPY);
    expect(html("a[href^='/api/approve']").text()).toBe("Return to your decision");
    if (stage === "copy") {
      expect(html("details").text()).toContain(LONG_COPY);
      expect(html("details").text()).toContain("https://external.example.test");
    }
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(html("meta[name=referrer]").attr("content")).toBe("no-referrer");
    expect(html("img").attr("referrerpolicy")).toBe("no-referrer");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'none'");
  });

  it("retains the signed token and exact candidate on internal page navigation", async () => {
    const s = await fixture();
    const response = await ownerWebsitePreviewResponse(s.request(), s);
    const html = load(await response.text());
    const about = new URL(html("a").filter((_i, el) => html(el).text() === "About").attr("href")!, "https://app.example.test");
    expect(about.pathname).toBe("/api/owner-website-preview");
    expect(about.searchParams.get("token")).toBe(s.token);
    expect(about.searchParams.get("revision")).toBe("2");
    expect(about.searchParams.get("page")).toBe("/about");
    expect((await ownerWebsitePreviewResponse(new Request(about), s)).status).toBe(200);
  });

  it.each(["STRELVA_WORKSPACE_RELEASE", "STRELVA_OWNER_ENTRY", "STRELVA_NEEDS_YOU_RELEASE", "STRELVA_OWNER_DECISION_LINKS_RELEASE", "STRELVA_WEBSITE_REBUILD_RELEASE"])("%s off does nothing before token, flag or database lookup", async name => {
    const s = await fixture();
    for (const value of [undefined, "0"]) {
      vi.stubEnv(name, value);
      expect((await ownerWebsitePreviewResponse(s.request(), s)).status).toBe(404);
    }
    expect(s.flag).not.toHaveBeenCalled();
    expect(s.read).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["owner_entry", "owner_decision_links", "website_rebuild"])("refuses %s row-off before the preview RPC", async name => {
    const s = await fixture();
    s.flag.mockImplementation(async flag => flag !== name);
    expect((await ownerWebsitePreviewResponse(s.request(), s)).status).toBe(404);
    expect(s.read).not.toHaveBeenCalled();
  });

  it("refuses tampered and expired tokens without looking up their claims", async () => {
    const s = await fixture();
    for (const token of [`${s.token}broken`, signWorkspaceApproveToken(s.claims, Date.now() - 15 * 86400000)]) {
      expect((await ownerWebsitePreviewResponse(new Request(`https://app.example.test${ownerWebsitePreviewHref(token)}`), s)).status).toBe(404);
    }
    expect(s.flag).not.toHaveBeenCalled();
    expect(s.read).not.toHaveBeenCalled();
  });

  it.each(["recipient", "database"])("refuses %s failures without rendering private copy", async () => {
    const s = await fixture();
    s.read.mockRejectedValueOnce(new Error("owner_preview_unavailable"));
    const response = await ownerWebsitePreviewResponse(s.request(), s);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(LONG_COPY);
  });

  it.each(["revision", "candidate", "workspace", "state", "expiry", "source", "signin"])("refuses changed %s before disclosing document", async change => {
    const s = await fixture();
    if (change === "revision") s.record.rebuild.revision += 1;
    if (change === "candidate") s.record.rebuild.candidate!.document.nodes.hero!.props = { title: "Changed" };
    if (change === "workspace") s.record.workspaceId = WORK;
    if (change === "state") s.item.state = "approved";
    if (change === "expiry") s.item.expiresAt = new Date(Date.now() - 1).toISOString();
    if (change === "source") s.item.sourceLifecycle = "service_request";
    if (change === "signin") s.item.signInRequired = true;
    const response = await ownerWebsitePreviewResponse(s.request(), s);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(LONG_COPY);
  });

  it("unknown pages and path traversal never fall through to another route", async () => {
    const s = await fixture();
    for (const page of ["/unknown", "/../admin", "//external.example.test"]) {
      expect((await ownerWebsitePreviewResponse(s.request(`&page=${encodeURIComponent(page)}`), s)).status).toBe(404);
    }
  });
});
