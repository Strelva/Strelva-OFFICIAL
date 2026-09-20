import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
