import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configuredWebsiteRebuildOptions, configuredWebsitePatchOptions } from "@/products/websites/rebuild-runtime";
import { prepareSitePatch } from "@/products/websites/site-operations";
import { siteDocumentSchema } from "@/products/websites/site-document";
import type { JevProviderOptions } from "@/products/websites/rebuild-providers";

const input = { actor: { userId: "76000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" },
  workspaceId: "76000000-0000-4000-8000-000000000002", workId: "76000000-0000-4000-8000-000000000003", recheck: vi.fn() };
const ports = { released: vi.fn(), writer: vi.fn(), jevComposer: vi.fn(), jevVerifier: vi.fn(), modelComposer: vi.fn(), reserveCall: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STRELVA_WEBSITE_MODEL_CALLS_ENABLED", "1"); vi.stubEnv("STRELVA_WEBSITE_MODEL_MAX_CALLS", "2"); vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-key");
  ports.released.mockResolvedValue(true); ports.reserveCall.mockResolvedValue(undefined);
  ports.writer.mockReturnValue(async () => ({})); ports.jevComposer.mockReturnValue({ name: "jev" }); ports.modelComposer.mockReturnValue({ name: "model" }); ports.jevVerifier.mockReturnValue(async () => ({}));
});

describe("bounded Jev evidence for reviewed website patches", () => {
  function fixture() {
    const document = siteDocumentSchema.parse({ version: 2, siteName: "Local Business", theme: { palette: "light", typeScale: "standard" },
      pages: [{ path: "/", title: "Local Business", description: "", root: "hero" }],
      nodes: { hero: { id: "hero", type: "Hero", variant: "statement", props: { title: "Estate planning" }, children: [], factIds: ["source_fact"] } },
      facts: { source_fact: { text: "Estate planning", kind: "service", highRisk: false, origin: "source", sources: [{ sourceId: "fixture-source", quote: "Estate planning" }], verification: { supported: true, confidence: 1 } } },
      assets: {}, redirects: [], provenance: { composer: "rules" } });
    const ops = [{ op: "replace", path: "/nodes/hero/props/title", value: "Plan your estate" }];
    const riskRun = vi.fn(async () => ({ level: "low" as const, confidence: .95 }));
    const verifyRun = vi.fn(async (_request: unknown) => ({ supported: true, confidence: .96, highRisk: false }));
    const patchPorts = { released: ports.released, reserveCall: ports.reserveCall,
      jevRisk: vi.fn((options: JevProviderOptions) => async () => options.admit({ model: "typesafe-ai/jev", purpose: "patch_risk", inputBytes: 500 }, riskRun)),
      jevVerifier: vi.fn((options: JevProviderOptions) => async (request: unknown) => options.admit({ model: "typesafe-ai/jev", purpose: "verification", inputBytes: 500 }, () => verifyRun(request))),
    };
    const patchInput = { ...input, document, ops };
    return { document, ops, patchInput, patchPorts, riskRun, verifyRun };
  }
  it.each(["off", "no_key"])("%s makes no risk or verification call and performs no admission read", async setting => {
    const h = fixture();
    vi.stubEnv(setting === "off" ? "STRELVA_WEBSITE_MODEL_CALLS_ENABLED" : "AI_GATEWAY_API_KEY", "");
    expect(await configuredWebsitePatchOptions(h.patchInput, h.patchPorts)).toEqual({});
    expect(ports.released).not.toHaveBeenCalled(); expect(ports.reserveCall).not.toHaveBeenCalled(); expect(h.riskRun).not.toHaveBeenCalled();
  });
  it("scores risk and changed copy against prior cited facts while keeping owner decisions and sources intact", async () => {
    const h = fixture(); const options = await configuredWebsitePatchOptions(h.patchInput, h.patchPorts);
    const prepared = await prepareSitePatch({ document: h.document, ops: h.ops, ...options, autoMode: true });
    expect(options.risk).toEqual({ level: "low", confidence: .95 });
    expect(h.verifyRun).toHaveBeenCalledWith({ sentence: "Plan your estate", facts: [{ id: "source_fact", text: "Estate planning", quotes: ["Estate planning"], origin: "source" }] });
    expect(prepared.document.nodes.hero?.verification).toMatchObject({ supported: true, confidence: .96, needsReview: true });
    expect(prepared.document.facts.source_fact).toEqual(h.document.facts.source_fact);
    expect(Object.values(prepared.document.facts).find(fact => fact.text === "Plan your estate")).toMatchObject({ origin: "owner_stated", highRisk: true, sources: [] });
    expect(prepared.governance.action).toBe("review"); expect(prepared.forceReview).toBe(true); expect(ports.reserveCall).toHaveBeenCalledTimes(2);
  });
  it("never lets proposed owner statements become their own evidence", async () => {
    const h = fixture(); h.document.facts.source_fact!.origin = "owner_stated"; h.document.facts.source_fact!.sources = [];
    const options = await configuredWebsitePatchOptions(h.patchInput, h.patchPorts);
    const prepared = await prepareSitePatch({ document: h.document, ops: h.ops, ...options });
    expect(h.verifyRun).not.toHaveBeenCalled(); expect(prepared.document.nodes.hero?.verification?.supported).toBe(false); expect(prepared.forceReview).toBe(true);
  });
  it.each(["release", "membership", "allowance"])("a revoked %s during verification makes no further provider call and preserves owner review", async condition => {
    const h = fixture(); const options = await configuredWebsitePatchOptions(h.patchInput, h.patchPorts);
    if (condition === "release") ports.released.mockResolvedValue(false);
    if (condition === "membership") input.recheck.mockRejectedValue(new Error("Revoked"));
    if (condition === "allowance") ports.reserveCall.mockRejectedValue(new Error("Exhausted"));
    const prepared = await prepareSitePatch({ document: h.document, ops: h.ops, ...options, autoMode: true });
    expect(h.verifyRun).not.toHaveBeenCalled(); expect(prepared.forceReview).toBe(true); expect(prepared.document.nodes.hero?.verification?.supported).toBe(false);
  });
  it("risk provider failure keeps the patch reviewed", async () => {
    const h = fixture(); h.riskRun.mockRejectedValue(new Error("Unavailable"));
    const options = await configuredWebsitePatchOptions(h.patchInput, h.patchPorts);
    expect(options.risk).toBeUndefined();
    expect((await prepareSitePatch({ document: h.document, ops: h.ops, ...options, autoMode: true })).forceReview).toBe(true);
  });
  it("checks at most 12 changed claims per patch and leaves unchecked copy for the owner", async () => {
    const h = fixture(); const options = await configuredWebsitePatchOptions(h.patchInput, h.patchPorts);
    const proposed = structuredClone(h.document);
    proposed.nodes.hero!.factIds = Array.from({ length: 14 }, (_, index) => {
      const id = `proposed_${index}`;
      proposed.facts[id] = { text: `New claim ${index}`, kind: "claim", highRisk: true, origin: "owner_stated", sources: [] };
      return id;
    });
    const checked = await options.verify!(proposed, ["hero"]);
    expect(h.verifyRun).toHaveBeenCalledTimes(12); expect(ports.reserveCall).toHaveBeenCalledTimes(13);
    expect(checked.nodes.hero?.verification).toMatchObject({ supported: false, needsReview: true });
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("website runtime selects bounded providers only under explicit authority", () => {
  it("keys with the opt-in off select no providers, read no authority or allowance", async () => {
    vi.stubEnv("STRELVA_WEBSITE_MODEL_CALLS_ENABLED", "0");
    expect(await configuredWebsiteRebuildOptions(input, ports)).toEqual({});
    expect(ports.released).not.toHaveBeenCalled(); expect(ports.writer).not.toHaveBeenCalled(); expect(ports.reserveCall).not.toHaveBeenCalled();
  });
  it("selects writer, Jev, model fallback and verifier for this business", async () => {
    const options = await configuredWebsiteRebuildOptions(input, ports);
    expect(options.composers?.map(item => item.name)).toEqual(["jev", "model"]); expect(options.writer).toBeDefined(); expect(options.verifier).toBeDefined();
    expect(ports.writer).toHaveBeenCalledWith(expect.objectContaining({ context: { workspaceId: input.workspaceId } }));
    const admit = ports.jevComposer.mock.calls[0]![0].admit;
    const run = vi.fn(async () => "result");
    expect(await admit({ model: "jev", purpose: "composition", inputBytes: 300 }, run)).toBe("result");
    expect(ports.reserveCall).toHaveBeenCalledWith(input, 2); expect(run).toHaveBeenCalledOnce();
  });
  it("without the gateway key still selects model composition and source verification", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", ""); const options = await configuredWebsiteRebuildOptions(input, ports);
    expect(options.composers?.map(item => item.name)).toEqual(["model"]); expect(options.verifier).toBeUndefined(); expect(ports.jevComposer).not.toHaveBeenCalled();
  });
  it("rechecks release and membership before each provider attempt", async () => {
    await configuredWebsiteRebuildOptions(input, ports); const admit = ports.jevComposer.mock.calls[0]![0].admit; const run = vi.fn();
    ports.released.mockResolvedValue(false); await expect(admit({ inputBytes: 1 }, run)).rejects.toThrow("authority changed");
    ports.released.mockResolvedValue(true); input.recheck.mockRejectedValue(Error("membership revoked")); await expect(admit({ inputBytes: 1 }, run)).rejects.toThrow("revoked");
    expect(run).not.toHaveBeenCalled(); expect(ports.reserveCall).not.toHaveBeenCalled();
  });
  it("never invokes a provider after denied durable admission or oversized input", async () => {
    await configuredWebsiteRebuildOptions(input, ports); const admit = ports.jevComposer.mock.calls[0]![0].admit; const run = vi.fn();
    await expect(admit({ inputBytes: 250001 }, run)).rejects.toThrow("input limit"); expect(ports.reserveCall).not.toHaveBeenCalled();
    ports.reserveCall.mockRejectedValue(Error("allowance exhausted")); await expect(admit({ inputBytes: 1 }, run)).rejects.toThrow("exhausted"); expect(run).not.toHaveBeenCalled();
  });
  it.each(["0", "65", "1.5", "bad"])("refuses invalid server allowance %s", async maximum => {
    vi.stubEnv("STRELVA_WEBSITE_MODEL_MAX_CALLS", maximum); await expect(configuredWebsiteRebuildOptions(input, ports)).rejects.toThrow("between 1 and 64"); expect(ports.writer).not.toHaveBeenCalled();
  });
});
