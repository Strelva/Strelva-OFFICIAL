import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLocalPinnedConsumerChecks } from "../../scripts/custom-repo-pinned-check";
import type { WorkspaceManifest } from "../../scripts/custom-repo-workspace-check";

const owned: string[] = [];
afterEach(() => { for (const root of owned.splice(0)) rmSync(root, { recursive: true, force: true }); });
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const commit = (cwd: string) => {
  git(cwd, "add", ".");
  git(cwd, "-c", "user.name=Local fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "Fictional consumer source");
  return git(cwd, "rev-parse", "HEAD");
};
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "strelva-pinned-consumers-")); owned.push(root);
  const cwd = path.join(root, "platform"); const sourceRoot = path.join(root, "sources"); const source = path.join(sourceRoot, "fixture-site");
  mkdirSync(cwd); mkdirSync(source, { recursive: true }); git(source, "init"); git(cwd, "init");
  writeFileSync(path.join(source, "index.html"), "<!doctype html>Fixture");
  const pin = commit(source);
  git(source, "update-ref", "refs/remotes/origin/main", pin);
  const manifest: WorkspaceManifest = { contractVersion: "v1", customRepoWorkspace: {
    profiles: { "static-site": { requiredFiles: ["index.html"], packageScripts: [] } },
    repos: [{ tenant: "fixture", profile: "static-site", localPath: "../fixture-site", compatibleCommit: pin, tenantConfirmed: false }],
  } };
  const saveManifest = () => writeFileSync(path.join(cwd, "release-manifest.json"), JSON.stringify(manifest)); saveManifest(); commit(cwd);
  const run = () => runLocalPinnedConsumerChecks({ cwd, sourceRoot });
  return { root, cwd, sourceRoot, source, pin, manifest, saveManifest, run };
}

describe("local pinned consumer materialization", () => {
  it("checks the reviewed pin from a later dirty owner source without changing that source", () => {
    const f = fixture(); writeFileSync(path.join(f.source, "later.txt"), "Later source"); const newer = commit(f.source);
    writeFileSync(path.join(f.source, "index.html"), "Owner's unfinished work");
    const before = git(f.source, "status", "--porcelain");
    const { receipt, receiptPath, checkoutRoot } = f.run();
    expect(receipt.summary.failed).toBe(0); expect(receipt.summary.skipped).toBe(0);
    expect(receipt.platform.changedPathCount).toBe(0);
    expect(receipt.consumers[0]).toMatchObject({ pin: f.pin, tenantConfirmed: false, deployedCommit: null,
      localSource: { head: newer, changedPathCount: 1 }, originRefs: [{ ref: "origin/main", commit: f.pin }], checkout: { head: f.pin, changedPathCount: 0 } });
    expect(readFileSync(path.join(checkoutRoot, "fixture", "index.html"), "utf8")).toBe("<!doctype html>Fixture");
    expect(existsSync(path.join(checkoutRoot, "fixture", "later.txt"))).toBe(false);
    expect(JSON.parse(readFileSync(receiptPath, "utf8"))).toEqual(receipt);
    expect(git(f.source, "rev-parse", "HEAD")).toBe(newer); expect(git(f.source, "status", "--porcelain")).toBe(before);
    expect(readFileSync(path.join(f.source, "index.html"), "utf8")).toBe("Owner's unfinished work");
  });
  it.each(["missing-source", "missing-pin"])("fails %s without skip or owner-source fallback", failure => {
    const f = fixture();
    if (failure === "missing-source") f.manifest.customRepoWorkspace!.repos![0]!.localPath = "../absent-site";
    else f.manifest.customRepoWorkspace!.repos![0]!.compatibleCommit = "0".repeat(40);
    f.saveManifest(); const { receipt } = f.run();
    expect(receipt.summary.failed).toBeGreaterThan(0); expect(receipt.summary.skipped).toBe(0);
    expect(receipt.consumers[0]!.error).toBe(failure === "missing-source" ? "source-missing" : "pin-unavailable-locally");
    expect(receipt.consumers[0]!.checkout).toBeNull();
    expect(receipt.results).toContainEqual(expect.objectContaining({ name: "fixture:sibling", ok: false }));
  });
  it.each(["short-pin", "tenant-traversal", "source-traversal", "source-url", "duplicate-tenant"])("rejects %s before creating checkouts", failure => {
    const f = fixture(); const repo = f.manifest.customRepoWorkspace!.repos![0]!;
    if (failure === "short-pin") repo.compatibleCommit = f.pin.slice(0, 7);
    if (failure === "tenant-traversal") repo.tenant = "../outside";
    if (failure === "source-traversal") repo.localPath = "../../outside";
    if (failure === "source-url") repo.localPath = "https://example.invalid/repo";
    if (failure === "duplicate-tenant") f.manifest.customRepoWorkspace!.repos!.push({ ...repo });
    f.saveManifest(); expect(f.run).toThrow(); expect(existsSync(path.join(f.cwd, ".validation-artifacts"))).toBe(false);
  });
  it("refuses an output inside an owner repo, including a symlink ancestor", () => {
    const f = fixture(); const link = path.join(f.root, "linked-output"); symlinkSync(f.source, link);
    for (const outputParent of [path.join(f.source, "proof"), path.join(link, "proof")]) {
      expect(() => runLocalPinnedConsumerChecks({ cwd: f.cwd, sourceRoot: f.sourceRoot, outputParent })).toThrow(/consumer source folder/);
    }
    expect(existsSync(path.join(f.source, "proof"))).toBe(false); expect(git(f.source, "status", "--porcelain")).toBe("");
  });
  it("a broken pinned consumer fails the existing call-site guard, rather than silently accepting its current file", () => {
    const f = fixture(); const repo = f.manifest.customRepoWorkspace!.repos![0]!;
    writeFileSync(path.join(f.source, "beacon.ts"), "// removed the track call\n"); repo.compatibleCommit = commit(f.source);
    repo.v1Endpoints = ["track"]; repo.v1CallSites = [{ endpoint: "track", file: "beacon.ts", bodyFields: ["event"] }]; f.saveManifest();
    const { receipt } = f.run();
    expect(receipt.results).toContainEqual(expect.objectContaining({ name: "fixture:v1:track:beacon.ts:path", ok: false }));
    expect(receipt.summary.skipped).toBe(0);
  });
  it("applies the named consumer profile at the pin", () => {
    const f = fixture(); f.manifest.customRepoWorkspace!.profiles!["static-site"]!.requiredFiles!.push("missing-contract.js"); f.saveManifest();
    expect(f.run().receipt.results).toContainEqual(expect.objectContaining({ name: "fixture:file:missing-contract.js", ok: false }));
  });
  it("does not resolve a plain directory through its parent's git repository", () => {
    const f = fixture(); const child = path.join(f.sourceRoot, "plain-folder"); mkdirSync(child); git(f.sourceRoot, "init");
    f.manifest.customRepoWorkspace!.repos![0]!.localPath = "../plain-folder"; f.saveManifest();
    expect(f.run().receipt.consumers[0]!.error).toBe("source-not-a-repository-root");
  });
});
