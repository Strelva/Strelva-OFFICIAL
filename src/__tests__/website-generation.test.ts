import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createStructuredWebsiteGenerationProvider, generateWebsiteArtifact, generateWebsiteDraft, websiteDraftRenderData } from "@/products/websites/generation";
import { createWebsiteLaunchAdapter, prepareWebsiteLaunch, WebsiteLaunchPreparationError } from "@/products/websites/deployment";
import { assertWebsiteArtifactBundle } from "@/products/websites/artifact";
import { renderGeneratedSite, safeHref } from "../../custom-repo-starter/website-generation/renderer";

const ids = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workId: "22222222-2222-4222-8222-222222222222",
};

const brief = {
  businessName: "Northstar Repair",
  audience: "Homeowners who need a reliable repair team",
  description: "Same-week repair estimates",
  primaryGoal: "Turn urgent repair requests into clear estimate conversations.",
  primaryCallToAction: "Request an estimate",
  contactEmail: "hello@northstar.example",
  notes: "Northstar Repair helps homeowners plan repairs without a confusing handoff.",
} as const;

const publishedCapabilities = {
  baseUrl: "http://127.0.0.1:3214",
  tenant: "northstar",
  inquiry: { capabilityId: "inquiry-main", version: 3 },
  booking: {
    capabilityId: "booking-main",
    version: 4,
    range: { from: "2026-10-01T13:00:00+00:00", to: "2026-10-31T22:00:00+00:00" },
  },
} as const;

