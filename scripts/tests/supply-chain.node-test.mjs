import { test } from "node:test";
import assert from "node:assert/strict";
import { policy, validatePolicy, assessAudit, classifyLicenses } from "../check-supply-chain.mjs";
import { summarizeFindings } from "../check-secrets.mjs";

const clone = () => structuredClone(policy);
const audit = (advisories = {}) => ({ advisories, muted: [], metadata: { vulnerabilities: { low: 0, moderate: 0, high: Object.keys(advisories).length, critical: 0 } } });
const finding = { module_name: "braces", severity: "high", github_advisory_id: "GHSA-vfj7-8cjw-p6xm" };
test("approved upstream revisions and bounded existing exception pass", () => {
  const workflows = { "ci.yml": `uses: actions/checkout@${policy.actions["actions/checkout"].sha}\nrun: pnpm install --frozen-lockfile` };
  assert.deepEqual(validatePolicy(policy, {}, workflows, "2026-10-09"), []);
});
test("mutable/wrong Action or scanner revisions and unfrozen installs fail", () => {
  for (const line of ["uses: actions/checkout@v4", `uses: actions/checkout@${"a".repeat(40)}`, "run: pnpm install", "image: zricethezav/gitleaks:latest"]) {
    assert.ok(validatePolicy(policy, {}, { ci: line }, "2026-10-09").length);
  }
  const config = clone(); config.scanner.image = "ghcr.io/gitleaks/gitleaks:latest";
  assert.ok(validatePolicy(config, {}, {}, "2026-10-09").includes("scanner_provenance_invalid"));
});
test("expired, missing-owner, duplicate and overlong exceptions fail before auditing", () => {
  assert.ok(validatePolicy(policy, {}, {}, "2026-10-23").some(code => code.startsWith("advisory_exception_expired")));
  for (const field of ["owner", "scope", "priorDecision", "expiresAt"]) {
    const config = clone(); delete config.advisoryExceptions[0][field];
    assert.ok(validatePolicy(config, {}, {}, "2026-10-09").includes("advisory_exception_invalid"));
  }
  const config = clone(); config.advisoryExceptions.push({ ...config.advisoryExceptions[0] });
  assert.ok(validatePolicy(config, {}, {}, "2026-10-09").includes("advisory_exception_duplicate"));
  assert.ok(validatePolicy(policy, { pnpm: { auditConfig: { ignoreGhsas: [finding.github_advisory_id] } } }, {}, "2026-10-09").includes("unbounded_package_audit_ignore_forbidden"));
});
test("development exception never hides production or critical findings", () => {
  assert.equal(assessAudit(audit({ 1: finding }), policy, "all").excepted.length, 1);
  assert.ok(assessAudit(audit({ 1: finding }), policy, "production").issues.length);
  assert.ok(assessAudit(audit({ 1: { ...finding, severity: "critical" } }), policy, "all").issues.length);
  assert.ok(assessAudit(audit({ 1: { ...finding, module_name: "other" } }), policy, "all").issues.length);
});
test("unavailable/muted/incomplete advisory responses cannot pass", () => {
  for (const value of [null, {}, { error: {} }, { ...audit(), muted: [finding] }, { ...audit(), metadata: { vulnerabilities: { high: 1, critical: 0 } } }]) assert.ok(assessAudit(value, policy, "all").issues.length);
});
test("licenses are inventoried without blanket commercial exceptions", () => {
  const item = license => ({ name: "package", versions: ["1.0.0"], license });
  assert.equal(classifyLicenses({ MIT: [item("MIT")] }, policy).issues.length, 0);
  assert.equal(classifyLicenses({ "LGPL-3.0-or-later": [item("LGPL-3.0-or-later")] }, policy).packages[0].classification, "sourceObligations");
  for (const license of ["UNKNOWN", "FSL-1.1-MIT", "custom"]) assert.ok(classifyLicenses({ [license]: [item(license)] }, policy).issues.length);
  assert.ok(classifyLicenses({}, policy).issues.length);
});
test("scanner summaries cannot print credential fields", () => {
  const values = summarizeFindings([{ RuleID: "stripe", File: "seed", StartLine: 1, Secret: "forbidden-value", Match: "forbidden-line", Author: "private", Email: "private" }]);
  assert.deepEqual(values, [{ rule: "stripe", file: "seed", line: 1, commit: null }]);
  assert.doesNotMatch(JSON.stringify(values), /forbidden|private/);
});
