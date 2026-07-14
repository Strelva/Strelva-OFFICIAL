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
 *     package scripts, and a `release-manifest.json` pinned to the contract version. Repo
 *     topology comes from the release manifest (the single workspace contract). When a
 *     sibling repo is NOT checked out (the normal laptop state), it is recorded SKIPPED,
 *     not FAILED, so the check is green on a machine without the siblings and goes red only
 *     on a real conformance or structural failure.
 */

type CheckResult = {
  name: string;
  ok: boolean;
  skipped?: boolean;
  detail?: string;
};

type RepoCheck = {
  tenant: string;
  repoDir: string;
  packageScripts: string[];
  requiredFiles: string[];
  releaseRequiredEnv: string[];
};

const workspaceRoot = process.env.CUSTOM_REPO_WORKSPACE_ROOT
  ? path.resolve(process.env.CUSTOM_REPO_WORKSPACE_ROOT)
  : path.resolve(process.cwd(), "..");

const results: CheckResult[] = [];
const controlPlaneManifest = JSON.parse(
  readFileSync(path.join(process.cwd(), "release-manifest.json"), "utf8"),
) as {
  compatibleGldf?: { commit?: string };
  compatibleRohlax?: { commit?: string };
  customRepoWorkspace?: { repos?: Array<{ tenant: string; localPath: string }> };
};

/** The release manifest is the single workspace topology contract. Keeping a
 * second hard-coded directory map in this checker is what let the GLDF check
 * silently point at an abandoned empty folder. */
function manifestRepoDir(tenant: string): string {
  const configured = controlPlaneManifest.customRepoWorkspace?.repos?.find(
    (repo) => repo.tenant === tenant,
  )?.localPath;
  if (!configured) throw new Error(`release-manifest.json has no workspace path for ${tenant}`);
  return path.relative(workspaceRoot, path.resolve(process.cwd(), configured));
}

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
  const manifest = JSON.parse(read(path.join(workspaceRoot, repo.repoDir, "release-manifest.json")));
  record(`${repo.tenant}:release:contract`, manifest.contractVersion === "v1", "expected contractVersion v1");

  const required = repo.releaseRequiredEnv.every((name) => manifest.requiredEnv?.includes(name));
  record(`${repo.tenant}:release:required-env`, required, "release-manifest missing required env");
}

const repos: RepoCheck[] = [
  {
    tenant: "gldf",
    repoDir: manifestRepoDir("gldf"),
    packageScripts: ["dev", "build", "typecheck", "test", "check", "check:prod"],
    requiredFiles: [
      "CLAUDE.md",
      "README.md",
      ".env.example",
      "src/lib/reb-contracts.ts",
      "src/lib/storage.ts",
      "src/app/api/reb-capabilities/route.ts",
      "src/app/api/v1/revalidate/route.ts",
      "src/app/api/reb-custom-request/route.ts",
      "scripts/production-checklist.ts",
      "release-manifest.json",
    ],
    releaseRequiredEnv: ["REB_API_URL", "REB_CUSTOM_REQUEST_SECRET", "REVALIDATE_SECRET"],
  },
  {
    tenant: "rohlax",
    repoDir: manifestRepoDir("rohlax"),
    packageScripts: ["dev", "build", "typecheck", "test", "check:scaffold", "check"],
    requiredFiles: [
      "AGENTS.md",
      "README.md",
      ".env.example",
      "src/lib/reb-contracts.ts",
      "src/lib/reb.ts",
      "src/lib/storage.ts",
      "src/app/api/reb-capabilities/route.ts",
      "src/app/api/v1/revalidate/route.ts",
      "scripts/scaffold-web-check.mjs",
      "release-manifest.json",
    ],
    releaseRequiredEnv: ["TENANT_ID", "REB_API_URL", "REB_DASHBOARD_URL", "REVALIDATION_SECRET"],
  },
];

// 1. Contract conformance by execution — runs with no sibling repo present.
for (const r of runPlatformContractConformance()) {
  record(`contract:${r.name}`, r.ok, r.detail);
}

// 2. Structural checks per sibling repo; SKIP (not FAIL) when a repo isn't checked out.
for (const repo of repos) {
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

record("reb:manifest:compatibleGldf", Boolean(controlPlaneManifest.compatibleGldf?.commit), "missing compatibleGldf commit");
record("reb:manifest:compatibleRohlax", Boolean(controlPlaneManifest.compatibleRohlax?.commit), "missing compatibleRohlax commit");

for (const result of results) {
  const status = result.skipped ? "SKIP" : result.ok ? "PASS" : "FAIL";
  const detail = result.detail ? ` - ${result.detail}` : "";
  console.log(`${status} ${result.name}${detail}`);
}

const failed = results.filter((result) => !result.ok);
const skipped = results.filter((result) => result.skipped);
if (failed.length > 0) {
  console.error(`Custom repo workspace check failed: ${failed.length}/${results.length} checks failed.`);
  process.exit(1);
}

const passed = results.length - skipped.length;
console.log(
  `Custom repo workspace check passed: ${passed}/${results.length} checks passed` +
    (skipped.length ? `, ${skipped.length} skipped (sibling repos not checked out).` : "."),
);
