/** Local-only C02 preparation. No remote checkout, new credential or consumer build. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runWorkspaceChecks, resolveRepoChecks, type CheckResult, type WorkspaceManifest } from "./custom-repo-workspace-check";

// Do not forward GIT_DIR, alternate object paths, credential helpers or caller secrets.
export const LOCAL_PIN_GIT_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH, NODE_ENV: "test",
  GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
  GIT_ALLOW_PROTOCOL: "file", GIT_NO_LAZY_FETCH: "1", GIT_LFS_SKIP_SMUDGE: "1",
};
const git = (cwd: string, args: string[]) => execFileSync("git", ["--no-replace-objects", "-c", "core.hooksPath=/dev/null", ...args], {
  cwd, env: LOCAL_PIN_GIT_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024,
}).trim();
const dirtyCount = (cwd: string) => {
  const status = git(cwd, ["status", "--porcelain", "--untracked-files=normal"]);
  return status ? status.split("\n").length : 0;
};
const within = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

export type ConsumerPinEvidence = {
  tenant: string; profile: string; pin: string; pinSource: string | null; tenantConfirmed: boolean | null; tenantEvidence: string | null;
  localSource: { path: string; head: string | null; changedPathCount: number | null };
  /** Local remote-tracking refs only. No origin fetch or deployed metadata read. */
  originRefs: Array<{ ref: string; commit: string }>;
  deployedCommit: null;
  checkout: { path: string; head: string; changedPathCount: number } | null;
  error?: string;
  checks: CheckResult[];
};

