import { describe, expect, it, vi } from "vitest";
import { customArtifactDigest } from "@/products/custom-applications/build";
import {
  createVercelSandboxBuilder, SANDBOX_BUILD_EXECUTE, SANDBOX_BUILD_RUN, SANDBOX_BUILD_SETUP,
  SANDBOX_BUILD_VERIFY, VercelSandboxBuildError, type VercelSandboxBuildPort,
} from "@/products/custom-applications/vercel-sandbox-build";

const input = { workspaceId: "11111111-1111-4111-8111-111111111111", resourceId: "22222222-2222-4222-8222-222222222222", applicationVersion: 1, files: { "build.mjs": "import{writeFile}from'node:fs/promises';await writeFile('/output/index.html','<main>Local</main>');", "data/value.txt": "Fixture" } };
// Fictional operator image digest, never selected as an actual provider image.
const image = `fixture-team/qualification-node@sha256:${"a".repeat(64)}`;
function fixture(options: { failPhase?: number; logs?: number; bytes?: Buffer | null; createFailure?: boolean; stopFailure?: boolean; mismatch?: boolean; cancel?: AbortController } = {}) {
  const stop = vi.fn(async (cleanup: { signal: AbortSignal }) => { expect(cleanup.signal.aborted).toBe(false); if (options.stopFailure) throw new Error("Provider-private failure"); });
  const writeFiles = vi.fn(async (files: { path: string; content: Buffer; mode: number }[]) => { expect(files.length).toBeGreaterThan(0); });
  let phase = 0;
  const runCommand = vi.fn(async (command: Parameters<Awaited<ReturnType<VercelSandboxBuildPort["create"]>>["runCommand"]>[0]) => {
    phase++;
    if (options.logs) command.stdout.write(Buffer.alloc(options.logs));
    if (options.cancel && phase === 2) options.cancel.abort();
    return { exitCode: options.failPhase === phase ? 7 : 0 };
  });
  const readFileToBuffer = vi.fn(async () => options.bytes === undefined ? Buffer.from("<main>Local</main>") : options.bytes);
  const create = vi.fn(async (request: Parameters<VercelSandboxBuildPort["create"]>[0]) => {
    if (options.createFailure) throw new Error("Ambiguous provider create response");
    return { name: request.name, image: options.mismatch ? "unexpected-image" : request.image, persistent: false, vcpus: 1, memory: 2048, writeFiles, runCommand, readFileToBuffer, stop };
  });
  const port: VercelSandboxBuildPort = { create };
  const admit = vi.fn(async () => undefined);
  const builder = createVercelSandboxBuilder(port, { image, enabled: () => true, admit });
  return { port, create, stop, writeFiles, runCommand, readFileToBuffer, admit, builder };
}

