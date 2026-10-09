import { test } from "node:test";
import assert from "node:assert/strict";
import { profile, qualify } from "../check-qualification.mjs";

const ready = (major = 17) => ({
  node: "v22.20.0", pnpm: "10.34.5", packageManager: profile.packageManager, nodeDeclaration: "22",
  configuredPostgresMajor: 17, runtime: { ...profile.runtime }, playwright: "1.59.1",
  postgres: Object.fromEntries(["initdb", "pg_ctl", "postgres", "psql"].map(name => [name, `${name} (PostgreSQL) ${major}.5`])),
  browser: { revision: profile.browser.revision, version: profile.browser.browserVersion, executableAvailable: true, headlessExecutableAvailable: true },
});
test("configured target preflight names its local-shim evidence limit", () => {
  const result = qualify(ready());
  assert.equal(result.status, "preflight_passed");
  assert.equal(result.expected.postgresMajor, 17);
  assert.deepEqual(result.qualification, { managedPostgres: false, auth: false, providers: false, hosted: false });
});
test("PG18 is accepted only under the explicitly historical profile", () => {
  assert.equal(qualify(ready(18)).status, "blocked");
  const result = qualify(ready(18), "historical-pg18");
  assert.equal(result.status, "preflight_passed");
  assert.match(result.expected.target, /does not qualify/);
});
test("refuses missing/mixed server binaries rather than falling back to client tools", () => {
  const input = ready(); input.postgres.pg_ctl = null; input.postgres.psql = "psql (PostgreSQL) 18.1";
  assert.deepEqual(qualify(input).issues, ["postgres_binary_unavailable:pg_ctl", "postgres_major_mismatch:psql"]);
});
test("Node, pnpm, config, package/runtime pins fail independently", () => {
  for (const [field, value, code] of [
    ["node", "v26.8.2", "node_major_mismatch"], ["pnpm", "10.34.4", "pnpm_version_mismatch"],
    ["packageManager", "pnpm@10", "package_manager_declaration_mismatch"], ["nodeDeclaration", "24", "node_declaration_mismatch"],
    ["configuredPostgresMajor", 18, "supabase_major_declaration_mismatch"], ["playwright", "1.58.0", "playwright_version_mismatch"],
  ]) assert.ok(qualify({ ...ready(), [field]: value }).issues.includes(code));
  assert.ok(qualify({ ...ready(), runtime: { ...profile.runtime, sharp: "0.34.0" } }).issues.includes("runtime_version_mismatch:sharp"));
});
test("browser full preflight refuses external channels and missing downloaded executable", () => {
  assert.ok(qualify({ ...ready(), browserChannel: "chrome" }).issues.includes("browser_channel_override_forbidden"));
  assert.ok(qualify({ ...ready(), browser: { ...ready().browser, executableAvailable: false } }).issues.includes("pinned_chromium_unavailable"));
  assert.ok(qualify({ ...ready(), browser: { ...ready().browser, revision: "wrong" } }).issues.includes("chromium_revision_mismatch"));
  assert.ok(qualify({ ...ready(), browser: { ...ready().browser, headlessExecutableAvailable: false } }).issues.includes("pinned_chromium_headless_unavailable"));
});
test("early toolchain stage explicitly records unchecked server/browser dependencies", () => {
  const result = qualify({ ...ready(), postgres: null, browser: null, runtime: null }, "configured-pg17", "toolchain");
  assert.equal(result.status, "preflight_passed");
  assert.deepEqual(result.checked, { dependencies: false, postgres: false, browserExecutable: false });
  assert.equal(qualify(ready(), "managed-pg17").status, "blocked");
});
