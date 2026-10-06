import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runWorkspaceChecks } from "../../scripts/custom-repo-workspace-check";

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function checkout() {
  const folder = mkdtempSync(join(tmpdir(), "strelva-release-pin-"));
  folders.push(folder);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: folder, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init");
  writeFileSync(join(folder, "package.json"), "{}");
  writeFileSync(join(folder, "release-manifest.json"), JSON.stringify({ contractVersion: "v1", requiredEnv: [] }));
  git("add", ".");
  git("-c", "user.name=Release fixture", "-c", "user.email=fixture@example.test", "-c", "core.hooksPath=/dev/null", "commit", "-m", "Synthetic release");
  const pin = git("rev-parse", "HEAD");
  const manifest = { contractVersion: "v1", customRepoWorkspace: { repos: [{ tenant: "fixture", localPath: folder, compatibleCommit: pin }] } };
  return { folder, git, manifest };
}

it("rejects a different client revision even when its structural contract still passes", () => {
  const { folder, git, manifest } = checkout();
  writeFileSync(join(folder, "README.md"), "A later revision");
  git("add", "README.md");
  git("-c", "user.name=Release fixture", "-c", "user.email=fixture@example.test", "-c", "core.hooksPath=/dev/null", "commit", "-m", "Later revision");
  const results = runWorkspaceChecks(manifest, folder, folder, { verifyPins: true });
  expect(results).toContainEqual(expect.objectContaining({ name: "fixture:release:checkout", ok: false }));
});

it("rejects changed client source at the correct pinned revision", () => {
  const { folder, manifest } = checkout();
  writeFileSync(join(folder, "package.json"), "{\"name\":\"changed\"}");
  expect(runWorkspaceChecks(manifest, folder, folder, { verifyPins: true }))
    .toContainEqual(expect.objectContaining({ name: "fixture:release:clean", ok: false }));
});

it("does not count an absent client checkout as release proof", () => {
  const { folder, manifest } = checkout();
  manifest.customRepoWorkspace.repos[0]!.localPath = join(folder, "absent");
  expect(runWorkspaceChecks(manifest, folder, folder, { verifyPins: true }))
    .toContainEqual(expect.objectContaining({ name: "fixture:sibling", ok: false }));
  expect(runWorkspaceChecks(manifest, folder, folder))
    .toContainEqual(expect.objectContaining({ name: "fixture:sibling", ok: true, skipped: true }));
});

it("accepts a clean checkout at the exact compatible revision", () => {
  const { folder, manifest } = checkout();
  const results = runWorkspaceChecks(manifest, folder, folder, { verifyPins: true });
  expect(results.filter((result) => !result.ok || result.skipped)).toEqual([]);
  expect(results).toContainEqual(expect.objectContaining({ name: "fixture:release:checkout", ok: true }));
  expect(results).toContainEqual(expect.objectContaining({ name: "fixture:release:clean", ok: true }));
});

it("checks the selected isolated client checkout instead of the ordinary working folder", () => {
  const { folder, manifest } = checkout();
  const checkoutRoot = mkdtempSync(join(tmpdir(), "strelva-client-checkouts-"));
  folders.push(checkoutRoot);
  renameSync(folder, join(checkoutRoot, "fixture"));
  const results = runWorkspaceChecks(manifest, folder, process.cwd(), { verifyPins: true, checkoutRoot });
  expect(results.filter(result => !result.ok || result.skipped)).toEqual([]);
  expect(results).toContainEqual(expect.objectContaining({ name: "fixture:release:checkout", ok: true }));
});

it("fails when an explicitly selected checkout is absent even if the ordinary checkout is valid", () => {
  const { folder, manifest } = checkout();
  const results = runWorkspaceChecks(manifest, folder, process.cwd(), { verifyPins: true, checkoutRoot: join(folder, "unprepared") });
  expect(results).toContainEqual(expect.objectContaining({ name: "fixture:sibling", ok: false }));
  expect(results.some(result => result.name === "fixture:release:checkout" && result.ok)).toBe(false);
});

it("reads v1 call sites at the pinned commit, not the owner's working tree", () => {
  const { folder, git, manifest } = checkout();
  writeFileSync(join(folder, "beacon.ts"), "fetch(`${base}/api/v1/track/${tenant}`, { body: JSON.stringify({ event }) });\n");
  git("add", "beacon.ts");
  git("-c", "user.name=Release fixture", "-c", "user.email=fixture@example.test", "-c", "core.hooksPath=/dev/null", "commit", "-m", "Add beacon");
  const repo = { ...manifest.customRepoWorkspace.repos[0]!, compatibleCommit: git("rev-parse", "HEAD"), v1Endpoints: ["track"],
    v1CallSites: [{ endpoint: "track", file: "beacon.ts", bodyFields: ["event"] }] };
  const pinned = { contractVersion: "v1", customRepoWorkspace: { repos: [repo] } };
  // The owner's uncommitted edit removes the call; the pinned revision still has it.
  writeFileSync(join(folder, "beacon.ts"), "// beacon removed locally\n");
  const results = runWorkspaceChecks(pinned, folder, process.cwd());
  expect(results).toContainEqual(expect.objectContaining({ name: "fixture:v1:source", detail: expect.stringContaining("at pin") }));
  expect(results.filter((result) => result.name.startsWith("fixture:v1:") && !result.ok)).toEqual([]);
  // A pin the clone does not have falls back to the working tree, and says so.
  const missingPin = { contractVersion: "v1", customRepoWorkspace: { repos: [{ ...repo, compatibleCommit: "0".repeat(40) }] } };
  const fallback = runWorkspaceChecks(missingPin, folder, process.cwd());
  expect(fallback).toContainEqual(expect.objectContaining({ name: "fixture:v1:source", detail: expect.stringContaining("working tree") }));
  expect(fallback).toContainEqual(expect.objectContaining({ name: "fixture:v1:track:beacon.ts:path", ok: false }));
});

it("explains how a mismatched checkout relates to the pin", () => {
  const { folder, git, manifest } = checkout();
  writeFileSync(join(folder, "README.md"), "Later");
  git("add", "README.md");
  git("-c", "user.name=Release fixture", "-c", "user.email=fixture@example.test", "-c", "core.hooksPath=/dev/null", "commit", "-m", "Later");
  const result = runWorkspaceChecks(manifest, folder, folder, { verifyPins: true }).find((r) => r.name === "fixture:release:checkout");
  expect(result).toMatchObject({ ok: false, detail: expect.stringContaining("1 commit(s) ahead of the pin") });
});

it("does not require package.json or a release manifest from a profile that has neither", () => {
  const { folder, manifest } = checkout();
  const staticManifest = {
    contractVersion: "v1",
    customRepoWorkspace: {
      profiles: { "static-site": { packageScripts: [], requiredFiles: ["index.html"] } },
      repos: [{ ...manifest.customRepoWorkspace.repos[0]!, profile: "static-site" }],
    },
  };
  writeFileSync(join(folder, "index.html"), "<!doctype html>");
  const results = runWorkspaceChecks(staticManifest, folder, folder);
  expect(results.filter((result) => !result.ok)).toEqual([]);
  expect(results.some((result) => result.name === "fixture:file:package.json")).toBe(false);
  expect(results.some((result) => result.name.startsWith("fixture:release:"))).toBe(false);
});
