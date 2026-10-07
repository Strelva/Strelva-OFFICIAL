import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configuredWebsiteRebuildOptions } from "@/products/websites/rebuild-runtime";

const input = { actor: { userId: "76000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" },
  workspaceId: "76000000-0000-4000-8000-000000000002", workId: "76000000-0000-4000-8000-000000000003", recheck: vi.fn() };
const ports = { released: vi.fn(), writer: vi.fn(), jevComposer: vi.fn(), jevVerifier: vi.fn(), modelComposer: vi.fn(), reserveCall: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STRELVA_WEBSITE_MODEL_CALLS_ENABLED", "1"); vi.stubEnv("STRELVA_WEBSITE_MODEL_MAX_CALLS", "2"); vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-key");
  ports.released.mockResolvedValue(true); ports.reserveCall.mockResolvedValue(undefined);
  ports.writer.mockReturnValue(async () => ({})); ports.jevComposer.mockReturnValue({ name: "jev" }); ports.modelComposer.mockReturnValue({ name: "model" }); ports.jevVerifier.mockReturnValue(async () => ({}));
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
