import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "cheerio";
import { afterEach, describe, expect, it, vi } from "vitest";
const download = vi.hoisted(() => vi.fn());
vi.mock("@/products/websites/site-media", () => ({ downloadWebsiteExportAssets: download }));
import { createWebsiteArchive, exportRebuildCandidate, renderRebuildPreview, selectRebuildCandidate } from "@/products/websites/rebuild-export";
import { siteDocumentHash, siteDocumentSchema } from "@/products/websites/site-document";
import { websiteRebuildSchema, type WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";

const workId = "22222222-2222-4222-8222-222222222222";
function record(): WebsiteRebuildRecord {
  const document = siteDocumentSchema.parse({ version: 2, siteName: "[Business name]", theme: { palette: "light", typeScale: "standard" }, pages: [{ path: "/", title: "Home", description: "Our services", root: "root" }, { path: "/about", title: "About", description: "Our story", root: "about" }], nodes: { root: { id: "root", type: "Section", variant: "container", props: {}, children: ["nav", "hero", "inquiry"] }, nav: { id: "nav", type: "Header", variant: "logo-left", props: { brand: "[Business name]", links: [{ label: "About", href: "/about#story" }, { label: "Tracked about", href: "/about?campaign=old-site&revision=999&contentHash=attacker#story" }, { label: "External", href: "https://source.example/about" }] } }, hero: { id: "hero", type: "Hero", variant: "statement", props: { title: "Our services", cta: { label: "About", href: "/about" } } }, inquiry: { id: "inquiry", type: "InquiryForm", variant: "inline", props: { title: "Contact us" } }, about: { id: "about", type: "PageHeader", variant: "standard", props: { title: "Our story" } } }, facts: { contact: { text: 'Office, "Buffalo"', kind: "contact", highRisk: false, origin: "owner_stated", sources: [] } }, assets: {}, redirects: [{ from: "/old.html", to: "/about" }], provenance: { composer: "rules" } });
  return { workId, workspaceId: "11111111-1111-4111-8111-111111111111", rebuild: websiteRebuildSchema.parse({ version: 2, revision: 4, title: "[Business name]", input: { requestId: "request-1234", businessName: "[Business name]", description: "Our services" }, status: "review_ready", stages: [], checkpoint: null, candidate: { revision: 3, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${workId}/preview` }, approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null, createdBy: "user", createdAt: "2026-10-01T00:00:00Z", history: [] }) };
}
const tar = (args: string[], encoding?: "utf8") => execFileSync("tar",args,{ env:{...process.env,LC_ALL:"C"}, ...(encoding ? {encoding} : {}) });
const directories: string[] = [];
function archivePath(bytes: Uint8Array): string { const directory = mkdtempSync(join(tmpdir(),"website-export-test-")); directories.push(directory); const path = join(directory,"website.tar"); writeFileSync(path,bytes); return path; }
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory,{ recursive: true, force: true }); download.mockReset(); });

describe("immutable website export and private preview", () => {
  it("exports the complete supplied publication history without replacing earlier receipts", async () => {
    const value = record(); const candidate = value.rebuild.candidate!;
    download.mockResolvedValue([]);
    const receipts = [1,2].map(revision => ({status:"published" as const,provider:"strelva-hosted",receiptId:`publication-${revision}`,providerUrl:"https://example.strelva.com/",artifactHash:candidate.contentHash,candidateRevision:revision,publishedAt:"2026-10-01T12:00:00Z",evidence:"Committed publication"}));
    const path = archivePath(await exportRebuildCandidate(value,{revision:3,contentHash:candidate.contentHash},receipts));
    expect(JSON.parse(String(tar(["-xOf",path,"receipts.json"],"utf8")))).toEqual(receipts);
  });
  it("keeps owner text exact in the document while neutralizing spreadsheet formulas in CSV", async () => {
    const value = record(); const candidate = value.rebuild.candidate!;
    candidate.document.facts.contact!.text = '=HYPERLINK("https://example.test","text")';
    candidate.contentHash = siteDocumentHash(candidate.document); download.mockResolvedValue([]);
    const path = archivePath(await exportRebuildCandidate(value,{revision:3,contentHash:candidate.contentHash}));
    expect(String(tar(["-xOf",path,"facts.csv"],"utf8"))).toContain('"\'=HYPERLINK(');
    expect(JSON.parse(String(tar(["-xOf",path,"site.json"],"utf8"))).facts.contact.text).toBe(candidate.document.facts.contact!.text);
  });
  it("blocks stale revision, stale hash and a modified document before media is read", async () => {
    const value = record(); const candidate = value.rebuild.candidate!;
    expect(() => selectRebuildCandidate(value,2,candidate.contentHash)).toThrow("preview changed");
    expect(() => selectRebuildCandidate(value,3,"a".repeat(64))).toThrow("preview changed");
    candidate.document.siteName = "Changed after approval";
    await expect(exportRebuildCandidate(value,{ revision:3, contentHash:candidate.contentHash })).rejects.toThrow("preview changed");
    expect(download).not.toHaveBeenCalled();
  });
  it("rewrites internal navigation to the exact private revision and preserves fragments", () => {
    const value = record(); const candidate = value.rebuild.candidate!;
    const html = load(renderRebuildPreview(value,{ revision:3, contentHash:candidate.contentHash }));
    const link = html('a').filter((_,element) => html(element).text() === "About").first().attr("href")!;
    const url = new URL(link,"https://app.strelva.com");
    expect(url.pathname).toBe(`/api/websites/${workId}/preview`);
    expect(url.searchParams.get("revision")).toBe("3"); expect(url.searchParams.get("contentHash")).toBe(candidate.contentHash); expect(url.searchParams.get("page")).toBe("/about"); expect(url.hash).toBe("#story");
    expect(html('a').filter((_,element) => html(element).text() === "External").attr("href")).toBe("https://source.example/about");
    const tracked = new URL(html("a").filter((_,element)=>html(element).text()==="Tracked about").attr("href")!,"https://app.strelva.com");
    expect(tracked.pathname).toBe(`/api/websites/${workId}/preview`); expect(tracked.searchParams.get("campaign")).toBe("old-site"); expect(tracked.searchParams.get("revision")).toBe("3"); expect(tracked.searchParams.get("contentHash")).toBe(candidate.contentHash); expect(tracked.hash).toBe("#story");
    expect(html('meta[name="strelva-site-hash"]').attr("content")).toBe(candidate.contentHash);
    expect(html('meta[name="robots"]').attr("content")).toBe("noindex,nofollow");
    expect(html('form').length).toBe(0); expect(html('script').length).toBe(0);
    expect(load(renderRebuildPreview(value,{ revision:3, contentHash:candidate.contentHash, page:"about" }))('h1').text()).toBe("Our story");
  });
  it("produces a standards-readable tar with valid checksum, padding and exact binary bytes", () => {
    const binary = Buffer.from([0,255,128,1,10,0,222]);
    const longPath = `site/${"a".repeat(80)}/${"b".repeat(40)}.png`;
    const archive = createWebsiteArchive([{ path:"index.html", bytes:Buffer.from("<h1>Website</h1>") }, { path:longPath, bytes:binary }]);
    expect(archive.length % 512).toBe(0);
    const header = Buffer.from(archive).subarray(0,512); const expectedChecksum = parseInt(header.subarray(148,156).toString("ascii"),8); const sumHeader = Buffer.from(header); sumHeader.fill(32,148,156);
    expect(sumHeader.reduce((sum,byte)=>sum+byte,0)).toBe(expectedChecksum);
    expect(Buffer.from(archive).subarray(-1024).every(byte=>byte===0)).toBe(true);
    const path = archivePath(archive);
    expect(String(tar(["-tf",path],"utf8")).trim().split("\n")).toEqual(["index.html",longPath]);
    expect(tar(["-xOf",path,longPath])).toEqual(binary);
  });
  it.each(["../secrets", "/absolute", "site/../secrets", "site/./index.html", "site//index.html", "site\\index.html", "site/", ""]) ("refuses unsafe archive path %s", (path) => expect(()=>createWebsiteArchive([{ path, bytes:Buffer.from("private") }])).toThrow("unsafe or duplicate"));
  it("rejects duplicate paths and names that cannot fit the tar contract", () => {
    expect(()=>createWebsiteArchive([{ path:"index.html",bytes:Buffer.alloc(0) },{ path:"index.html",bytes:Buffer.alloc(0) }])).toThrow("unsafe or duplicate");
    expect(()=>createWebsiteArchive([{ path:"a".repeat(101),bytes:Buffer.alloc(0) }])).toThrow("too long");
  });
  it("rejects an export above the 100 MiB archive budget before returning bytes", () => {
    const bytes = Buffer.allocUnsafe(64*1024*1024);
    expect(()=>createWebsiteArchive([{path:"first.bin",bytes},{path:"second.bin",bytes}])).toThrow("archive limit");
  });
  it("exports all pages, original evidence, image bytes and portable native capability runtime", async () => {
    const value = record(); const candidate = value.rebuild.candidate!;
    const image = Buffer.from([0,255,128,42,1]); const imageHash = createHash("sha256").update(image).digest("hex");
    candidate.document.assets.photo = { url:"https://example.public.blob.vercel-storage.com/media/example/photo.png", alt:"Office", contentHash:imageHash };
    candidate.document.nodes.hero!.props = { title:"Our services", image:"photo" };
    candidate.contentHash = siteDocumentHash(candidate.document); value.rebuild.tenantId = "example";
    download.mockResolvedValue([{ assetId:"photo",path:"assets/photo.png",content:image.toString("base64"),encoding:"base64" }]);
    const path = archivePath(await exportRebuildCandidate(value,{ revision:3, contentHash:candidate.contentHash }));
    const names = String(tar(["-tf",path],"utf8")).trim().split("\n");
    expect(names).toEqual(expect.arrayContaining(["README.md","site.json","site/index.html","site/about/index.html","site/assets/photo.png","facts.csv","redirects.csv","receipts.json","site/export-manifest.json","site/website-generation/site-lead-runtime.mjs"]));
    expect(tar(["-xOf",path,"site/assets/photo.png"])).toEqual(image);
    expect(JSON.parse(String(tar(["-xOf",path,"site.json"],"utf8")))).toEqual(candidate.document);
    const home = String(tar(["-xOf",path,"site/index.html"],"utf8"));
    expect(home).toContain(`name="strelva-site-hash" content="${candidate.contentHash}"`); expect(home).toContain('data-site-api-origin="https://example.strelva.com"');
    expect(String(tar(["-xOf",path,"facts.csv"],"utf8"))).toContain('"Office, ""Buffalo"""');
  });
});