describe("prepared Vercel Sandbox build port (no provider operations)", () => {
  it("binds exact source/resource/version to the artifact with honest provider memory", async () => {
    const f = fixture();
    const result = await f.builder(input);
    expect(result.artifactDigest).toBe(customArtifactDigest({ ...input, html: result.html }));
    expect(result.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.limits).toEqual({ network: "none", memoryMb: 2048, cpuCount: 1, timeoutSeconds: 30 });
    expect(result.image).toBe(image);
    expect(f.admit).toHaveBeenCalledWith(input, result.sourceDigest, expect.stringMatching(/^strelva-build-[a-f0-9]{48}$/));
    expect(f.stop).toHaveBeenCalledOnce();
  });
  it("creates only a fresh deny-all VM without secrets, source URLs, persistence or exposed ports", async () => {
    const f = fixture(); await f.builder(input);
    expect(f.create.mock.calls[0]?.[0]).toMatchObject({ image, networkPolicy: "deny-all", persistent: false, env: {}, ports: [], resources: { vcpus: 1 }, timeout: 30_000, region: "iad1" });
    expect(f.create.mock.calls[0]?.[0]).not.toHaveProperty("source");
    expect(f.writeFiles.mock.calls[0]?.[0]).toEqual(Object.entries(input.files).map(([path, content]) => ({ path: `/vercel/sandbox/strelva-source/${path}`, content: Buffer.from(content), mode: 0o444 })));
    expect(f.runCommand.mock.calls.map(([c]) => [c.cmd, c.args])).toEqual([["bash", ["-c", SANDBOX_BUILD_SETUP]], ["bash", ["-c", SANDBOX_BUILD_EXECUTE]], ["bash", ["-c", SANDBOX_BUILD_VERIFY]]]);
    expect(SANDBOX_BUILD_SETUP).toContain("chown -R root:root /source");
    expect(SANDBOX_BUILD_SETUP).toContain("size=2m,noexec,nosuid,nodev");
    expect(SANDBOX_BUILD_RUN).toContain("strelva-builder");
    expect(SANDBOX_BUILD_RUN).toContain("--nproc=64");
    expect(SANDBOX_BUILD_RUN).toContain("-i");
    expect(SANDBOX_BUILD_EXECUTE).toContain(">/tmp/strelva-build-stdout 2>/tmp/strelva-build-stderr");
    expect(SANDBOX_BUILD_VERIFY).toContain("pkill -KILL -u strelva-builder");
  });
  it("uses a stable name across ambiguous retries and changes it for another exact revision", async () => {
    const f = fixture(); await f.builder(input); await f.builder(input);
    const names = f.create.mock.calls.map(([r]) => r.name);
    expect(names[0]).toBe(names[1]);
    await f.builder({ ...input, applicationVersion: 2 });
    expect(f.create.mock.calls[2]?.[0].name).not.toBe(names[0]);
  });
  it("refuses default-off configuration, unpinned images and denied admission before provider calls", async () => {
    for (const config of [{ image, enabled: () => false }, { image: "vercel/sandbox/node:24", enabled: () => true }]) {
      const f = fixture(); await expect(createVercelSandboxBuilder(f.port, { ...config, admit: f.admit })(input)).rejects.toThrow();
      expect(f.create).not.toHaveBeenCalled(); expect(f.admit).not.toHaveBeenCalled();
    }
    const f = fixture();
    await expect(createVercelSandboxBuilder(f.port, { image, enabled: () => true, admit: async () => { throw new Error("No accepted resource budget"); } })(input)).rejects.toThrow("No accepted resource budget");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("rechecks the gate after admission and prevents source mutation", async () => {
    const f = fixture(); let enabled = true;
    await expect(createVercelSandboxBuilder(f.port, { image, enabled: () => enabled, admit: async (frozen) => { expect(Object.isFrozen(frozen.files)).toBe(true); enabled = false; } })(input)).rejects.toThrow();
    expect(f.create).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3])("rejects nonzero exit in phase %s and stops the VM", async failPhase => {
    const f = fixture({ failPhase }); await expect(f.builder(input)).rejects.toThrow(VercelSandboxBuildError);
    expect(f.readFileToBuffer).not.toHaveBeenCalled(); expect(f.stop).toHaveBeenCalledOnce();
  });
  it.each([null, Buffer.alloc(0), Buffer.alloc(512_001), Buffer.from([0xff])])("rejects absent, oversized or invalid UTF-8 artifact bytes", async bytes => {
    const f = fixture({ bytes }); await expect(f.builder(input)).rejects.toThrow(VercelSandboxBuildError); expect(f.stop).toHaveBeenCalledOnce();
  });
  it("refuses mismatched provider image before source upload", async () => {
    const f = fixture({ mismatch: true }); await expect(f.builder(input)).rejects.toThrow();
    expect(f.writeFiles).not.toHaveBeenCalled(); expect(f.stop).toHaveBeenCalledOnce();
  });
  it("caps combined untrusted logs and stops without exposing them", async () => {
    const f = fixture({ logs: 32_001 }); await expect(f.builder(input)).rejects.toThrow("exceeded its limits");
    expect(f.readFileToBuffer).not.toHaveBeenCalled(); expect(f.stop).toHaveBeenCalledOnce();
  });
  it("handles cancellation before create and while running, using a fresh cleanup signal", async () => {
    const canceled = new AbortController(); canceled.abort(); const a = fixture();
    await expect(a.builder(input, canceled.signal)).rejects.toThrow(); expect(a.create).not.toHaveBeenCalled();
    const cancel = new AbortController(); const b = fixture({ cancel });
    await expect(b.builder(input, cancel.signal)).rejects.toThrow(); expect(b.stop).toHaveBeenCalledOnce();
  });
  it("returns no artifact when cleanup fails, and retains only a safe operator lookup name", async () => {
    const f = fixture({ stopFailure: true });
    await expect(f.builder(input)).rejects.toMatchObject({ cleanupRequired: true, sandboxName: expect.stringMatching(/^strelva-build-/) });
  });
  it("marks ambiguous creation for operator reconciliation rather than authorizing another VM", async () => {
    const f = fixture({ createFailure: true });
    await expect(f.builder(input)).rejects.toMatchObject({ cleanupRequired: true, sandboxName: expect.stringMatching(/^strelva-build-/) });
    expect(f.stop).not.toHaveBeenCalled();
  });
});
