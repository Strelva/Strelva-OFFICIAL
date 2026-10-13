import { existsSync, readFileSync } from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { runPlatformContractConformance } from "./custom-repo-conformance";
import { checkV1CallSites, type V1CallSite } from "./custom-repo-v1-contracts";

/**
 * Custom-repo workspace check. Two kinds of proof, kept honest about which is which:
 *
 *  1. CONTRACT conformance is proven by EXECUTION (`runPlatformContractConformance`):
 *     it signs + verifies a real revalidation payload and builds a capability manifest
 *     that it runs through the control plane's own Zod schema. This runs with NO sibling
 *     client repo checked out — it exercises the platform plus the `custom-repo-starter`
 *     scaffold every custom repo drops in. It REPLACED the old `source.includes(marker)`
 *     greps, which only proved a string was present, never that the contract worked.
 *
 *  2. STRUCTURAL checks stay file-existence: a sibling repo must have the required files,
 *     package scripts, and a `release-manifest.json` pinned to the contract version. When
 *     a sibling repo is NOT checked out (the normal laptop state), it is recorded SKIPPED,
 *     not FAILED, so the check is green on a machine without the siblings.
 *
 * The ENTIRE workspace topology — which repos exist, their local paths, per-repo
 * required files/scripts/env, and the compatible commit — lives in
 * `release-manifest.json` under `customRepoWorkspace` (a shared `baseline` every
 * repo must meet + per-repo extras). Adding a client repo is a manifest entry, NOT
 * a code edit — that's the whole point of the repair (the old checker hard-coded a
 * 2-tenant array that would need editing for every new client).
 *
 * Repos that are not built on the REB content contract (static sites, sites that
 * only send tracker/lead beacons) name a `profile` from `customRepoWorkspace.profiles`
 * instead of inheriting `baseline`. A repo with no `profile` gets `baseline`
 * exactly as before, so the gldf/rohlax checks are unchanged.
 *
 *  3. V1 CALL SITES: each repo's `v1CallSites` are read at the pinned
 *     `compatibleCommit` (the revision the manifest claims is compatible), not the
 *     owner's working tree, and checked by `checkV1CallSites`. When the pin is not
 *     in the local clone, the working tree is read and the detail says so.
 */

export type CheckResult = {
  name: string;
  ok: boolean;
  skipped?: boolean;
  detail?: string;
};

/** A repo's resolved requirements = workspace baseline + the repo's own extras. */
type RepoCheck = {
  tenant: string;
  repoDir: string;
  profile: string;
  v1Endpoints: string[];
  v1CallSites: V1CallSite[];
  packageScripts: string[];
  requiredFiles: string[];
  releaseRequiredEnv: string[];
  compatibleCommit: string | null;
};

type Requirements = { packageScripts?: string[]; requiredFiles?: string[]; requiredEnv?: string[]; description?: string };

export type WorkspaceManifest = {
  contractVersion?: string;
  customRepoWorkspace?: {
    contractVersion?: string;
    baseline?: Requirements;
    /** Named alternatives to `baseline` for repos not built on the REB content contract. */
    profiles?: Record<string, Requirements>;
    repos?: Array<{
      tenant: string;
      localPath: string;
      /** Name in `profiles`; omitted = `baseline`. */
      profile?: string;
      compatibleCommit?: string;
      v1Endpoints?: string[];
      v1CallSites?: V1CallSite[];
      /** false when the slug could not be confirmed against live data. */
      tenantConfirmed?: boolean;
      tenantEvidence?: string;
      pinSource?: string;
      notes?: string;
      packageScripts?: string[];
      requiredFiles?: string[];
      requiredEnv?: string[];
    }>;
  };
};

/** Merge the shared baseline with a repo's extras (deduped, order-stable). The
 *  pure core, unit-tested so "add a repo = manifest entry" can't silently rot. */
