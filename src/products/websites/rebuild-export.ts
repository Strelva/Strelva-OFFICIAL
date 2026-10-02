import { load } from "cheerio";
import { siteDocumentHash } from "./site-document";
import { buildSiteDocumentExport, renderSiteDocumentHtml } from "./site-export";
import { downloadWebsiteExportAssets } from "./site-media";
import { WebsiteCandidateMismatchError } from "./preview";
import type { WebsiteRebuildRecord } from "./rebuild-contracts";
import type { WebsiteLaunchReceipt } from "./contracts";

export function selectRebuildCandidate(record: WebsiteRebuildRecord, revision: number, contentHash: string) {
  const candidate = record.rebuild.candidate;
  if (!candidate || candidate.revision !== revision || candidate.contentHash !== contentHash || siteDocumentHash(candidate.document) !== contentHash) throw new WebsiteCandidateMismatchError("This preview changed. Reopen the current website revision.");
  return candidate;
}
export function renderRebuildPreview(record: WebsiteRebuildRecord, selection: { revision: number; contentHash: string; page?: string }, options: { previewHrefBase?: string } = {}) {
  const candidate = selectRebuildCandidate(record,selection.revision,selection.contentHash);
  const path = !selection.page || selection.page === "home" ? "/" : selection.page.startsWith("/") ? selection.page : `/${selection.page}`;
  const html = load(renderSiteDocumentHtml(candidate.document,path,{ preview: true }));
  const paths = new Set(candidate.document.pages.map(page => page.path));
  html("a[href]").each((_,element) => {
    const anchor = html(element); const href = anchor.attr("href") ?? "";
    if (!/^\/(?!\/)/.test(href)) return;
    const link = new URL(href,"https://preview.strelva.invalid");
    if (!paths.has(link.pathname)) return;
    // Navigation retains the exact private candidate even when a source link
    // includes tracking/query parameters. Source params cannot override it.
    const target=new URL(options.previewHrefBase ?? `/api/websites/${record.workId}/preview`,"https://preview.strelva.invalid");
    const query = new URLSearchParams(link.search);
    for(const [key,value] of target.searchParams)query.set(key,value);
    query.set("revision",String(candidate.revision)); query.set("contentHash",candidate.contentHash); query.set("page",link.pathname);
    anchor.attr("href",`${target.pathname}?${query}${link.hash}`);
  });
  return html.html();
}
const csv = (value: unknown) => { const raw = String(value ?? ""); const text = /^\s*[=+@-]/.test(raw) ? `'${raw}` : raw; return `"${text.replace(/"/g,'""')}"`; };
export function createWebsiteArchive(files: Array<{ path: string; bytes: Buffer }>): Uint8Array {
  const blocks: Buffer[] = []; const seen = new Set<string>(); let total = 0;
  for (const file of files) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(file.path) || file.path.startsWith("/") || file.path.split("/").some(part => !part || part === ".." || part === ".") || seen.has(file.path)) throw new WebsiteCandidateMismatchError("The export contains an unsafe or duplicate file path.");
    seen.add(file.path); total += file.bytes.length; if (total > 100*1024*1024) throw new WebsiteCandidateMismatchError("The export exceeds its archive limit.");
    let name = file.path; let prefix = "";
    if (Buffer.byteLength(name) > 100) { const split = name.lastIndexOf("/"); prefix = name.slice(0,split); name = name.slice(split+1); if (split < 0 || Buffer.byteLength(prefix)>155 || Buffer.byteLength(name)>100) throw new WebsiteCandidateMismatchError("An export path is too long."); }
    const header = Buffer.alloc(512); header.write(name,0,100,"utf8");
    const octal = (value: number,offset: number,length: number) => header.write(value.toString(8).padStart(length-1,"0")+"\0",offset,length,"ascii");
    octal(0o644,100,8);octal(0,108,8);octal(0,116,8);octal(file.bytes.length,124,12);octal(0,136,12);
    header.fill(32,148,156);header.write("0",156,1,"ascii");header.write("ustar\0",257,6,"ascii");header.write("00",263,2,"ascii");header.write(prefix,345,155,"utf8");
    header.write(header.reduce((sum,byte) => sum+byte,0).toString(8).padStart(6,"0")+"\0 ",148,8,"ascii");
    blocks.push(header,file.bytes,Buffer.alloc((512-file.bytes.length%512)%512));
  }
  blocks.push(Buffer.alloc(1024)); return new Uint8Array(Buffer.concat(blocks));
}
export async function exportRebuildCandidate(record: WebsiteRebuildRecord, selection: { revision: number; contentHash: string }, publishedReceipts?: WebsiteLaunchReceipt[]) {
  const candidate = selectRebuildCandidate(record,selection.revision,selection.contentHash);
  const assets = await downloadWebsiteExportAssets(candidate.document);
  const bundle = buildSiteDocumentExport(candidate.document,{ workspaceId: record.workspaceId, workId: record.workId, revision: candidate.revision, tenant: record.rebuild.tenantId ?? undefined, generatedAt: record.rebuild.createdAt, canonicalUrl: record.rebuild.launch.receipt?.status === "published" ? record.rebuild.launch.receipt.providerUrl : undefined, assetFiles: assets });
  if (bundle.contentHash !== candidate.contentHash) throw new WebsiteCandidateMismatchError("The export does not match the current document hash.");
  const files = [
    { path: "README.md", bytes: Buffer.from("# Your website export\n\nThe immutable document is site.json. Deploy the site/ directory as the web root.\nFor a local static preview, run: python3 -m http.server 8080 --directory site\nThen open http://localhost:8080. Opening individual HTML files from disk does not provide the web root needed by links and images.\n\nVisitor forms still use the named Strelva service while its published grants remain active. Credentials and calendar provider secrets are never exported. Connect a new form or booking backend before retiring that service.\nThe document hash appears in each generated page as strelva-site-hash; file hashes are in site/export-manifest.json.\n") },
    { path: "site.json", bytes: Buffer.from(JSON.stringify(candidate.document,null,2)+"\n") },
    ...bundle.files.map(file => ({ path: `site/${file.path}`, bytes: Buffer.from(file.content) })),
    ...bundle.binaryFiles.map(file => ({ path: `site/${file.path}`, bytes: Buffer.from(file.base64,"base64") })),
    ...bundle.binaryFiles.map(file => ({ path: file.path, bytes: Buffer.from(file.base64,"base64") })),
    { path: "facts.csv", bytes: Buffer.from("id,text,kind,origin,highRisk,sources\n"+Object.entries(candidate.document.facts).map(([id,fact]) => [id,fact.text,fact.kind,fact.origin,fact.highRisk,JSON.stringify(fact.sources)].map(csv).join(",")).join("\n")+"\n") },
    { path: "redirects.csv", bytes: Buffer.from("from,to\n"+candidate.document.redirects.map(redirect => [redirect.from,redirect.to].map(csv).join(",")).join("\n")+"\n") },
    { path: "receipts.json", bytes: Buffer.from(JSON.stringify(publishedReceipts ?? (record.rebuild.launch.receipt ? [record.rebuild.launch.receipt] : []),null,2)+"\n") },
  ];
  return createWebsiteArchive(files);
}