describe("website generation and immutable artifacts", () => {
  it("turns a supplied brief into a useful preview and complete repository files", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief, now: "2026-09-20T12:00:00.000Z" });

    expect(artifact.mode).toBe("deterministic_brief");
    expect(artifact.rendererDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.candidate.rendererDigest).toBe(artifact.rendererDigest);
    expect(artifact.candidate.artifactDigest).toBe(artifact.artifactDigest);
    expect(artifact.previewHtml).toContain("Northstar Repair");
    expect(artifact.previewHtml).toContain("Same-week repair estimates");
    expect(artifact.previewHtml).toContain("hello@northstar.example");
    expect(artifact.previewHtml).not.toContain("<script");
    expect(artifact.files.find((file) => file.path === "site/index.html")?.content).toBe(artifact.previewHtml);
    expect(artifact.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      "package.json",
      "scripts/build-site.mjs",
      "website-generation/renderer.mjs",
      "site/site.json",
      "site/index.html",
      "artifact-manifest.json",
    ]));
    expect(artifact.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(artifact.previewHtml).not.toContain("What Clients Are Saying");
    expect(artifact.previewHtml).not.toContain("Tell your story. Why did you start this?");
    expect(artifact.previewHtml).not.toContain("THE PEOPLE THIS BUSINESS SERVES");
    expect(artifact.previewHtml).toContain("<h1>Northstar Repair</h1>");
    expect(artifact.previewHtml).not.toContain(brief.notes);
  });

  it("uses the same renderer in the control plane and exported repository", async () => {
    const draft = await generateWebsiteDraft({ ...ids, revision: 1, brief });
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief });
    const runtimeRenderer = await import("../../custom-repo-starter/website-generation/renderer.mjs");
    const site = websiteDraftRenderData(draft);
    expect(renderGeneratedSite(site)).toBe(artifact.previewHtml);
    expect(runtimeRenderer.renderGeneratedSite(site)).toBe(artifact.previewHtml);
  });

  it("exports working capability mounts only from a server-selected published projection", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief, publishedCapabilities });
    expect(artifact.spec.publishedCapabilities).toEqual(publishedCapabilities);
    expect(artifact.files.map(file => file.path)).toEqual(expect.arrayContaining([
      "website-generation/capability-runtime.mjs",
      "site/site.json",
    ]));
    expect(artifact.previewHtml).toContain("data-strelva-capability=\"inquiry\"");
    expect(artifact.previewHtml).toContain("data-strelva-capability=\"booking\"");
    expect(artifact.previewHtml).toContain("/website-generation/capability-runtime.mjs");
    expect(artifact.previewHtml).toContain("inquiry-main");
    expect(artifact.previewHtml).toContain("booking-main");
  });

  it("keeps published capability bindings outside model-shaped content", async () => {
    const draft = await generateWebsiteDraft({ ...ids, revision: 1, brief, publishedCapabilities }, async ({ baseline }) => ({
      ...baseline.spec,
      publishedCapabilities: { ...publishedCapabilities, tenant: "attacker" },
    }));
    expect(draft.spec.publishedCapabilities).toEqual(publishedCapabilities);
  });

  it("does not let a provider invent a public capability binding", async () => {
    const draft = await generateWebsiteDraft({ ...ids, revision: 1, brief }, async ({ baseline }) => ({
      ...baseline.spec,
      publishedCapabilities,
    }));
    expect(draft.spec.publishedCapabilities).toBeUndefined();
  });

  it("rejects provider page keys that cannot become safe exported paths", async () => {
    await expect(generateWebsiteDraft({ ...ids, revision: 1, brief }, async ({ baseline }) => ({
      ...baseline.spec,
      pages: { ...baseline.spec.pages, "../private": { sections: [] } },
    }))).rejects.toThrow(/valid WebsiteSpec|safe path/i);
  });

  it("builds the generated repository with its pinned runtime renderer", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief });
    const directory = mkdtempSync(join(tmpdir(), "strelva-generated-website-"));
    try {
      for (const item of artifact.files) {
        const target = join(directory, item.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, item.content, "utf8");
      }
      const output = execFileSync("node", [join(directory, "scripts/build-site.mjs")], { cwd: directory, encoding: "utf8" });
      expect(JSON.parse(output.trim())).toMatchObject({ status: "built", contentHash: artifact.contentHash, rendererDigest: artifact.rendererDigest, artifactDigest: artifact.artifactDigest, pages: 3 });
      expect(JSON.parse(readFileSync(join(directory, "dist", "build-receipt.json"), "utf8"))).toMatchObject({ contentHash: artifact.contentHash, rendererDigest: artifact.rendererDigest, artifactDigest: artifact.artifactDigest });
      expect(readFileSync(join(directory, "dist", "index.html"), "utf8")).toBe(artifact.previewHtml);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps the same digest across preview, export, and launch preparation", async () => {
    const first = await generateWebsiteArtifact({ ...ids, revision: 1, brief, now: "2026-09-20T12:00:00.000Z" });
    const second = await generateWebsiteArtifact({ ...ids, revision: 1, brief, now: "2026-09-21T12:00:00.000Z" });
    expect(second.artifactDigest).toBe(first.artifactDigest);
    expect(second.contentHash).toBe(first.contentHash);

    const prepared = prepareWebsiteLaunch(first, { kind: "local_export", outputDirectory: "/tmp/northstar-site" });
    expect(prepared.status).toBe("prepared");
    expect(prepared.artifactDigest).toBe(first.artifactDigest);
    expect(prepared.files).toHaveLength(first.files.length);
  });

  it("changes the artifact when the brief revision changes", async () => {
    const first = await generateWebsiteArtifact({ ...ids, revision: 1, brief, now: "2026-09-20T12:00:00.000Z" });
    const edited = await generateWebsiteArtifact({ ...ids, revision: 2, brief: { ...brief, description: "Next-day repair estimates" }, now: "2026-09-20T12:00:00.000Z" });
    expect(edited.artifactDigest).not.toBe(first.artifactDigest);
    expect(edited.previewHtml).toContain("Next-day repair estimates");
    expect(edited.previewHtml).not.toContain("Same-week repair estimates");
  });

  it("uses an injected structured provider without calling a paid model", async () => {
    const draft = await generateWebsiteDraft({ ...ids, revision: 1, brief }, async ({ baseline }) => ({
      ...baseline.spec,
      siteName: "Northstar Provider Draft",
      content: {
        ...baseline.spec.content,
        settings: { ...(baseline.spec.content.settings as Record<string, unknown>), siteName: "Northstar Provider Draft" },
        hero: { ...(baseline.spec.content.hero as Record<string, unknown>), headline: "A provider-shaped result" },
      },
    }));
    expect(draft.mode).toBe("structured_provider");
    expect(draft.spec.siteName).toBe("Northstar Provider Draft");
    expect((draft.spec.content.hero as Record<string, unknown>).headline).toBe("A provider-shaped result");
  });

  it("exposes the existing model admission seam without making the model call itself", async () => {
    let calls = 0;
    const provider = createStructuredWebsiteGenerationProvider({
      run: async ({ baseline, modelLabel }) => {
        calls += 1;
        expect(modelLabel).toBe("structured-website-provider");
        return { ...baseline.spec, siteName: "Admitted provider draft" };
      },
    });
    const draft = await generateWebsiteDraft({ ...ids, revision: 1, brief }, provider);
    expect(calls).toBe(1);
    expect(draft.spec.siteName).toBe("Admitted provider draft");
  });

  it("does not let provider theme text close the generated style element", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief }, async ({ baseline }) => {
      const colors = (baseline.spec.theme as Record<string, unknown>).colors;
      return {
        ...baseline.spec,
        theme: {
          ...baseline.spec.theme,
          colors: {
            ...(colors && typeof colors === "object" && !Array.isArray(colors) ? colors as Record<string, unknown> : {}),
            cream: "rgba(0)</style><script>alert(1)</script>)",
          },
        },
      };
    });
    expect(artifact.previewHtml).not.toContain("</style><script>");
    expect(artifact.previewHtml).toContain("--cream:#faf8f5");
  });

  it("rejects protocol-relative links before they reach generated HTML", () => {
    expect(safeHref("//other.example/steal")).toBe("#");
    expect(safeHref("/contact")).toBe("/contact");
  });

  it("blocks provider launch preparation when no provider identity is accepted", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief, now: "2026-09-20T12:00:00.000Z" });
    const blocked = prepareWebsiteLaunch(artifact, { kind: "github_vercel", projectId: "", repositoryUrl: "" });
    expect(blocked.status).toBe("blocked");
    expect(blocked.reason).toBe("provider_unavailable");
    expect(blocked.artifactDigest).toBe(artifact.artifactDigest);
  });

  it("requires exact approval and replays one provider receipt by idempotency key", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief, now: "2026-09-20T12:00:00.000Z" });
    const adapter = createWebsiteLaunchAdapter({
      target: { kind: "github_vercel", repositoryUrl: "https://github.com/example/northstar", projectId: "northstar-site" },
      approval: { candidateRevision: artifact.revision, contentHash: artifact.contentHash },
      now: () => "2026-09-20T12:30:00.000Z",
    });
    const input = { workspaceId: ids.workspaceId, workId: ids.workId, idempotencyKey: "website:launch:1" };
    const first = await adapter.prepare(artifact.candidate, input);
    const replay = await adapter.prepare(artifact.candidate, input);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({ status: "pending", artifactHash: artifact.contentHash, candidateRevision: 1 });

    const edited = await generateWebsiteArtifact({ ...ids, revision: 2, brief: { ...brief, description: "Next-day repair estimates" } });
    await expect(adapter.prepare(edited.candidate, input)).rejects.toThrow(/idempotency key/i);
  });

  it("does not turn an unconfigured provider target into a fake receipt", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief });
    const adapter = createWebsiteLaunchAdapter({ target: { kind: "github_vercel", repositoryUrl: "", projectId: "" } });
    await expect(adapter.prepare(artifact.candidate, { ...ids, idempotencyKey: "website:launch:missing" })).rejects.toMatchObject({ reason: "provider_unavailable" } satisfies Partial<WebsiteLaunchPreparationError>);
  });

  it("rejects an artifact whose file bytes no longer match the recorded digest", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief, now: "2026-09-20T12:00:00.000Z" });
    const changed = { ...artifact, files: artifact.files.map((file) => file.path === "site/index.html" ? { ...file, content: `${file.content}changed` } : file) };
    expect(() => assertWebsiteArtifactBundle(changed)).toThrow(/digest|immutable|file/i);
  });

  it("rejects a candidate spec that diverges from the exported spec", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief });
    const changed = {
      ...artifact,
      candidate: {
        ...artifact.candidate,
        spec: { ...artifact.candidate.spec, siteName: "A different site" },
      },
    };
    expect(() => assertWebsiteArtifactBundle(changed)).toThrow(/spec|hash/i);
  });

  it("blocks a candidate when its pinned renderer digest is stale", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief });
    const changed = {
      ...artifact,
      candidate: { ...artifact.candidate, rendererDigest: "0".repeat(64) },
    };
    expect(() => assertWebsiteArtifactBundle(changed)).toThrow(/renderer|digest/i);
    expect(prepareWebsiteLaunch(changed, { kind: "local_export", outputDirectory: "/tmp/northstar-site" })).toMatchObject({ status: "blocked", reason: "artifact_mismatch" });
  });

  it("blocks a candidate when its complete exported artifact digest is stale", async () => {
    const artifact = await generateWebsiteArtifact({ ...ids, revision: 1, brief });
    const changed = { ...artifact, candidate: { ...artifact.candidate, artifactDigest: "0".repeat(64) } };
    expect(() => assertWebsiteArtifactBundle(changed)).toThrow(/artifact|digest/i);
  });
});