export function resolveRepoChecks(manifest: WorkspaceManifest, workspaceRoot: string, cwd: string): RepoCheck[] {
  const ws = manifest.customRepoWorkspace;
  if (!ws?.repos) return [];
  const merge = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];
  return ws.repos.map((repo) => {
    if (!repo.localPath) throw new Error(`release-manifest.json: repo "${repo.tenant}" has no localPath`);
    const profile = repo.profile ?? "baseline";
    const base = repo.profile ? ws.profiles?.[repo.profile] : ws.baseline ?? {};
    if (!base) throw new Error(`release-manifest.json: repo "${repo.tenant}" names unknown profile "${repo.profile}"`);
    return {
      tenant: repo.tenant,
      repoDir: path.relative(workspaceRoot, path.resolve(cwd, repo.localPath)),
      profile,
      v1Endpoints: repo.v1Endpoints ?? [],
      v1CallSites: repo.v1CallSites ?? [],
      packageScripts: merge(base.packageScripts, repo.packageScripts),
      requiredFiles: merge(base.requiredFiles, repo.requiredFiles),
      releaseRequiredEnv: merge(base.requiredEnv, repo.requiredEnv),
      compatibleCommit: repo.compatibleCommit ?? null,
    };
  });
}

/** The contract version every sibling repo's own release-manifest must pin to. */
export function workspaceContractVersion(manifest: WorkspaceManifest): string {
  return manifest.customRepoWorkspace?.contractVersion ?? manifest.contractVersion ?? "v1";
}

// ── import-safe workspace checks ────────────────────────────────────────────

function git(cwd: string, args: string[], trim = true, env?: NodeJS.ProcessEnv): string {
  const out = execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return trim ? out.trim() : out;
}

