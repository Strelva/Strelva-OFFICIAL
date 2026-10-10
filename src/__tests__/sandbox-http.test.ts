import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { createSandboxHttpPort, sandboxSourceArchive } from "@/products/custom-applications/sandbox-http";
import { createVercelSandboxBuilder } from "@/products/custom-applications/vercel-sandbox-build";
const image = `qualification/node@sha256:${"a".repeat(64)}`;
const input = { workspaceId: "11111111-1111-4111-8111-111111111111", resourceId: "22222222-2222-4222-8222-222222222222", applicationVersion: 1, files: { "build.mjs": "Reviewed fixture source" } };
function fixture(options: { failCreate?: boolean; wrongAccount?: boolean; overflow?: boolean; stopFailure?: boolean } = {}) {
  let enabled = true; let name = ""; let commands = 0;
  const session = { id: "sbx_Exact", memory: 2048, vcpus: 1, region: "iad1", timeout: 30000, status: "running", networkPolicy: { mode: "deny-all" }, activeCpuDurationMs: 10, networkTransfer: { ingress: 100, egress: 20 } };
  const fetcher = vi.fn(async (url: URL | RequestInfo, request?: RequestInit) => {
    const target = new URL(String(url)); const body = typeof request?.body === "string" ? JSON.parse(request.body) : undefined;
    expect(target.origin).toBe("https://vercel.com"); expect(target.searchParams.get("teamId")).toBe("team_Exact");
    expect((request?.headers as Record<string, string>).Authorization).toBe("Bearer fixture-provider-secret");
    expect(request?.redirect).toBe("error");
    if (target.pathname === "/api/v3/sandboxes") {
      if (options.failCreate) throw new Error("Private ambiguous create"); name = body.name;
      expect(body.projectId).toBe("prj_Exact"); expect(body.networkPolicy).toEqual({ mode: "deny-all" }); expect(body.env).toEqual({});
      return Response.json({ session, sandbox: { name, image, persistent: false, currentSessionId: session.id }, routes: [] });
    }
    if (target.pathname.endsWith("/fs/write")) {
      const tar = gunzipSync(Buffer.from(request?.body as Uint8Array));
      expect(tar.subarray(0, 100).toString().split("\0")[0]).toBe("strelva-source/build.mjs");
      expect(tar.subarray(512, 512 + Buffer.byteLength(input.files["build.mjs"])).toString()).toBe(input.files["build.mjs"]);
      return Response.json({});
    }
    if (target.pathname.endsWith("/cmd")) {
      commands++; expect(body.sudo).toBe(true); expect(body.env).toEqual({});
      return Response.json({ command: { id: `cmd_${commands}`, sessionId: options.wrongAccount ? "sbx_Other" : session.id, exitCode: null } });
    }
    if (target.pathname.includes("/cmd/")) {
      expect(target.searchParams.get("wait")).toBe("true");
      return Response.json({ command: { id: `cmd_${commands}`, sessionId: session.id, exitCode: 0 } });
    }
    if (target.pathname.endsWith("/fs/read")) {
      expect(body.path).toBe("/output/index.html");
      return new Response(options.overflow ? Buffer.alloc(512001) : "<main>Qualified fixture</main>", { headers: { "content-type": "application/octet-stream" } });
    }
    if (target.pathname.endsWith("/stop")) {
      if (options.stopFailure) return Response.json({ error: "Private provider failure" }, { status: 500 });
      return Response.json({ session: { ...session, status: "stopped" } });
    }
    throw new Error("Unexpected provider endpoint");
  });
  const port = createSandboxHttpPort({ teamId: "team_Exact", projectId: "prj_Exact", token: () => "fixture-provider-secret", approved: () => enabled }, fetcher as typeof fetch);
  return { port, fetcher, disable: () => { enabled = false; } };
}
describe("actual Sandbox API HTTP binding", () => {
  it("builds via documented session commands and gzip files, retaining actual usage and VM limits", async () => {
    const f = fixture(); const observe = vi.fn();
    const artifact = await createVercelSandboxBuilder(f.port, { enabled: () => true, image, admit: vi.fn(), observe })(input);
    expect(artifact.limits.memoryMb).toBe(2048); expect(artifact.html).toBe("<main>Qualified fixture</main>");
    expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "stopped", sessionId: "sbx_Exact", payload: { activeCpuDurationMs: 10, ingressBytes: 100, egressBytes: 20 } }));
    expect(f.fetcher.mock.calls.filter(call => String(call[0]).includes("/v3/sandboxes"))).toHaveLength(1);
  });
  it.each([{ wrongAccount: true }, { overflow: true }, { stopFailure: true }])("rejects unbound commands, oversized artifacts and failed cleanup", async options => {
    const f = fixture(options);
    await expect(createVercelSandboxBuilder(f.port, { enabled: () => true, image, admit: vi.fn() })(input)).rejects.toThrow();
    expect(f.fetcher.mock.calls.some(call => String(call[0]).includes("/stop"))).toBe(true);
  });
  it("does not blindly retry an ambiguous create", async () => {
    const f = fixture({ failCreate: true });
    await expect(createVercelSandboxBuilder(f.port, { enabled: () => true, image, admit: vi.fn() })(input)).rejects.toMatchObject({ cleanupRequired: true });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("still permits cleanup after the new-build approval is withdrawn", async () => {
    const f = fixture(); const sandbox = await f.port.create({ name: "strelva-build-fixture", image, resources: { vcpus: 1 }, region: "iad1", timeout: 30000, persistent: false, networkPolicy: "deny-all", ports: [], env: {}, signal: new AbortController().signal });
    f.disable();
    await expect(sandbox.stop({ signal: new AbortController().signal })).resolves.toMatchObject({ activeCpuDurationMs: 10 });
    await expect(sandbox.readFileToBuffer({ path: "/output/index.html" }, { signal: new AbortController().signal })).rejects.toThrow();
  });
  it("rejects traversals and duplicates before uploading a source archive", () => {
    const file = { path: "/vercel/sandbox/strelva-source/build.mjs", content: Buffer.from("reviewed"), mode: 0o444 };
    expect(() => sandboxSourceArchive([file, file])).toThrow();
    expect(() => sandboxSourceArchive([{ ...file, path: "/vercel/sandbox/strelva-source/../escape" }])).toThrow();
    expect(() => sandboxSourceArchive([{ ...file, mode: 0o777 }])).toThrow();
    const tar = gunzipSync(sandboxSourceArchive([file])); const checksum = Number.parseInt(tar.subarray(148, 154).toString(), 8);
    const header = Buffer.from(tar.subarray(0, 512)); header.fill(32, 148, 156);
    expect(header.reduce((sum, byte) => sum + byte, 0)).toBe(checksum);
  });
});
