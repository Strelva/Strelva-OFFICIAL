import { describe, expect, it, vi } from "vitest";
import { crawlWebsite, robotsAllows, normalizeRebuildUrl, sameCrawlDomain, type PageFetcher } from "@/products/websites/rebuild-crawl";
import { runWebsiteRebuild, WebsiteRebuildStageError, validateWrittenContent, writeSourceContent, extractBusinessFacts, createAiRebuildWriter, websiteRebuildInputSchema } from "@/products/websites/rebuild-pipeline";
import { rebuildInputSchema } from "@/products/websites/rebuild-contracts";
import { composeRebuildSite, verifyRebuildSite, JevComposer, ModelComposer } from "@/products/websites/rebuild-composer";
import { unresolvedSiteFacts, siteDocumentSchema } from "@/products/websites/site-document";
const modelMocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("ai", () => ({ generateObject: modelMocks.generate }));
vi.mock("@/platform/infra/ai-models", () => ({ getPrimaryModel: () => ({ model: "primary", label: "primary" }), getFallbackModel: () => ({ model: "fallback", label: "fallback" }) }));

const home = `<!doctype html><html><head><title>The Mooney Firm | Buffalo</title><script type="application/ld+json">{"@type":"LegalService","name":"The Mooney Firm","telephone":"716-555-0100"}</script></head><body><header><a href="/">Home</a><a href="/practice/estate-planning">Estate planning</a><a href="/about">About</a><a href="/private">Private</a></header><main><h1>The Mooney Firm</h1><p>Personal counsel for your next chapter.</p><p>We help families prepare wills and trusts.</p><p>Our attorney has 20 years of experience.</p><a href="tel:716-555-0100">Call us</a><blockquote>They took time to explain every step.</blockquote></main></body></html>`;
const about = `<html><head><title>About | The Mooney Firm</title></head><body><main><h1>About the firm</h1><p>Meet with us to discuss your plans and questions.</p></main></body></html>`;
function fixture(robots = "User-agent: *\nDisallow: /private"): PageFetcher { return vi.fn(async (url) => ({ url, status: url.endsWith("/missing") ? 404 : 200, html: url.endsWith("/robots.txt") ? robots : url.endsWith("/about") ? about : home, contentType: url.endsWith("/robots.txt") ? "text/plain" : "text/html" })); }