function gitOk(cwd: string, args: string[], env?: NodeJS.ProcessEnv): boolean {
  try {
    execFileSync("git", args, { cwd, env, stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

/** Describe how the checked-out revision relates to the pin (read-only git). */
function lineage(repoPath: string, pin: string | null, actual: string, env?: NodeJS.ProcessEnv): string {
  if (!pin) return "no pin";
  if (!gitOk(repoPath, ["cat-file", "-e", `${pin}^{commit}`], env)) return "pin not in this clone";
  if (gitOk(repoPath, ["merge-base", "--is-ancestor", pin, actual], env)) {
    return `${git(repoPath, ["rev-list", "--count", `${pin}..${actual}`], true, env)} commit(s) ahead of the pin`;
  }
  if (gitOk(repoPath, ["merge-base", "--is-ancestor", actual, pin], env)) return "behind the pin";
  return "diverged from the pin";
}

/**
 * Run the executable contract and structural workspace checks without doing
 * any I/O at module load time or changing the process exit status. Keeping the
 * import-safe module makes it safe for Vitest and other callers to import the
 * manifest-resolution helpers without triggering a process exit.
 */
export function runWorkspaceChecks(
  manifest: WorkspaceManifest,
  workspaceRoot: string,
  cwd: string,
  options: { verifyPins?: boolean; checkoutRoot?: string; gitEnvironment?: NodeJS.ProcessEnv } = {},
): CheckResult[] {
  const results: CheckResult[] = [];
  const contractVersion = workspaceContractVersion(manifest);
  const repos = resolveRepoChecks(manifest, workspaceRoot, cwd).map(repo => options.checkoutRoot
    ? { ...repo, repoDir: path.relative(workspaceRoot, path.resolve(options.checkoutRoot, repo.tenant)) }
    : repo);

  function record(name: string, ok: boolean, detail?: string) {
    results.push({ name, ok, detail: ok ? undefined : detail });
  }
  function recordSkip(name: string, detail: string) {
    results.push({ name, ok: true, skipped: true, detail });
  }
  function checkCallSites(repo: RepoCheck, repoPath: string) {
    if (repo.v1Endpoints.length === 0 && repo.v1CallSites.length === 0) return;
    const pin = repo.compatibleCommit;
    const pinAvailable = Boolean(pin) && gitOk(repoPath, ["cat-file", "-e", `${pin}^{commit}`], options.gitEnvironment);
    const readSource = (file: string): string | null => {
      if (pinAvailable) {
        try {
          return git(repoPath, ["show", `${pin}:${file}`], false, options.gitEnvironment);
        } catch {
          return null;
        }
      }
      const full = path.join(repoPath, file);
      return existsSync(full) ? readFileSync(full, "utf8") : null;
    };
    results.push({
      name: `${repo.tenant}:v1:source`,
      ok: true,
      detail: pinAvailable ? `call sites read at pin ${pin!.slice(0, 7)}` : "pin not in local clone; call sites read from the working tree",
    });
    for (const r of checkV1CallSites({
      tenant: repo.tenant,
      v1Endpoints: repo.v1Endpoints,
      callSites: repo.v1CallSites,
      readSource,
      platformRoot: cwd,
    })) {
      record(r.name, r.ok, r.detail);
    }
  }
  function read(filePath: string): string {
    return readFileSync(filePath, "utf8");
  }
  function checkFile(repo: RepoCheck, relativePath: string): boolean {
    const fullPath = path.join(workspaceRoot, repo.repoDir, relativePath);
    const ok = existsSync(fullPath);
    record(`${repo.tenant}:file:${relativePath}`, ok, ok ? undefined : `missing at ${fullPath}`);
    return ok;
  }
  function checkPackageScripts(repo: RepoCheck) {
    // A static site has no package.json; a profile with no scripts skips this.
    if (repo.packageScripts.length === 0) return;
    if (!checkFile(repo, "package.json")) return;
    const pkg = JSON.parse(read(path.join(workspaceRoot, repo.repoDir, "package.json")));
    for (const script of repo.packageScripts) {
      const ok = Boolean(pkg.scripts?.[script]);
      record(`${repo.tenant}:package:scripts:${script}`, ok, ok ? undefined : "missing script");
    }
  }
  function checkReleaseManifest(repo: RepoCheck) {
    // Only repos whose requirements include their own release manifest carry
    // one (the baseline does; the beacon/static profiles do not).
    if (!repo.requiredFiles.includes("release-manifest.json")) return;
    if (!checkFile(repo, "release-manifest.json")) return;
    const repoManifest = JSON.parse(read(path.join(workspaceRoot, repo.repoDir, "release-manifest.json")));
    record(
      `${repo.tenant}:release:contract`,
      repoManifest.contractVersion === contractVersion,
      `expected contractVersion ${contractVersion}`,
    );
    const required = repo.releaseRequiredEnv.every((name) => repoManifest.requiredEnv?.includes(name));
    record(`${repo.tenant}:release:required-env`, required, "release-manifest missing required env");
  }

  // 1. Contract conformance by execution — runs with no sibling repo present.
  for (const r of runPlatformContractConformance()) {
    record(`contract:${r.name}`, r.ok, r.detail);
  }

  // 2. Per-repo: compatibility marker (from the manifest, always checkable) +
  //    structural checks (SKIP when the sibling repo isn't checked out).
  for (const repo of repos) {
    record(
      `${repo.tenant}:manifest:compatible-commit`,
      Boolean(repo.compatibleCommit),
      "missing compatibleCommit in release-manifest.json",
    );

    const repoPath = path.join(workspaceRoot, repo.repoDir);
    if (!existsSync(repoPath)) {
      if (options.verifyPins) record(`${repo.tenant}:sibling`, false, `release checkout missing at ${repoPath}`);
      else recordSkip(`${repo.tenant}:sibling`, `repo not checked out at ${repoPath}`);
      continue;
    }
    record(`${repo.tenant}:repo`, true);
    if (options.verifyPins) {
      try {
        const actual = git(repoPath, ["rev-parse", "HEAD"], true, options.gitEnvironment);
        record(`${repo.tenant}:release:checkout`, actual === repo.compatibleCommit,
          `expected ${repo.compatibleCommit}; checkout is ${actual} (${lineage(repoPath, repo.compatibleCommit, actual, options.gitEnvironment)}). ` +
          "Release proof needs an isolated checkout of the pin: set CUSTOM_REPO_CHECKOUTS_ROOT (docs/operations/testing-and-ci.md).");
        const changes = git(repoPath, ["status", "--porcelain", "--untracked-files=normal"], true, options.gitEnvironment);
        const count = changes ? changes.split("\n").length : 0;
        record(`${repo.tenant}:release:clean`, !changes,
          `checkout has ${count} changed path(s); use an isolated checkout of the pinned revision, never reset the owner's folder`);
      } catch {
        record(`${repo.tenant}:release:checkout`, false, "could not verify the client checkout revision");
      }
    }
    checkPackageScripts(repo);
    for (const file of repo.requiredFiles) checkFile(repo, file);
    checkReleaseManifest(repo);
    checkCallSites(repo, repoPath);
  }

  return results;
}
