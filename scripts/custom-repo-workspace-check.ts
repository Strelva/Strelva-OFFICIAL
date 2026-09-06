import { existsSync, readFileSync } from "fs";
import path from "path";
import { runPlatformContractConformance } from "./custom-repo-conformance";

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
  packageScripts: string[];
  requiredFiles: string[];
  releaseRequiredEnv: string[];
  compatibleCommit: string | null;
};

export type WorkspaceManifest = {
  contractVersion?: string;
  customRepoWorkspace?: {
    contractVersion?: string;
    baseline?: { packageScripts?: string[]; requiredFiles?: string[]; requiredEnv?: string[] };
    repos?: Array<{
      tenant: string;
      localPath: string;
      compatibleCommit?: string;
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
  const base = ws.baseline ?? {};
  const merge = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];
  return ws.repos.map((repo) => {
    if (!repo.localPath) throw new Error(`release-manifest.json: repo "${repo.tenant}" has no localPath`);
    return {
      tenant: repo.tenant,
      repoDir: path.relative(workspaceRoot, path.resolve(cwd, repo.localPath)),
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
): CheckResult[] {
  const results: CheckResult[] = [];
  const contractVersion = workspaceContractVersion(manifest);
  const repos = resolveRepoChecks(manifest, workspaceRoot, cwd);

  function record(name: string, ok: boolean, detail?: string) {
    results.push({ name, ok, detail: ok ? undefined : detail });
  }
  function recordSkip(name: string, detail: string) {
    results.push({ name, ok: true, skipped: true, detail });
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
    if (!checkFile(repo, "package.json")) return;
    const pkg = JSON.parse(read(path.join(workspaceRoot, repo.repoDir, "package.json")));
    for (const script of repo.packageScripts) {
      const ok = Boolean(pkg.scripts?.[script]);
      record(`${repo.tenant}:package:scripts:${script}`, ok, ok ? undefined : "missing script");
    }
  }
  function checkReleaseManifest(repo: RepoCheck) {
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
      recordSkip(`${repo.tenant}:sibling`, `repo not checked out at ${repoPath}`);
      continue;
    }
    record(`${repo.tenant}:repo`, true);
    checkPackageScripts(repo);
    for (const file of repo.requiredFiles) checkFile(repo, file);
    checkReleaseManifest(repo);
  }

  return results;
}