describe("website rebuild pipeline", () => {
  it("rebuilds quoted business content with provenance and an honest review gate", async () => {
    const onCheckpoint = vi.fn(); const result = await runWebsiteRebuild({ url: "example.com" }, { fetchPage: fixture(), onCheckpoint });
    expect(siteDocumentSchema.safeParse(result.document).success).toBe(true);
    expect(result.document.siteName).toBe("The Mooney Firm"); expect(result.document.provenance.composer).toBe("rules");
    expect(result.document.pages.some((page) => page.path === "/contact")).toBe(true);
    expect(Object.values(result.document.nodes).some((node) => node.type === "InquiryForm")).toBe(true);
    expect(result.crawl?.skipped).toContainEqual({ url: "https://example.com/private", reason: "robots" });
    for (const fact of Object.values(result.document.facts)) { expect(fact.sources.length).toBeGreaterThan(0); expect(fact.sources[0]?.quote.length).toBeLessThanOrEqual(300); }
    expect(unresolvedSiteFacts(result.document).some((id) => result.document.facts[id]!.text.includes("20 years"))).toBe(true);
    expect(result.summary.supported).toBeGreaterThan(0); expect(onCheckpoint).toHaveBeenCalledTimes(5);
    expect(Buffer.byteLength(JSON.stringify(result.checkpoint))).toBeLessThan(1_500_000);
    expect(result.checkpoint.crawl?.pages.every((page) => page.html === "")).toBe(true);
  });
  it("supports description intake without any fetch or fabricated facts", async () => {
    const fetchPage = fixture(); const result = await runWebsiteRebuild({ businessName: "Mooney", description: "We help families prepare wills and trusts." }, { fetchPage });
    expect(fetchPage).not.toHaveBeenCalled(); expect(result.crawl).toBeUndefined(); expect(result.document.provenance.sourceUrl).toBeUndefined();
    expect(Object.values(result.document.facts).every((fact) => fact.origin === "owner_stated" && fact.sources.length === 0)).toBe(true);
  });
  it("accepts short owner descriptions allowed by the public intake contract", async () => {
    const input = { businessName: "Mooney", description: "Mediation" };
    expect(rebuildInputSchema.safeParse({ requestId: "short-description", ...input }).success).toBe(true);
    expect(websiteRebuildInputSchema.safeParse({ ...input, description: "X" }).success).toBe(true);
    const result = await runWebsiteRebuild(input, { fetchPage: fixture() });
    expect(Object.values(result.document.facts).map(fact => fact.text)).toEqual(expect.arrayContaining(["Mooney", "Mediation"]));
    expect(Object.values(result.document.facts).every(fact => fact.origin === "owner_stated")).toBe(true);
  });
  it("rejects descriptions above the public 4000-character limit before starting work", async () => {
    const input = { businessName: "Mooney", description: "X".repeat(4001) }; const onEvent = vi.fn(); const fetchPage = fixture();
    expect(rebuildInputSchema.safeParse({ requestId: "long-description", ...input }).success).toBe(false);
    await expect(runWebsiteRebuild(input, { onEvent, fetchPage })).rejects.toThrow();
    expect(onEvent).not.toHaveBeenCalled(); expect(fetchPage).not.toHaveBeenCalled();
  });
  it("keeps crawl and extraction when writing fails and resumes without fetching", async () => {
    const fetchPage = fixture(); let checkpoint;
    try { await runWebsiteRebuild({ url: "https://example.com" }, { fetchPage, writer: async () => { throw new Error("Writer unavailable"); } }); } catch (error) { expect(error).toBeInstanceOf(WebsiteRebuildStageError); checkpoint = (error as WebsiteRebuildStageError).checkpoint; }
    expect(checkpoint?.completedStages).toEqual(["crawl", "extract"]); expect(checkpoint?.facts).toBeDefined();
    const secondFetch = fixture(); const result = await runWebsiteRebuild({ url: "https://example.com" }, { checkpoint, fetchPage: secondFetch });
    expect(secondFetch).not.toHaveBeenCalled(); expect(result.checkpoint.completedStages).toEqual(["crawl", "extract", "write", "compose", "verify"]);
    await expect(runWebsiteRebuild({ url: "https://other.example" }, { checkpoint })).rejects.toThrow("another rebuild input");
  });
  it("saves full source HTML before compaction and stops on retention failure", async () => {
    const retained: string[] = []; const result = await runWebsiteRebuild({ url: "https://example.com" }, { fetchPage: fixture(), onSourcePage: page => { retained.push(page.html); } });
    expect(retained[0]).toBe(home); expect(result.checkpoint.crawl?.pages[0]?.html).toBe("");
    await expect(runWebsiteRebuild({ url: "https://example.com" }, { fetchPage: fixture(), onSourcePage: async () => { throw new Error("Store unavailable"); } })).rejects.toMatchObject({ stage: "crawl", message: "We couldn't save this website's source pages. Retry to continue." });
  });
  it("does not invent claims by attaching an unrelated fact ID", () => {
    const facts = extractBusinessFacts({ businessName: "Firm", description: "We help families prepare wills and trusts." }); const baseline = writeSourceContent(facts);
    const changed = structuredClone(baseline); changed.pages[0]!.blocks[0]!.text = "We guarantee 100% success for $500.";
    expect(() => validateWrittenContent({ pages: changed.pages }, facts, baseline)).toThrow();
    changed.pages[0]!.blocks[0]!.factIds = ["missing_fact"]; expect(() => validateWrittenContent({ pages: changed.pages }, facts, baseline)).toThrow("unknown fact");
  });
  it("falls back through invalid and low-confidence decisions without changing text", async () => {
    const facts = extractBusinessFacts({ businessName: "Firm", description: "We help families prepare wills and trusts." }); const content = writeSourceContent(facts);
    const jev = new JevComposer(async () => ({ confidence: 0.54, choices: {} })); const model = new ModelComposer(async () => { throw new Error("Model unavailable"); });
    const document = await composeRebuildSite(facts, content, undefined, [jev, model]); expect(document.provenance.composer).toBe("rules"); expect(document.siteName).toBe("Firm");
  });
  it("records the composer that returned valid typed decisions", async () => {
    const facts = extractBusinessFacts({ businessName: "Firm", description: "We help families prepare wills and trusts." });
    const document = await composeRebuildSite(facts, writeSourceContent(facts), undefined, [new JevComposer(async (questions) => ({ confidence: 0.8, choices: Object.fromEntries(questions.map((question) => [question.id, question.candidates[0]!])) }))]);
    expect(document.provenance.composer).toBe("jev");
  });
  it("uses cost admission and tries the configured writer fallback only once", async () => {
    const facts = extractBusinessFacts({ businessName: "Firm", description: "We help families prepare wills and trusts." }); const baseline = writeSourceContent(facts);
    modelMocks.generate.mockReset().mockRejectedValueOnce(new Error("Primary unavailable")).mockResolvedValueOnce({ object: { pages: baseline.pages } });
    const admitted: string[] = []; const admit = async <T,>(label: string, call: () => Promise<T>): Promise<T> => { admitted.push(label); return call(); };
    const writer = createAiRebuildWriter({ admit }); expect(modelMocks.generate).not.toHaveBeenCalled();
    expect(await writer(facts, baseline)).toEqual({ pages: baseline.pages }); expect(admitted).toEqual(["primary", "fallback"]); expect(modelMocks.generate).toHaveBeenCalledTimes(2);
  });
  it("times out Jev and uses the rule composer", async () => {
    vi.useFakeTimers();
    try { const facts = extractBusinessFacts({ businessName: "Firm", description: "We help families prepare wills and trusts." }); const pending = composeRebuildSite(facts, writeSourceContent(facts), undefined, [new JevComposer(async () => new Promise(() => {}))]); await vi.advanceTimersByTimeAsync(2001); expect((await pending).provenance.composer).toBe("rules"); }
    finally { vi.useRealTimers(); }
  });
  it("rehosts only through the injected media boundary and rejects old-site hotlinks", async () => {
    const source = fixture(); const rehostAssets = vi.fn(async () => ({ hero: { url: "/media/local/hero.webp", alt: "Office" } }));
    const result = await runWebsiteRebuild({ url: "https://example.com" }, { fetchPage: source, rehostAssets });
    expect(rehostAssets).toHaveBeenCalledOnce(); expect(result.document.assets.hero?.url).toBe("/media/local/hero.webp"); expect(Object.values(result.document.nodes).some(node => node.type === "Hero" && node.props.image === "hero")).toBe(true);
    await expect(runWebsiteRebuild({ url: "https://example.com" }, { fetchPage: fixture(), rehostAssets: async () => ({ hero: { url: "https://example.com/old.jpg", alt: "Office" } }) })).rejects.toMatchObject({ stage: "compose" });
  });
  it("keeps JSON-LD address provenance as actual individual quoted fields", async () => {
    const page = home.replace("</head>", `<script type="application/ld+json">{"@type":"PostalAddress","streetAddress":"17 Birdsong Parkway","addressLocality":"Orchard Park","addressRegion":"NY","postalCode":"14127"}</script></head>`);
    const fetchPage: PageFetcher = async url => ({ url, status: 200, contentType: url.endsWith("robots.txt") ? "text/plain" : "text/html", html: url.endsWith("robots.txt") ? "User-agent: *\nDisallow: /practice\nDisallow: /about\nDisallow: /private" : page });
    const result = await runWebsiteRebuild({ url: "https://example.com" }, { fetchPage }); const location = Object.values(result.document.facts).find(fact => fact.text === "17 Birdsong Parkway, Orchard Park, NY, 14127")!;
    expect(location.verification?.supported).toBe(true); expect(location.sources.map(source => source.quote)).toEqual(["17 Birdsong Parkway", "Orchard Park", "NY", "14127"]);
  });
  it("flags unsupported rewritten statements when checking is unavailable", async () => {
    const facts = extractBusinessFacts({ businessName: "Firm", description: "We help families prepare wills and trusts." }); const baseline = writeSourceContent(facts);
    const rewritten = structuredClone(baseline); rewritten.writer = "model"; rewritten.pages[0]!.blocks[1]!.text = "Our bespoke approach resolves every dispute.";
    const document = await verifyRebuildSite(await composeRebuildSite(facts, rewritten), facts, rewritten, async () => { throw new Error("Verifier unavailable"); });
    const originalId = rewritten.pages[0]!.blocks[1]!.factIds[0]!; expect(document.facts[originalId]!.verification?.supported).toBe(true);
    const reviewId = Object.keys(document.facts).find(id => id.startsWith("review_") && document.facts[id]?.text === "Our bespoke approach resolves every dispute.")!;
    expect(reviewId).toBeDefined(); expect(document.facts[reviewId]!.verification?.supported).toBe(false); expect(unresolvedSiteFacts(document)).toContain(reviewId);
    expect(Object.values(document.nodes).some(node => node.factIds.includes(originalId) && node.factIds.includes(reviewId))).toBe(true);
  });
});

