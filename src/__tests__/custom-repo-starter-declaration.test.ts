import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { siteCapabilityManifestSchema } from "@/lib/schemas";
import { AGENT_SITE_CHANGE_TOOLS } from "@/platform/agent-channel/site-change-tools";
import { buildSiteCapabilityManifest } from "../../custom-repo-starter/scaffold-client";
import { defaults } from "../../custom-repo-starter/content-defaults";

const starter = (file: string) => readFileSync(join(process.cwd(), "custom-repo-starter", file), "utf8");

describe("starter capability manifest declares its content source and live commit", () => {
  it("round-trips through the control plane's schema", () => {
    const manifest = buildSiteCapabilityManifest(Object.keys(defaults), {
      contentSource: "strelva", release: { commitSha: "0123456789abcdef0123456789abcdef01234567", builtAt: "2026-10-15T12:00:00.000Z" },
    });
    const parsed = siteCapabilityManifestSchema.parse(JSON.parse(JSON.stringify(manifest)));
    expect(parsed.contentSource).toBe("strelva");
    expect(parsed.release).toEqual({ commitSha: "0123456789abcdef0123456789abcdef01234567", builtAt: "2026-10-15T12:00:00.000Z" });
    expect(siteCapabilityManifestSchema.safeParse({ ...manifest, release: { commitSha: "not a sha" } }).success).toBe(false);
  });

  it("adds no keys when it declares nothing, and accepts an unknown commit", () => {
    const bare = buildSiteCapabilityManifest(["hero"]);
    expect(Object.keys(bare)).not.toContain("contentSource");
    expect(Object.keys(bare)).not.toContain("release");
    const unknown = buildSiteCapabilityManifest(["hero"], { release: { commitSha: null } });
    expect(siteCapabilityManifestSchema.safeParse(JSON.parse(JSON.stringify(unknown))).success).toBe(true);
  });

  describe("the route", () => {
    afterEach(() => vi.unstubAllEnvs());
    const read = async () => (await (await import("../../custom-repo-starter/site-capabilities-route")).GET().json()) as Record<string, unknown>;
    it("declares repo and the Vercel commit by default, and strelva only when told", async () => {
      vi.stubEnv("REB_CONTENT_SOURCE", "");
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567");
      const body = await read();
      expect(body.contentSource).toBe("repo");
      expect(body.release).toMatchObject({ commitSha: "abcdef1234567" });
      expect(siteCapabilityManifestSchema.safeParse(body).success).toBe(true);
      vi.stubEnv("REB_CONTENT_SOURCE", "strelva");
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
      expect((await read()).contentSource).toBe("strelva");
    });
  });
});

describe("CLAUDE.strelva.md", () => {
  const doc = starter("CLAUDE.strelva.md");
  it("names every coding-agent tool, so the docs cannot drift from the tools", () => {
    for (const tool of AGENT_SITE_CHANGE_TOOLS) expect(doc, tool).toContain(tool);
  });
  it("says how to connect, which branch to use, and not to merge before approval", () => {
    expect(doc).toContain("claude mcp add --transport http strelva https://app.strelva.com/api/mcp/public");
    expect(doc).toContain("strelva/<first 8 characters of the request id>");
    expect(doc).toContain("Never merge before the Request is approved.");
  });
  it("is linked from the playbook and the starter README", () => {
    expect(starter("AGENT-PLAYBOOK.md")).toContain("CLAUDE.strelva.md");
    expect(starter("README.md")).toContain("CLAUDE.strelva.md");
  });
});
