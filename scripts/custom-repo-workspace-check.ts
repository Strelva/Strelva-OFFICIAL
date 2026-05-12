import { existsSync, readFileSync } from "fs";
import path from "path";

type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

type RepoCheck = {
  tenant: string;
  repoDir: string;
  packageScripts: string[];
  requiredFiles: string[];
  envMarkers: string[];
  sourceMarkers: Record<string, string[]>;
  releaseRequiredEnv: string[];
};

const workspaceRoot = process.env.CUSTOM_REPO_WORKSPACE_ROOT
  ? path.resolve(process.env.CUSTOM_REPO_WORKSPACE_ROOT)
  : path.resolve(process.cwd(), "..");

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail: ok ? undefined : detail });
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

function checkSourceMarkers(repo: RepoCheck, relativePath: string, markers: string[]) {
  if (!checkFile(repo, relativePath)) return;
  const source = read(path.join(workspaceRoot, repo.repoDir, relativePath));
  for (const marker of markers) {
    record(
      `${repo.tenant}:${relativePath}:${marker}`,
      source.includes(marker),
      source.includes(marker) ? undefined : "missing marker"
    );
  }
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
    repoDir: "gldf",
    packageScripts: ["dev", "build", "typecheck", "test", "check", "check:prod"],
    requiredFiles: [
      "AGENTS.md",
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
    envMarkers: [
      "TENANT_ID=gldf",
      "REB_API_URL=",
      "REB_DASHBOARD_URL=",
      "REVALIDATION_SECRET=",
      "REVALIDATE_SECRET=",
      "REB_CUSTOM_REQUEST_SECRET=",
    ],
    sourceMarkers: {
      "src/lib/reb-contracts.ts": [
        'REB_CONTRACT_VERSION = "v1"',
        'GLDF_TENANT_ID = "gldf"',
        "signRevalidationBody",
        "verifyRevalidationSignature",
        "localCapabilityManifest",
      ],
      "src/lib/storage.ts": [
        "getRebBaseUrl",
        "rebRoutes.content",
        "rebRoutes.pageConfig",
        "rebRoutes.siteCapabilities",
      ],
      "src/proxy.ts": ["x-reb-preview", "REB_DASHBOARD_URL", "admin.greatlakesdriedfruit.com"],
    },
    releaseRequiredEnv: ["REB_API_URL", "REB_CUSTOM_REQUEST_SECRET", "REVALIDATE_SECRET"],
  },
  {
    tenant: "rohlax",
    repoDir: "rohlax-wellness",
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
    envMarkers: [
      "TENANT_ID=rohlax",
      "REB_API_URL=",
      "SCAFFOLD_API_URL=",
      "REB_DASHBOARD_URL=",
      "SCAFFOLD_DASHBOARD_URL=",
      "REVALIDATION_SECRET=",
      "REVALIDATE_SECRET=",
    ],
    sourceMarkers: {
      "src/lib/reb-contracts.ts": [
        'REB_CONTRACT_VERSION = "v1"',
        'ROHLAX_TENANT_ID = "rohlax"',
        "signRevalidationBody",
        "verifyRevalidationSignature",
        "parseRevalidationPayload",
      ],
      "src/lib/reb.ts": [
        "fetchRebContent",
        "fetchRebPageConfig",
        "fetchRebSiteCapabilities",
        "localCapabilityManifest",
        "vagaro-booking",
      ],
      "src/proxy.ts": ["x-reb-preview", "REB_DASHBOARD_URL", "SCAFFOLD_DASHBOARD_URL"],
    },
    releaseRequiredEnv: ["TENANT_ID", "REB_API_URL", "REB_DASHBOARD_URL", "REVALIDATION_SECRET"],
  },
];

for (const repo of repos) {
  const repoPath = path.join(workspaceRoot, repo.repoDir);
  record(`${repo.tenant}:repo`, existsSync(repoPath), `missing repo at ${repoPath}`);
  checkPackageScripts(repo);
  for (const file of repo.requiredFiles) checkFile(repo, file);
  checkSourceMarkers(repo, ".env.example", repo.envMarkers);
  for (const [file, markers] of Object.entries(repo.sourceMarkers)) {
    checkSourceMarkers(repo, file, markers);
  }
  checkReleaseManifest(repo);
}

const rebManifest = JSON.parse(read(path.join(process.cwd(), "release-manifest.json")));
record("reb:manifest:compatibleGldf", Boolean(rebManifest.compatibleGldf?.commit), "missing compatibleGldf commit");
record("reb:manifest:compatibleRohlax", Boolean(rebManifest.compatibleRohlax?.commit), "missing compatibleRohlax commit");

for (const result of results) {
  const status = result.ok ? "PASS" : "FAIL";
  const detail = result.detail ? ` - ${result.detail}` : "";
  console.log(`${status} ${result.name}${detail}`);
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`Custom repo workspace check failed: ${failed.length}/${results.length} checks failed.`);
  process.exit(1);
}

console.log(`Custom repo workspace check passed: ${results.length}/${results.length} checks passed.`);