describe("bounded safe website crawl", () => {
  it("normalizes URL input and rejects non-http and credentials", () => {
    expect(normalizeRebuildUrl("example.com/a#section")).toBe("https://example.com/a");
    expect(() => normalizeRebuildUrl("https://user:secret@example.com")).toThrow();
    expect(() => normalizeRebuildUrl("file:///etc/passwd")).toThrow();
    expect(() => normalizeRebuildUrl("https://example.com:8443")).toThrow();
    expect(sameCrawlDomain("https://a.co.uk", "https://b.co.uk")).toBe(false);
    expect(sameCrawlDomain("https://example.com", "https://www.example.com")).toBe(true);
  });
  it("applies specific robots groups, longest path and allow ties", () => {
    const policy = "User-agent: *\nDisallow: /\nUser-agent: StrelvaRebuild\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\n";
    expect(robotsAllows(policy, "https://example.com/")).toBe(true); expect(robotsAllows(policy, "https://example.com/private")).toBe(false); expect(robotsAllows(policy, "https://example.com/private/public")).toBe(true); expect(robotsAllows(policy, "https://example.com/guide.pdf")).toBe(false);
    expect(robotsAllows("User-agent: *\nAllow: /a\nDisallow: /a", "https://example.com/a")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /private", "https://example.com/%70rivate")).toBe(false);
  });
  it("never fetches a robots-blocked page", async () => {
    const fetchPage = fixture("User-agent: *\nDisallow: /"); await expect(crawlWebsite("https://example.com", { fetchPage })).rejects.toMatchObject({ code: "robots_blocked" });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
  it("stops at the configured page limit", async () => {
    const result = await crawlWebsite("https://example.com", { fetchPage: fixture(), maxPages: 1 }); expect(result.pages).toHaveLength(1); expect(result.limited).toBe(true); expect(result.skipped.some((skip) => skip.reason === "limit")).toBe(true);
  });
  it("reports JavaScript-only sites and unreachability", async () => {
    const js: PageFetcher = async (url) => ({ url, status: 200, contentType: url.endsWith("robots.txt") ? "text/plain" : "text/html", html: url.endsWith("robots.txt") ? "" : "<html><body><div id='root'></div><script></script><script></script><script></script></body></html>" });
    await expect(crawlWebsite("https://example.com", { fetchPage: js })).rejects.toMatchObject({ code: "javascript_only" });
    await expect(crawlWebsite("https://example.com", { fetchPage: async () => { throw new Error("Network failed"); } })).rejects.toMatchObject({ code: "unreachable" });
  });
  it("fails closed when robots is temporarily unavailable", async () => {
    const fetchPage: PageFetcher = vi.fn(async (url) => ({ url, status: 503, html: "", contentType: "text/plain" })); await expect(crawlWebsite("https://example.com", { fetchPage })).rejects.toMatchObject({ code: "unreachable" }); expect(fetchPage).toHaveBeenCalledTimes(1);
  });
  it("rejects an external final URL even from an injected fetcher", async () => {
    const fetchPage: PageFetcher = async (url) => ({ url: url.endsWith("robots.txt") ? url : "https://other.example", status: 200, contentType: url.endsWith("robots.txt") ? "text/plain" : "text/html", html: url.endsWith("robots.txt") ? "" : home }); await expect(crawlWebsite("https://example.com", { fetchPage })).rejects.toMatchObject({ code: "unreachable" });
  });
});
