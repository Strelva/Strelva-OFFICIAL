import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { websiteArtifactSchema, type WebsiteArtifact, type WebsiteSpec } from "./contracts";
import { canonicalJson, draftFromWebsiteSpec, websiteDraftPreviewHtml, websiteDraftRenderData, websiteSpecContentHash, type WebsiteDraft } from "./generation";
import { renderGeneratedPages } from "../../../custom-repo-starter/website-generation/renderer";

export interface WebsiteArtifactFile {
  path: string;
  content: string;
  sha256: string;
  bytes: number;
}

export interface WebsiteArtifactBundle {
  version: 1;
  workspaceId: string;
  workId: string;
  revision: number;
  mode: WebsiteDraft["mode"];
  contentHash: string;
  rendererDigest: string;
  artifactDigest: string;
  candidate: WebsiteArtifact;
  spec: WebsiteSpec;
  previewHtml: string;
  files: WebsiteArtifactFile[];
  generatedAt: string;
}

export interface BuildWebsiteArtifactInput {
  workspaceId: string;
  workId: string;
  revision: number;
  draft: WebsiteDraft;
  generatedAt?: string;
  previewHref?: string;
}

function rendererSource(): string {
  const path = join(process.cwd(), "custom-repo-starter", "website-generation", "renderer.mjs");
  if (!existsSync(path)) throw new Error("The pinned website starter renderer is unavailable; refusing to create an incomplete repository artifact.");
  const source = readFileSync(path, "utf8");
  if (!source.includes("renderGeneratedPages")) throw new Error("The pinned website starter renderer is incomplete; refusing to create an incomplete repository artifact.");
  return source;
}