export function runLocalPinnedConsumerChecks(input: {
  cwd: string;
  /** Parent containing the existing nine local consumer clones. */
  sourceRoot: string;
  /** The function owns only a newly created subdirectory here; it never deletes it. */
  outputParent?: string;
}) {
  const cwd = realpathSync(input.cwd);
  const manifestBytes = readFileSync(path.join(cwd, "release-manifest.json"));
  const platformSource = { commit: git(cwd, ["rev-parse", "HEAD"]), changedPathCount: dirtyCount(cwd), manifestSha256: createHash("sha256").update(manifestBytes).digest("hex") };
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as WorkspaceManifest;
  const repos = manifest.customRepoWorkspace?.repos;
  if (!repos?.length) throw new Error("Pinned proof requires an explicit nonempty consumer inventory.");
  const tenants = new Set<string>(); const sourcePaths = new Set<string>();
  for (const repo of repos) {
    if (!/^[a-z0-9-]+$/.test(repo.tenant) || tenants.has(repo.tenant)) throw new Error("Pinned proof requires unique valid tenant identifiers.");
    tenants.add(repo.tenant);
    if (!repo.compatibleCommit || !/^[0-9a-f]{40}$/.test(repo.compatibleCommit)) throw new Error(`Pinned proof requires a full reviewed commit for ${repo.tenant}.`);
    // Existing manifest sibling layout only; never accept a URL or path traversal.
    if (!/^\.\.\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo.localPath) || sourcePaths.has(repo.localPath)) throw new Error(`Invalid or duplicate local source path for ${repo.tenant}.`);
    sourcePaths.add(repo.localPath);
  }
  resolveRepoChecks(manifest, input.sourceRoot, cwd); // validate named profiles before materialization
  const sourceRoot = realpathSync(input.sourceRoot);
  const outputParent = path.resolve(input.outputParent ?? path.join(cwd, ".validation-artifacts", "custom-repo-pins"));
  const sources = repos.map(repo => path.join(sourceRoot, path.basename(repo.localPath)));
  if (sources.some(source => within(source, outputParent))) throw new Error("Proof output must not be inside a consumer source folder.");
  // Resolve existing symlink ancestors before creating anything, including a new output parent.
  let ancestor = outputParent;
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const resolvedOutputParent = path.join(realpathSync(ancestor), path.relative(ancestor, outputParent));
  if (sources.some(source => within(existsSync(source) ? realpathSync(source) : source, resolvedOutputParent))) {
    throw new Error("Resolved proof output must not be inside a consumer source folder.");
  }
  mkdirSync(resolvedOutputParent, { recursive: true });
  const outputRoot = mkdtempSync(path.join(resolvedOutputParent, "v1-pinned-"));
  const checkoutRoot = path.join(outputRoot, "checkouts"); mkdirSync(checkoutRoot);
  const evidence: ConsumerPinEvidence[] = [];
  const preparation: CheckResult[] = [];
  for (const repo of repos) {
    const source = path.join(sourceRoot, path.basename(repo.localPath));
    const checkoutPath = path.join(checkoutRoot, repo.tenant);
    const entry: ConsumerPinEvidence = {
      tenant: repo.tenant, profile: repo.profile ?? "baseline", pin: repo.compatibleCommit!, pinSource: repo.pinSource ?? null,
      tenantConfirmed: repo.tenantConfirmed ?? null, tenantEvidence: repo.tenantEvidence ?? null,
      localSource: { path: source, head: null, changedPathCount: null }, originRefs: [], deployedCommit: null, checkout: null, checks: [],
    };
    evidence.push(entry);
    try {
      if (!existsSync(source)) throw new Error("source-missing");
      if (!within(sourceRoot, realpathSync(source))) throw new Error("source-outside-root");
      // Refuse a plain child directory that git would resolve to somebody's parent repo.
      if (realpathSync(git(source, ["rev-parse", "--show-toplevel"])) !== realpathSync(source)) throw new Error("source-not-a-repository-root");
      entry.localSource.head = git(source, ["rev-parse", "HEAD"]);
      entry.localSource.changedPathCount = dirtyCount(source);
      entry.originRefs = git(source, ["for-each-ref", "--format=%(refname:short) %(objectname)", "refs/remotes/origin"])
        .split("\n").filter(Boolean).map(line => { const [ref, commit] = line.split(" "); return { ref: ref!, commit: commit! }; });
      try { git(source, ["cat-file", "-e", `${entry.pin}^{commit}`]); } catch { throw new Error("pin-unavailable-locally"); }
      mkdirSync(checkoutPath);
      git(checkoutPath, ["init", "--quiet"]);
      git(checkoutPath, ["config", "core.hooksPath", "/dev/null"]);
      git(checkoutPath, ["fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--depth=1", source, entry.pin]);
      git(checkoutPath, ["checkout", "--quiet", "--detach", entry.pin]);
      entry.checkout = { path: checkoutPath, head: git(checkoutPath, ["rev-parse", "HEAD"]), changedPathCount: dirtyCount(checkoutPath) };
      preparation.push({ name: `${repo.tenant}:materialize:pin`, ok: true });
    } catch (error) {
      // Never emit git stderr: URLs or caller configuration could contain credentials.
      const reason = error instanceof Error && ["source-missing", "source-outside-root", "source-not-a-repository-root", "pin-unavailable-locally"].includes(error.message)
        ? error.message : "local-pin-materialization-failed";
      entry.error = reason;
      preparation.push({ name: `${repo.tenant}:materialize:pin`, ok: false, detail: reason });
    }
  }
  const results = [...preparation, ...runWorkspaceChecks(manifest, outputRoot, cwd, {
    verifyPins: true, checkoutRoot, gitEnvironment: LOCAL_PIN_GIT_ENV,
  })];
  for (const entry of evidence) entry.checks = results.filter(result => result.name.startsWith(`${entry.tenant}:`));
  const receipt = {
    schemaVersion: 1, observedAt: new Date().toISOString(), proof: "local-pinned-source-only",
    platform: platformSource,
    limitations: ["Origin refs are already-fetched local metadata; freshness unknown.", "Deployed commits were not read.", "No hosted CI, Auth, provider, customer mapping or consumer build proof."],
    summary: { consumers: evidence.length, passed: results.filter(r => r.ok && !r.skipped).length, failed: results.filter(r => !r.ok).length, skipped: results.filter(r => r.skipped).length },
    consumers: evidence, results,
  };
  const receiptPath = path.join(outputRoot, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  return { results, checkoutRoot, receiptPath, receipt };
}
