#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, delimiter } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = path => JSON.parse(readFileSync(path, "utf8"));
export const profile = json(resolve(root, "scripts/qualification-profile.json"));
const pgCommands = ["initdb", "pg_ctl", "postgres", "psql"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

/** Observations are injected for negative tests; CLI uses actual binaries/packages. */
export function qualify(observed, name = profile.defaultProfile, stage = "full") {
  const issues = [];
  const selected = profile.profiles[name];
  if (!selected) issues.push("profile_unknown");
  if (!["toolchain", "dependencies", "sql", "full"].includes(stage)) issues.push("stage_unknown");
  if (Number(/^v?(\d+)\./.exec(observed.node ?? "")?.[1]) !== profile.nodeMajor) issues.push("node_major_mismatch");
  if (`pnpm@${observed.pnpm}` !== profile.packageManager) issues.push("pnpm_version_mismatch");
  if (observed.packageManager !== profile.packageManager) issues.push("package_manager_declaration_mismatch");
  if (observed.nodeDeclaration !== String(profile.nodeMajor)) issues.push("node_declaration_mismatch");
  if (observed.configuredPostgresMajor !== profile.profiles[profile.defaultProfile].postgresMajor) issues.push("supabase_major_declaration_mismatch");
  if (stage !== "toolchain") {
    for (const [name, version] of Object.entries(profile.runtime)) {
      if (observed.runtime?.[name] !== version) issues.push(`runtime_version_mismatch:${name}`);
    }
    if (observed.playwright !== profile.browser.version) issues.push("playwright_version_mismatch");
  }
  if (["sql", "full"].includes(stage) && selected) {
    for (const command of pgCommands) {
      const version = observed.postgres?.[command];
      if (!version) issues.push(`postgres_binary_unavailable:${command}`);
      else if (Number(/(?:PostgreSQL\)?\s+)(\d+)\./.exec(version)?.[1]) !== selected.postgresMajor) issues.push(`postgres_major_mismatch:${command}`);
    }
  }
  if (stage === "full") {
    if (observed.browserChannel) issues.push("browser_channel_override_forbidden");
    if (!observed.browser?.revision || !observed.browser?.version || !observed.browser?.executableAvailable) issues.push("pinned_chromium_unavailable");
    if (observed.browser?.revision !== profile.browser.revision || observed.browser?.version !== profile.browser.browserVersion) issues.push("chromium_revision_mismatch");
    if (!observed.browser?.headlessExecutableAvailable) issues.push("pinned_chromium_headless_unavailable");
  }
  return {
    status: issues.length ? "blocked" : "preflight_passed",
    profile: name, stage, issues,
    expected: { nodeMajor: profile.nodeMajor, packageManager: profile.packageManager, ...selected, browser: profile.browser, resources: profile.resources },
    observed,
    checked: { dependencies: stage !== "toolchain", postgres: ["sql", "full"].includes(stage), browserExecutable: stage === "full" },
    qualification: { managedPostgres: false, auth: false, providers: false, hosted: false },
  };
}

function version(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0 ? result.stdout.trim() : null;
}
function installed(name, from = root) {
  try {
    const require = createRequire(resolve(from, "package.json"));
    // Some installed packages do not export package.json. Resolve their entry
    // then walk to the owning metadata, without mistaking a nested dependency.
    let path = resolve(from, "node_modules", name, "package.json");
    if (!existsSync(path)) {
      let directory = dirname(require.resolve(name));
      while (!existsSync(resolve(directory, "package.json")) && dirname(directory) !== directory) directory = dirname(directory);
      path = resolve(directory, "package.json");
    }
    path = realpathSync(path);
    if (json(path).name !== name) throw new Error("package_identity_mismatch");
    return { path, version: json(path).version };
  } catch { return { path: null, version: null }; }
}

export function observe(stage, name, explicitBin) {
  const pkg = json(resolve(root, "package.json"));
  const configured = /\[db\]([\s\S]*?)(?=\n\[|$)/.exec(readFileSync(resolve(root, "supabase/config.toml"), "utf8"))?.[1];
  const observed = {
    node: process.version, pnpm: version("pnpm", ["--version"]), packageManager: pkg.packageManager,
    nodeDeclaration: readFileSync(resolve(root, ".node-version"), "utf8").trim(),
    configuredPostgresMajor: Number(/major_version\s*=\s*(\d+)/.exec(configured ?? "")?.[1]),
  };
  if (stage !== "toolchain") {
    observed.runtime = Object.fromEntries(Object.keys(profile.runtime).map(name => [name, installed(name, name === "sharp" ? dirname(installed("next").path ?? resolve(root, "package.json")) : root).version]));
    observed.playwright = installed(profile.browser.package).version;
  }
  if (["sql", "full"].includes(stage)) {
    const major = profile.profiles[name]?.postgresMajor;
    const paths = explicitBin ? [explicitBin] : [
      `/opt/homebrew/opt/postgresql@${major}/bin`, `/usr/lib/postgresql/${major}/bin`,
      ...(process.env.PATH ?? "").split(delimiter),
    ];
    // Never combine psql from one install with server tools from another.
    const bin = explicitBin ?? paths.find(path => existsSync(resolve(path, "postgres")));
    observed.postgresBin = bin ?? null;
    observed.postgres = Object.fromEntries(pgCommands.map(command => [command, bin ? version(resolve(bin, command), ["--version"]) : null]));
  }
  if (stage === "full") {
    observed.browserChannel = process.env.PLAYWRIGHT_CHANNEL || null;
    try {
      const test = installed(profile.browser.package);
      const require = createRequire(test.path);
      const playwrightPath = require.resolve("playwright/package.json");
      const coreRequire = createRequire(playwrightPath);
      const corePath = coreRequire.resolve("playwright-core/package.json");
      const chromium = json(resolve(dirname(corePath), "browsers.json")).browsers.find(item => item.name === "chromium");
      const executable = coreRequire("playwright-core").chromium.executablePath();
      // BrowserType.executablePath() covers full Chromium only. The pinned
      // package registry owns platform-specific headless-shell paths.
      const { registry } = coreRequire(resolve(dirname(corePath), "lib/server/registry/index.js"));
      const headless = registry.findExecutable("chromium-headless-shell").executablePath();
      observed.browser = { revision: chromium.revision, version: chromium.browserVersion, executableAvailable: existsSync(executable), headlessExecutableAvailable: existsSync(headless) };
    } catch { observed.browser = null; }
  }
  return observed;
}

export function main(argv) {
  const allowed = new Set(["--profile", "--stage", "--postgres-bin"]);
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || args.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("invalid_arguments");
    args.set(argv[i], argv[i + 1]);
  }
  const name = args.get("--profile") ?? profile.defaultProfile;
  const stage = args.get("--stage") ?? "full";
  if (!profile.profiles[name] || !["toolchain", "dependencies", "sql", "full"].includes(stage)) throw new Error("invalid_profile_or_stage");
  const result = qualify(observe(stage, name, args.get("--postgres-bin")), name, stage);
  result.inputs = {
    profileSha256: sha256(readFileSync(resolve(root, "scripts/qualification-profile.json"))),
    lockfileSha256: sha256(readFileSync(resolve(root, "pnpm-lock.yaml"))),
  };
  console.log(JSON.stringify(result, null, 2));
  return result.status === "preflight_passed" ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch { console.error("Qualification preflight could not run; check profile/stage arguments and repository files. No checks were started."); process.exitCode = 2; }
}
