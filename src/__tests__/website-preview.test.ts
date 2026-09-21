import { describe, expect, it } from "vitest";
import { generateWebsiteArtifact } from "@/products/websites/generation";
import { exportWebsiteCandidate, renderWebsiteCandidate } from "@/products/websites/preview";
import type { WebsiteRecord } from "@/products/websites/contracts";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

async function fixture() {
  const brief = { businessName: "Juniper Bread", description: "Fresh bread for Saturday pickup.", primaryCallToAction: "Contact us" };
  const bundle = await generateWebsiteArtifact({ workspaceId: "workspace", workId: "website", revision: 1, brief });
  const record: WebsiteRecord = { workId: "website", workspaceId: "workspace", createdAt: bundle.generatedAt, updatedAt: bundle.generatedAt, website: {
    version: 1, revision: 1, title: brief.businessName, brief, candidate: bundle.candidate, status: "preview_ready", approvedCandidateRevision: null,
    launch: { status: "not_requested", candidateRevision: null, receipt: null, failure: null }, lastError: null, createdBy: "owner", createdAt: bundle.generatedAt, history: [],
  } };
  return { bundle, record, selection: { revision: 1, contentHash: bundle.contentHash } };
}

describe("saved website preview and export", () => {
  it("renders the exact saved candidate and preserves navigation inside its private preview", async () => {
    const { record, selection } = await fixture();
    const html = renderWebsiteCandidate(record, selection);
    expect(html).toContain("Juniper Bread");
    expect(html).toContain("Fresh bread for Saturday pickup.");
    expect(html).toContain("/api/websites/website/preview?");
    expect(html).toContain("page=about");
    expect(renderWebsiteCandidate(record, { ...selection, page: "about" })).toContain("Juniper Bread");
  });
  it("rejects stale, tampered and missing candidate pages", async () => {
    const { record, selection } = await fixture();
    expect(() => renderWebsiteCandidate(record, { ...selection, revision: 2 })).toThrow(/current|revision/i);
    expect(() => exportWebsiteCandidate(record, { ...selection, contentHash: "0".repeat(64) })).toThrow(/current|hash/i);
    expect(() => renderWebsiteCandidate(record, { ...selection, page: "../../secret" })).toThrow(/page/i);
    record.website.candidate!.spec.siteName = "Changed after approval";
    expect(() => exportWebsiteCandidate(record, selection)).toThrow(/hash|changed/i);
  });
  it("exports a tar project containing the exact persisted content and runnable build", async () => {
    const { record, selection } = await fixture();
    const bytes = exportWebsiteCandidate(record, selection);
    expect(bytes.byteLength % 512).toBe(0);
    const archive = Buffer.from(bytes).toString("utf8");
    expect(archive).toContain("scripts/build-site.mjs");
    expect(archive).toContain("site/website-spec.json");
    expect(archive).toContain(selection.contentHash);
    expect(archive).toContain("Juniper Bread");
    expect(archive).toContain("ustar");
    const directory = mkdtempSync(join(tmpdir(), "strelva-website-export-"));
    try {
      const archivePath = join(directory, "website.tar");
      writeFileSync(archivePath, bytes);
      execFileSync("tar", ["-xf", archivePath, "-C", directory]);
      execFileSync(process.execPath, ["scripts/build-site.mjs"], { cwd: directory });
      expect(JSON.parse(readFileSync(join(directory, "dist/build-receipt.json"), "utf8")).contentHash).toBe(selection.contentHash);
      expect(readFileSync(join(directory, "dist/index.html"), "utf8")).toBe(readFileSync(join(directory, "site/index.html"), "utf8"));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("requires a new preview when the saved renderer fingerprint differs", async () => {
    const { record, selection } = await fixture();
    record.website.candidate!.rendererDigest = "0".repeat(64);
    expect(() => renderWebsiteCandidate(record, selection)).toThrow(/renderer|regenerate/i);
    expect(() => exportWebsiteCandidate(record, selection)).toThrow(/renderer|regenerate/i);
  });
  it("rejects changed export files even when the content and renderer still match", async () => {
    const { record, selection } = await fixture();
    record.website.candidate!.artifactDigest = "0".repeat(64);
    expect(() => renderWebsiteCandidate(record, selection)).toThrow(/export changed|regenerate/i);
    expect(() => exportWebsiteCandidate(record, selection)).toThrow(/export changed|regenerate/i);
  });
});
