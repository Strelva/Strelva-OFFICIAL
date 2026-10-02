/** Read-only public-source spike. No model calls, media uploads or publish.
 * pnpm exec tsx scripts/website-rebuild-spike.ts [https://attymooney.com] */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { runWebsiteRebuild } from "../src/products/websites/index";
import { siteDocumentHash } from "../src/products/websites/index";
import { buildSiteDocumentExport, renderSiteDocumentHtml } from "../src/products/websites/index";
import { fetchRebuildPage, sameCrawlDomain } from "../src/products/websites/index";
import { computeVisibleText } from "../src/lib/audit/checks";
import type { AuditContext } from "../src/lib/audit/context";
import { checkAiReadability } from "../src/lib/audit/modules/ai-readability";
import { checkSeoFoundations } from "../src/lib/audit/modules/seo-foundations";
import { checkAccessibility } from "../src/lib/audit/modules/accessibility";
import { checkTrust } from "../src/lib/audit/modules/trust";
import { checkContent } from "../src/lib/audit/modules/content";
import { generateWebsiteDraft, websiteDraftPreviewHtml } from "../src/products/websites/index";
import { auditRebuildHtml } from "../src/products/websites/index";

async function main() {
  const url = process.argv[2] ?? "https://attymooney.com";
  const output = resolve("output/website-rebuild-spike-2026-10-01");
  await mkdir(output, { recursive: true });
  const began = performance.now();
  const result = await runWebsiteRebuild({ url });
  const elapsedMs = Math.round(performance.now() - began);
  const description = result.content.pages[0]!.blocks.filter(block => block.type === "paragraph" && !block.factIds.includes(result.facts.nameFactId)).map(block => block.text).join(" ").slice(0, 3500);
  const baseline = await generateWebsiteDraft({ workspaceId: "local-spike", workId: "local-spike", revision: 1, brief: { businessName: result.document.siteName, description: description || result.document.siteName, primaryCallToAction: "Get in touch" } });
  const original = await fetchRebuildPage(result.document.provenance.sourceUrl!, { maxBytes: 8 * 1024 * 1024, timeoutMs: 15_000, allowUrl: target => sameCrawlDomain(url, target) });
  const origin = new URL(original.url).origin;
  const sourceFiles = await Promise.all(["robots.txt", "sitemap.xml", "llms.txt"].map(async path => { try { const response = await fetchRebuildPage(`${origin}/${path}`, { maxBytes: 1024 * 1024, timeoutMs: 6000, allowUrl: target => sameCrawlDomain(url, target) }); return response.status === 200 && !/text\/html/i.test(response.contentType) ? response.html : null; } catch { return null; } }));
  const canonicalUrl = "https://mooney.strelva.com";
  const exported = buildSiteDocumentExport(result.document, { workspaceId: "local-spike", workId: "local-spike", revision: 1, canonicalUrl });
  const audit = (html: string, targetUrl: string, robotsTxt: string | null, sitemapXml: string | null, llmsTxt: string | null) => {
    const $ = cheerio.load(html); const context: AuditContext = { html, $, url: targetUrl, visibleText: computeVisibleText($), fetchOk: true, headers: new Headers(), robotsTxt, sitemapXml, llmsTxt };
    return [checkAiReadability(context), checkSeoFoundations(context), checkAccessibility(context), checkTrust(context), checkContent(context)];
  };
  const plannedHtml = renderSiteDocumentHtml(result.document, "/", { canonicalUrl });
  const before = audit(original.html, original.url, sourceFiles[0] ?? null, sourceFiles[1] ?? null, sourceFiles[2] ?? null);
  const after = audit(plannedHtml, canonicalUrl, exported.files.find(file => file.path === "robots.txt")?.content ?? null, exported.files.find(file => file.path === "sitemap.xml")?.content ?? null, null);
  const audits = { scope: "Five canonical HTML audit modules against real source HTML and local static export. Generated well-known files are local export artifacts. No PageSpeed, Lighthouse, real traffic, live hosted fetch, AI assistant visibility, or security headers measured.", before, after, deltas: before.map(category => ({ category: category.name, before: category.score, after: after.find(item => item.slug === category.slug)!.score, delta: after.find(item => item.slug === category.slug)!.score - category.score })) };
  const runtimeAudit = { scope: "html" as const, before: auditRebuildHtml(original.html, original.url), after: auditRebuildHtml(plannedHtml, canonicalUrl), checkedAt: new Date().toISOString(), unavailable: ["Performance, real traffic and AI assistant mentions were not measured.", "HTML-only runtime checks do not fetch or verify robots.txt, sitemaps, DNS or security response headers."] };
  const auditInput = (artifact: string, html: string, targetUrl: string) => ({ artifact, url: targetUrl, bytes: Buffer.byteLength(html), sha256: createHash("sha256").update(html).digest("hex") });
  const runtimeAuditInputs = { checkedAt: runtimeAudit.checkedAt, source: auditInput("raw-source.html", original.html, original.url), planned: auditInput("planned.html", plannedHtml, canonicalUrl), documentHash: siteDocumentHash(result.document), note: "The source artifact preserves actual response HTML, including inert JSON-LD. The planned artifact is the non-preview static render with its proposed canonical. Neither preview catalog.html nor sanitized original.html was used for runtime scoring. The planned URL is not published." };
  const originalPreview = cheerio.load(original.html); originalPreview("script").remove(); originalPreview("head").prepend(`<base href="${origin}/">`); originalPreview("form,input,textarea,select,button").attr("disabled", "disabled"); originalPreview("form").attr("onsubmit", "return false");
  const evidence = {
    measuredAt: new Date().toISOString(), sourceUrl: url, finalSourceUrl: result.document.provenance.sourceUrl,
    elapsedMs, crawlerElapsedMs: result.crawl?.elapsedMs, htmlBytesRead: result.crawl?.bytes,
    checkpointBytes: Buffer.byteLength(JSON.stringify(result.checkpoint)), ...result.summary,
    factSupportMethod: "Exact fact quote + source HTML/text integrity; this is source support, not truth or independent semantic model verification.",
    supportedWithoutOwnerAction: Object.values(result.document.facts).filter(fact => fact.verification?.supported && !fact.highRisk).length,
    carriedOver: result.pageMapping, skipped: result.crawl?.skipped ?? [],
    composer: result.document.provenance.composer, writer: result.content.writer, modelCalls: 0, modelCostUsd: 0,
    jevComparison: "Not measured: no provider or paid-call authorization. Rules compose the catalog site.",
    images: "Source assets collected but omitted until authorized tenant-media rehosting; no hotlinking or writes.",
    production: "Not published. This is local source and static-render proof only.",
    documentHash: siteDocumentHash(result.document),
    audits,
    unresolved: Object.entries(result.document.facts).filter(([,fact]) => fact.highRisk || !fact.verification?.supported).map(([factId, fact]) => ({ factId, text: fact.text, highRisk: fact.highRisk, supported: fact.verification?.supported, sources: fact.sources })),
  };
  await writeFile(resolve(output, "site.json"), JSON.stringify(result.document, null, 2));
  await writeFile(resolve(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  await writeFile(resolve(output, "template.html"), websiteDraftPreviewHtml(baseline));
  await writeFile(resolve(output, "catalog.html"), renderSiteDocumentHtml(result.document, "/", { preview: true }));
  await writeFile(resolve(output, "original.html"), originalPreview.html());
  await writeFile(resolve(output, "audit.json"), JSON.stringify(audits, null, 2));
  await writeFile(resolve(output, "runtime-audit.json"), JSON.stringify(runtimeAudit, null, 2));
  await writeFile(resolve(output, "runtime-audit-inputs.json"), JSON.stringify(runtimeAuditInputs, null, 2));
  await writeFile(resolve(output, "raw-source.html"), original.html);
  await writeFile(resolve(output, "planned.html"), plannedHtml);
  for (const page of result.document.pages) { const directory = resolve(output, "catalog", page.path.replace(/^\//, "")); await mkdir(directory, { recursive: true }); await writeFile(resolve(directory, "index.html"), renderSiteDocumentHtml(result.document, page.path, { preview: true })); }
  await writeFile(resolve(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mooney rebuild source spike</title><style>body{margin:0;font:16px system-ui;background:#f5f4f0;color:#161816}header{padding:24px;max-width:1000px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:12px}iframe{width:100%;height:1000px;border:1px solid #ddd;background:white}h2{font-size:16px}a{color:inherit}@media(max-width:1100px){main{grid-template-columns:1fr}}</style><header><h1>The Mooney Firm rebuilt from its public website</h1><p>Read ${result.crawl?.pages.length ?? 0} pages and composed ${result.summary.pages} pages in ${elapsedMs} ms. ${result.summary.facts} sourced facts; ${result.summary.highRisk} high-risk claims need owner confirmation. This is a local read-only spike with zero model calls, no hosted images and no publication.</p><p><a href="evidence.json">Measured evidence</a> · <a href="audit.json">Audit findings</a> · <a href="site.json">Version 2 document</a></p></header><main><section><h2>A · Current website, static source snapshot</h2><iframe title="Current website snapshot" src="original.html" sandbox=""></iframe></section><section><h2>B · Existing template renderer, source-derived brief</h2><iframe title="Template baseline" src="template.html"></iframe></section><section><h2>C · Typed catalog renderer, deterministic composition</h2><iframe title="Catalog rebuild" src="catalog.html"></iframe></section></main></html>`);
  console.log(JSON.stringify({ output, elapsedMs, summary: result.summary, documentHash: evidence.documentHash }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Spike failed."); process.exitCode = 1; });