function capabilityRuntimeSource(): string {
  const path = join(process.cwd(), "custom-repo-starter", "website-generation", "capability-runtime.mjs");
  if (!existsSync(path)) throw new Error("The published capability runtime is unavailable; refusing to create an incomplete connected website artifact.");
  const source = readFileSync(path, "utf8");
  if (!source.includes("mountPublishedCapabilities") || !source.includes("createCapabilityApi")) throw new Error("The published capability runtime is incomplete; refusing to create an incomplete connected website artifact.");
  return source;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function websiteRendererDigest(): string {
  return sha256(rendererSource());
}

function file(path: string, content: string): WebsiteArtifactFile {
  return { path, content, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8") };
}

function buildScript(): string {
  return `import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderGeneratedPages } from "../website-generation/renderer.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, "..");
const site = JSON.parse(await readFile(join(repo, "site", "site.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(repo, "artifact-manifest.json"), "utf8"));
const pages = renderGeneratedPages(site);
if (site.publishedCapabilities) {
  const runtime = await readFile(join(repo, "website-generation", "capability-runtime.mjs"), "utf8");
  await mkdir(join(repo, "dist", "website-generation"), { recursive: true });
  await writeFile(join(repo, "dist", "website-generation", "capability-runtime.mjs"), runtime, "utf8");
}
for (const [slug, html] of Object.entries(pages)) {
  const target = slug === "home" ? join(repo, "dist", "index.html") : join(repo, "dist", slug, "index.html");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
}
await writeFile(join(repo, "dist", "build-receipt.json"), JSON.stringify({ contentHash: site.contentHash, rendererDigest: site.rendererDigest, artifactDigest: manifest.artifactDigest, pages: Object.keys(pages) }, null, 2) + "\\n", "utf8");
console.log(JSON.stringify({ status: "built", contentHash: site.contentHash, rendererDigest: site.rendererDigest, artifactDigest: manifest.artifactDigest, pages: Object.keys(pages).length }));
`;
}

function packageJson(): string {
  return JSON.stringify({
    name: "strelva-generated-website",
    private: true,
    type: "module",
    scripts: { build: "node scripts/build-site.mjs" },
    engines: { node: ">=20" },
  }, null, 2) + "\n";
}

function readme(input: BuildWebsiteArtifactInput, contentHash: string, rendererDigest: string): string {
  return `# Generated website artifact\n\nThis repository was generated from the supplied website brief for local review.\n\n- Candidate revision: ${input.revision}\n- Content hash: \`${contentHash}\`\n- Renderer digest: \`${rendererDigest}\`\n- Renderer contract: v1\n- Build: \`node scripts/build-site.mjs\`\n\nThe build produces static files in \`dist/\`. A local build or preview is not a publication, a Vercel deployment, or an accepted provider commitment. Launch preparation must use the exact approved artifact hash and an authorized provider receipt.\n`;
}

function manifest(input: BuildWebsiteArtifactInput, contentHash: string, rendererDigest: string, artifactDigest: string): string {
  return JSON.stringify({
    version: 1,
    kind: "website_artifact",
    workspaceId: input.workspaceId,
    workId: input.workId,
    revision: input.revision,
    contentHash,
    rendererDigest,
    artifactDigest,
    rendererContractVersion: "v1",
    files: "listed_by_path_in_this_export",
  }, null, 2) + "\n";
}

function artifactDigest(input: BuildWebsiteArtifactInput, contentHash: string, files: WebsiteArtifactFile[]): string {
  return sha256(canonicalJson({
    version: 1,
    workspaceId: input.workspaceId,
    workId: input.workId,
    revision: input.revision,
    contentHash,
    files: files.filter((item) => item.path !== "artifact-manifest.json").map((item) => [item.path, item.sha256, item.bytes]),
  }));
}

function normalizePreviewHref(workId: string, revision: number, href?: string): string {
  const candidate = href?.trim();
  if (candidate && (/^\/(?!\/)/.test(candidate) || /^https:\/\//i.test(candidate))) return candidate;
  return `/workspace?view=websites&work=${encodeURIComponent(workId)}&revision=${revision}`;
}

export function buildWebsiteArtifact(input: BuildWebsiteArtifactInput): WebsiteArtifactBundle {
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error("Website artifact revision must be positive.");
  // Rehydrate all render projections from the persisted spec before creating
  // any bytes. A caller cannot hand preview one projection and export another.
  const draft = {
    ...draftFromWebsiteSpec(input.draft.spec, input.draft.brief),
    mode: input.draft.mode,
  } satisfies WebsiteDraft;
  const renderer = rendererSource();
  const rendererDigest = sha256(renderer);
  const capabilities = draft.spec.publishedCapabilities;
  const capabilityRuntime = capabilities ? capabilityRuntimeSource() : null;
  const contentHash = websiteSpecContentHash(draft.spec);
  const previewHtml = websiteDraftPreviewHtml(draft);
  const site = {
    version: 1,
    siteName: draft.spec.siteName,
    content: draft.content,
    pages: draft.pages,
    theme: draft.theme,
    contentHash,
    rendererDigest,
    ...(capabilities ? { publishedCapabilities: capabilities } : {}),
  };
  const renderedPages = renderGeneratedPages(websiteDraftRenderData(draft));
  const files: WebsiteArtifactFile[] = [
    file("package.json", packageJson()),
    file("scripts/build-site.mjs", buildScript()),
    file("website-generation/renderer.mjs", renderer),
    ...(capabilityRuntime ? [file("website-generation/capability-runtime.mjs", capabilityRuntime)] : []),
    file("site/site.json", canonicalJson(site) + "\n"),
    file("site/website-spec.json", canonicalJson(draft.spec) + "\n"),
    ...Object.entries(renderedPages).map(([slug, html]) => file(slug === "home" ? "site/index.html" : `site/${slug}/index.html`, html)),
    file("README.md", readme(input, contentHash, rendererDigest)),
  ].sort((a, b) => a.path.localeCompare(b.path));
  // The static home page is the browser preview; if a custom page map ever
  // omits it, fail before a candidate can be handed to a launch adapter.
  const home = files.find((item) => item.path === "site/index.html");
  if (!home || home.content !== previewHtml) throw new Error("Website preview and exported home page diverged.");
  const digest = artifactDigest(input, contentHash, files);
  files.push(file("artifact-manifest.json", manifest(input, contentHash, rendererDigest, digest)));
  const generatedAt = new Date(input.generatedAt ?? "2026-01-01T00:00:00.000Z").toISOString();
  const candidate = websiteArtifactSchema.parse({
    kind: "website_candidate",
    revision: input.revision,
    spec: draft.spec,
    contentHash,
    rendererDigest,
    artifactDigest: digest,
    preview: { href: normalizePreviewHref(input.workId, input.revision, input.previewHref), revision: input.revision, contentHash },
    generatedAt,
  });
  return { version: 1, workspaceId: input.workspaceId, workId: input.workId, revision: input.revision, mode: draft.mode, contentHash, rendererDigest, artifactDigest: digest, candidate, spec: draft.spec, previewHtml, files, generatedAt };
}

export function assertWebsiteArtifactBundle(bundle: WebsiteArtifactBundle): void {
  for (const item of bundle.files) {
    if (sha256(item.content) !== item.sha256 || Buffer.byteLength(item.content, "utf8") !== item.bytes) throw new Error(`Website artifact file ${item.path} changed after hashing.`);
  }
  const home = bundle.files.find((item) => item.path === "site/index.html");
  if (!home || home.content !== bundle.previewHtml) throw new Error("Website preview is not the exported home file.");
  const renderer = bundle.files.find((item) => item.path === "website-generation/renderer.mjs");
  if (!renderer || renderer.sha256 !== bundle.rendererDigest || bundle.candidate.rendererDigest !== bundle.rendererDigest || bundle.candidate.artifactDigest !== bundle.artifactDigest) {
    throw new Error("Website renderer digest does not match the immutable candidate bundle.");
  }
  const withoutManifest = bundle.files.filter((item) => item.path !== "artifact-manifest.json");
  const expected = sha256(canonicalJson({
    version: 1,
    workspaceId: bundle.workspaceId,
    workId: bundle.workId,
    revision: bundle.revision,
    contentHash: bundle.contentHash,
    files: withoutManifest.map((item) => [item.path, item.sha256, item.bytes]),
  }));
  if (expected !== bundle.artifactDigest) throw new Error("Website artifact digest does not match its files.");
  if (websiteSpecContentHash(bundle.spec) !== bundle.contentHash || websiteSpecContentHash(bundle.candidate.spec) !== bundle.contentHash) {
    throw new Error("Website artifact candidate spec does not match its content hash.");
  }
  if (canonicalJson(bundle.candidate.spec) !== canonicalJson(bundle.spec)) {
    throw new Error("Website artifact candidate spec does not match the exported spec.");
  }
}

export function websiteCandidateFromBundle(bundle: WebsiteArtifactBundle): WebsiteArtifact {
  assertWebsiteArtifactBundle(bundle);
  return websiteArtifactSchema.parse(bundle.candidate);
}

export { websiteSpecContentHash };
