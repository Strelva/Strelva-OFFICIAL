import { load } from "cheerio";
import { buildWebsiteArtifact, assertWebsiteArtifactBundle } from "./artifact";
import { draftFromWebsiteSpec, websiteSpecContentHash } from "./generation";
import type { WebsiteRecord } from "./contracts";

export class WebsiteCandidateMismatchError extends Error {}
export interface WebsiteCandidateSelection { revision: number; contentHash: string; page?: string }

function bundleFor(record: WebsiteRecord, selection: WebsiteCandidateSelection) {
  const candidate = record.website.candidate;
  if (!candidate || candidate.revision !== selection.revision || candidate.contentHash !== selection.contentHash) {
    throw new WebsiteCandidateMismatchError("This preview is no longer the current candidate. Reopen the saved website.");
  }
  if (websiteSpecContentHash(candidate.spec) !== candidate.contentHash) {
    throw new WebsiteCandidateMismatchError("The saved candidate changed after its content hash was recorded.");
  }
  const bundle = buildWebsiteArtifact({
    workspaceId: record.workspaceId, workId: record.workId, revision: candidate.revision,
    draft: draftFromWebsiteSpec(candidate.spec, record.website.brief), generatedAt: candidate.generatedAt,
    previewHref: candidate.preview.href,
  });
  if (bundle.rendererDigest !== candidate.rendererDigest) {
    throw new WebsiteCandidateMismatchError("The website renderer changed after this candidate was saved. Regenerate the preview before using it.");
  }
  if (bundle.artifactDigest !== candidate.artifactDigest) {
    throw new WebsiteCandidateMismatchError("The saved website export changed after approval. Regenerate the preview before using it.");
  }
  assertWebsiteArtifactBundle(bundle);
  return bundle;
}

export function renderWebsiteCandidate(record: WebsiteRecord, selection: WebsiteCandidateSelection): string {
  const bundle = bundleFor(record, selection);
  const page = selection.page || "home";
  if (!/^[a-zA-Z0-9_-]+$/.test(page)) throw new WebsiteCandidateMismatchError("This preview page is unavailable.");
  const path = page === "home" ? "site/index.html" : `site/${page}/index.html`;
  const file = bundle.files.find(entry => entry.path === path);
  if (!file) throw new WebsiteCandidateMismatchError("This preview page is unavailable.");
  const html = load(file.content);
  const pages = new Set(bundle.files.filter(entry => /^site\/(?:[^/]+\/)?index\.html$/.test(entry.path)).map(entry => entry.path === "site/index.html" ? "/" : `/${entry.path.split("/")[1]}`));
  html("a[href]").each((_, element) => {
    const anchor = html(element);
    const href = anchor.attr("href") || "";
    const [pathname = "", hash] = href.split("#", 2);
    if (!pages.has(pathname)) return;
    const query = new URLSearchParams({ revision: String(selection.revision), contentHash: selection.contentHash, page: pathname === "/" ? "home" : pathname.slice(1) });
    anchor.attr("href", `/api/websites/${encodeURIComponent(record.workId)}/preview?${query}${hash ? `#${encodeURIComponent(hash)}` : ""}`);
  });
  return html.html();
}

/** Portable, uncompressed ustar archive. Only generated project files enter it. */
export function exportWebsiteCandidate(record: WebsiteRecord, selection: WebsiteCandidateSelection): Uint8Array {
  const bundle = bundleFor(record, selection);
  const blocks: Buffer[] = [];
  for (const file of bundle.files) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(file.path) || file.path.startsWith("/") || file.path.split("/").includes("..") || Buffer.byteLength(file.path) > 100) {
      throw new WebsiteCandidateMismatchError("The exported project contains an invalid file path.");
    }
    const content = Buffer.from(file.content, "utf8");
    const header = Buffer.alloc(512);
    header.write(file.path, 0, 100, "utf8");
    const octal = (value: number, offset: number, length: number) => header.write(value.toString(8).padStart(length - 1, "0") + "\0", offset, length, "ascii");
    octal(0o644, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
    octal(content.length, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156); header.write("0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii"); header.write("00", 263, 2, "ascii");
    const checksum = header.reduce((sum, value) => sum + value, 0);
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    blocks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return new Uint8Array(Buffer.concat(blocks));
}
