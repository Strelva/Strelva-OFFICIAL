/** Dry run by default. See docs/capabilities/website/website-rebuild-benchmark.md before paid use. */
import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import * as cheerio from "cheerio";
import {
  blindBenchmarkMapping, runRebuildBenchmark, validateBenchmarkLimits,
  crawlWebsite, extractBusinessFacts, normalizeRebuildUrl, renderSiteDocumentHtml,
  makeJevComposer, makeJevVerifier, makeModelComposer,
  createAiRebuildWriter, siteDocumentHash, auditRebuildHtml,
  type CrawlResult, type BenchmarkProviderFactories,
} from "../src/products/websites/index";
import { computeVisibleText } from "../src/lib/audit/checks";

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
async function main() {
  const { values } = parseArgs({ options: {
    "allow-paid-providers": { type: "boolean", default: false }, "max-calls": { type: "string" },
    "confirm-public-source": { type: "string" }, "source-url": { type: "string", default: "https://www.attymooney.com/" },
    "source-html": { type: "string" }, crawl: { type: "boolean", default: false },
    output: { type: "string" }, seed: { type: "string" }, help: { type: "boolean", default: false },
  } });
  if (values.help) { console.log("Dry run: pnpm exec tsx scripts/website-rebuild-benchmark.ts\nPaid use requires Jacob's explicit approval, existing provider keys, --allow-paid-providers --max-calls 12 --confirm-public-source https://www.attymooney.com/\nOptional --crawl, --source-url URL --source-html FILE, --output DIRECTORY, --seed PRIVATE_SEED. See docs/capabilities/website/website-rebuild-benchmark.md."); return; }
  const allowPaid = values["allow-paid-providers"]!;
  const maxCalls = values["max-calls"] === undefined ? undefined : Number(values["max-calls"]);
  validateBenchmarkLimits({ allowPaid, maxCalls });
  if (values.crawl && values["source-html"]) throw new Error("Choose cached --source-html or read-only --crawl.");
  const sourceUrl = normalizeRebuildUrl(values["source-url"]!);
  if (allowPaid && values["confirm-public-source"] !== sourceUrl) throw new Error("Paid use requires --confirm-public-source matching the exact public --source-url. This authorizes sharing only this public-source input.");
  if (allowPaid && (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !process.env.AI_GATEWAY_API_KEY)) throw new Error("Paid comparison requires existing Google and AI Gateway keys in the process environment. Keys are never accepted in CLI arguments or recorded.");
  const output = resolve(values.output ?? `output/website-rebuild-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  // Refuse to overwrite prior evidence. Blind judges only receive blind/.
  await mkdir(output, { recursive: false });
  const blind = join(output, "blind"); const privateOutput = join(output, "private");
  await mkdir(blind); await mkdir(privateOutput, { mode: 0o700 }); await chmod(privateOutput, 0o700);
  const measuredAt = new Date().toISOString(); let crawl: CrawlResult;
  if (values.crawl) crawl = await crawlWebsite(sourceUrl);
  else {
    const path = resolve(values["source-html"] ?? "output/website-rebuild-spike-2026-10-01/raw-source.html");
    const html = await readFile(path, "utf8");
    if (Buffer.byteLength(html) > 1_000_000) throw new Error("Cached source HTML exceeds the 1MB benchmark limit.");
    if (!values["source-html"]) {
      const receipt = JSON.parse(await readFile(resolve("output/website-rebuild-spike-2026-10-01/runtime-audit-inputs.json"), "utf8"));
      if (receipt.source.url !== sourceUrl || receipt.source.sha256 !== sha256(html)) throw new Error("Cached source provenance does not match its measurement receipt.");
    }
    const $ = cheerio.load(html);
    const page = { url: sourceUrl, sourceId: `${sourceUrl}#sha256=${sha256(html)}`, html, visibleText: computeVisibleText($), title: $("title").first().text().trim(), headings: $("h1,h2,h3").map((_, element) => $(element).text().trim()).get(), links: [], assets: [] };
    crawl = { pages: [page], skipped: [], assets: [], crawledAt: measuredAt, bytes: Buffer.byteLength(html), elapsedMs: 0, limited: false };
  }
  const facts = extractBusinessFacts({ url: sourceUrl }, crawl);
  const factories: BenchmarkProviderFactories | undefined = allowPaid ? {
    writer: admit => createAiRebuildWriter({ admit, maxOutputTokens: 8192 }),
    composer: (mode, admit) => mode === "jev" ? makeJevComposer({ apiKey: process.env.AI_GATEWAY_API_KEY!, admit }) : makeModelComposer({ admit }),
    verifier: (_mode, admit) => makeJevVerifier({ apiKey: process.env.AI_GATEWAY_API_KEY!, admit }),
  } : undefined;
  const began = performance.now();
  const result = await runRebuildBenchmark(facts, crawl, { allowPaid, maxCalls, maxInputBytes: 250_000 }, factories);
  const privateSeed = values.seed ?? randomBytes(32).toString("hex");
  const mapping = blindBenchmarkMapping(privateSeed);
  const articles: string[] = [];
  for (const [label, mode] of Object.entries(mapping)) {
    const lane = result.lanes.find(lane => lane.mode === mode)!;
    if (lane.document) {
      await writeFile(join(blind, `${label}.html`), renderSiteDocumentHtml(lane.document, "/", { preview: true }));
      articles.push(`<section><h2>Option ${label}</h2><p>${lane.status === "provider_failed" ? "Fallback result; intended comparison did not complete." : "Local website preview. Forms are disabled."}</p><iframe title="Option ${label}" src="${label}.html" sandbox="allow-scripts"></iframe></section>`);
      const laneOutput = join(privateOutput, mode); await mkdir(laneOutput);
      await writeFile(join(laneOutput, "site.json"), JSON.stringify(lane.document, null, 2), { mode: 0o600 });
      const plannedHtml = renderSiteDocumentHtml(lane.document, "/", { canonicalUrl: "https://benchmark.invalid" });
      await writeFile(join(laneOutput, "planned.html"), plannedHtml, { mode: 0o600 });
      await writeFile(join(laneOutput, "audit.json"), JSON.stringify({ scope: "html", ...auditRebuildHtml(plannedHtml, "https://benchmark.invalid"), documentHash: siteDocumentHash(lane.document), note: "HTML checks only; not design quality, provider accuracy, Lighthouse or a live published site." }, null, 2), { mode: 0o600 });
    } else articles.push(`<section><h2>Option ${label}</h2><p>Not executed or provider unavailable. This lane cannot be judged.</p></section>`);
  }
  await writeFile(join(blind, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind website rebuild comparison</title><style>body{font:16px system-ui;margin:0;background:#f6f4ee;color:#171b19}header{padding:24px;max-width:1000px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:12px}iframe{height:1100px;width:100%;border:1px solid #ccc;background:white}section{min-width:0}h2{font-size:18px}@media(max-width:1000px){main{grid-template-columns:1fr}}</style><header><h1>${escape(facts.name)}: blind website comparison</h1><p>${allowPaid ? "Opt-in provider run" : "Dry run: paid providers were not called"}. All executed lanes start with the same ${crawl.pages.length} public source page(s). Preview forms are disabled; nothing is published.</p><p>Judge readable copy, useful organization, visual quality and claims needing correction. Record your preference and reasons before opening the private provider key. Missing or fallback lanes do not establish a winner.</p><p><a href="judge-sheet.json" download>Save the unfilled judge sheet</a></p></header><main>${articles.join("")}</main></html>`);
  await writeFile(join(blind, "judge-sheet.json"), JSON.stringify({ instructions: "Independent human assessment. Fill this before viewing provider labels. Do not infer accuracy from agreement.", reviewer: "", reviewedAt: "", options: Object.keys(mapping).map(label => ({ label, readableCopy: null, usefulOrganization: null, visualQuality: null, claimsNeedingCorrection: [], comments: "" })), preferredOption: null, preferenceReason: "" }, null, 2));
  const evidence = { measuredAt, elapsedMs: Math.round(performance.now() - began), mode: result.mode, limits: { maxCalls: maxCalls ?? 0, maxProviderInputBytes: 250_000, writerMaxOutputTokens: 8192, modelCompositionMaxOutputTokens: 2048, jevMaxResponseBytes: 256000 }, admittedCalls: result.admittedCalls, actualCostUsd: result.actualCostUsd, costNote: allowPaid ? "Actual dollar cost unknown. Call cap is enforced; no dollar budget or estimated cost is claimed." : "Zero provider calls; zero model cost. Paid quality remains unmeasured.", source: { acquisition: values.crawl ? "bounded_public_crawl" : "cached_public_html", url: sourceUrl, pages: crawl.pages.map(page => ({ url: page.url, sourceId: page.sourceId, bytes: Buffer.byteLength(page.html), sha256: sha256(page.html) })), facts: Object.keys(facts.facts).length }, calls: result.calls, lanes: result.lanes.map(({ document, ...lane }) => ({ ...lane, ...(document ? { documentHash: siteDocumentHash(document) } : {}) })), qualityJudgment: result.qualityJudgment, publication: "None. No tenant data, DB writes, media uploads, email, calendar writes or production deployment." };
  await writeFile(join(privateOutput, "provider-key.json"), JSON.stringify({ measuredAt, seed: privateSeed, mapping, note: "Keep separate from blind judges until they submit their assessment." }, null, 2), { mode: 0o600 });
  await writeFile(join(privateOutput, "evidence.json"), JSON.stringify(evidence, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ output, blindReview: join(blind, "index.html"), mode: result.mode, admittedCalls: result.admittedCalls, actualCostUsd: result.actualCostUsd, note: "Serve only the blind/ directory to judges. The private/ directory contains provider labels and provenance." }));
  if (allowPaid && result.lanes.some(lane => lane.status === "provider_failed")) process.exitCode = 1;
}
main().catch(() => { console.error("Benchmark stopped. Check arguments, public-source provenance, call limits and existing provider configuration. Provider error bodies and credentials are not printed."); process.exitCode = 1; });
