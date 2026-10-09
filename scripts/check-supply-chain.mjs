#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const policy = JSON.parse(readFileSync(resolve(root, "scripts/supply-chain-policy.json"), "utf8"));
const ghsa = /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/;
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && Number.isFinite(Date.parse(value));
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

export function validatePolicy(config, pkg, workflows, now = new Date().toISOString().slice(0, 10)) {
  const issues = [];
  if (config.version !== 1 || !date(now)) issues.push("policy_or_check_date_invalid");
  // pnpm's global ignore list would hide an advisory from the production check,
  // and bypass expiry when somebody runs plain pnpm audit.
  if (pkg.pnpm?.auditConfig?.ignoreGhsas?.length || pkg.pnpm?.auditConfig?.ignoreCves?.length) issues.push("unbounded_package_audit_ignore_forbidden");
  const exceptions = config.advisoryExceptions;
  if (!Array.isArray(exceptions)) issues.push("advisory_exceptions_invalid");
  const seen = new Set();
  for (const item of exceptions ?? []) {
    if (!ghsa.test(item.id ?? "") || !item.package || !item.owner || !item.reason || !item.priorDecision ||
        item.scope !== "development-only" || item.source !== `https://github.com/advisories/${item.id}` ||
        !date(item.reviewedAt) || !date(item.expiresAt) || item.expiresAt <= item.reviewedAt ||
        item.reviewedAt > now || Date.parse(item.expiresAt) - Date.parse(item.reviewedAt) > 31 * 86400_000) issues.push("advisory_exception_invalid");
    if (item.expiresAt <= now) issues.push(`advisory_exception_expired:${item.id}`);
    if (seen.has(item.id)) issues.push("advisory_exception_duplicate");
    seen.add(item.id);
  }
  for (const [file, text] of Object.entries(workflows)) {
    for (const match of text.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)) {
      const [name, revision] = match[1].split("@");
      if (!/^[a-f0-9]{40}$/.test(revision ?? "") || config.actions?.[name]?.sha !== revision ||
          config.actions?.[name]?.source !== `https://github.com/${name}/commit/${revision}`) issues.push(`action_revision_unapproved:${file}:${name}`);
    }
    if (/pnpm install(?! --frozen-lockfile)/.test(text)) issues.push(`unfrozen_install:${file}`);
    if (/gitleaks:(?:latest|v?\d)/.test(text)) issues.push(`mutable_scanner:${file}`);
  }
  if (!/^ghcr\.io\/gitleaks\/gitleaks@sha256:[a-f0-9]{64}$/.test(config.scanner?.image ?? "") ||
      config.scanner?.source !== `https://github.com/gitleaks/gitleaks/releases/tag/v${config.scanner?.version}`) issues.push("scanner_provenance_invalid");
  return [...new Set(issues)];
}

export function assessAudit(audit, config, scope) {
  const issues = [], excepted = [], findings = [];
  // Registry errors, missing metadata and missing findings cannot be green.
  if (!record(audit) || audit.error || !record(audit.advisories) || !record(audit.metadata?.vulnerabilities) ||
      !Array.isArray(audit.muted) || audit.muted.length) return { issues: ["audit_data_unavailable_or_muted"], findings, excepted };
  for (const value of Object.values(audit.advisories)) {
    const id = value.github_advisory_id ?? /GHSA-[a-z0-9-]+/.exec(value.url ?? "")?.[0];
    if (!ghsa.test(id ?? "") || !value.module_name || !["info", "low", "moderate", "high", "critical"].includes(value.severity)) {
      issues.push("audit_finding_invalid"); continue;
    }
    const finding = { id, package: value.module_name, severity: value.severity, scope };
    findings.push(finding);
    if (!["high", "critical"].includes(value.severity)) continue;
    const exception = config.advisoryExceptions.find(item => item.id === id && item.package === value.module_name);
    if (scope === "all" && exception?.scope === "development-only" && value.severity !== "critical") excepted.push(finding);
    else issues.push(`unexcepted_high_risk:${scope}:${id}`);
  }
  const reported = Object.values(audit.metadata.vulnerabilities);
  if (!reported.every(value => Number.isInteger(value) && value >= 0) ||
      Number(audit.metadata.vulnerabilities.high) + Number(audit.metadata.vulnerabilities.critical) > findings.filter(item => ["high", "critical"].includes(item.severity)).length) issues.push("audit_findings_incomplete");
  return { issues, findings, excepted };
}

export function classifyLicenses(inventory, config) {
  const issues = [], packages = [];
  if (!record(inventory) || Object.keys(inventory).length === 0) return { issues: ["license_inventory_unavailable"], packages };
  for (const [license, values] of Object.entries(inventory)) {
    if (!Array.isArray(values) || !values.length) { issues.push("license_inventory_invalid"); continue; }
    const classification = Object.entries(config.licenseClasses).find(([, licenses]) => licenses.includes(license))?.[0] ?? "reviewRequired";
    for (const value of values) {
      if (!value.name || !Array.isArray(value.versions) || !value.versions.length || value.license !== license) {
        issues.push("license_inventory_invalid"); continue;
      }
      packages.push({ name: value.name, versions: value.versions, license, classification });
      // Classification of an existing license is not permission to distribute.
      // Commercial/restricted/unknown terms remain blocked until an exact review.
      if (classification === "reviewRequired") issues.push(`license_review_required:${value.name}`);
    }
  }
  return { issues: [...new Set(issues)], packages };
}

function commandJson(args) {
  const result = spawnSync("pnpm", args, { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 20_000_000, stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || ![0, 1].includes(result.status)) throw new Error("package_check_unavailable");
  // pnpm warning/banner output is not an audit object; refuse instead of guessing.
  return JSON.parse(result.stdout);
}
export function main(argv) {
  if (argv.length && !(argv.length === 1 && argv[0] === "--policy-only")) throw new Error("invalid_arguments");
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const workflows = Object.fromEntries(readdirSync(resolve(root, ".github/workflows")).filter(name => name.endsWith(".yml")).map(name => [name, readFileSync(resolve(root, ".github/workflows", name), "utf8")]));
  const issues = validatePolicy(policy, pkg, workflows);
  const result = { status: "blocked", checkedAt: new Date().toISOString(), issues,
    inputs: Object.fromEntries(["package.json", "pnpm-lock.yaml", "scripts/supply-chain-policy.json"].map(name => [name, createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex")])),
    productionApproved: false,
  };
  if (!argv.length && !issues.length) {
    const all = assessAudit(commandJson(["audit", "--json"]), policy, "all");
    const production = assessAudit(commandJson(["audit", "--prod", "--json"]), policy, "production");
    const licenses = classifyLicenses(commandJson(["licenses", "list", "--json"]), policy);
    result.audit = { all, production };
    result.licenses = licenses;
    issues.push(...all.issues, ...production.issues, ...licenses.issues);
  }
  result.status = issues.length ? "blocked" : argv.length ? "policy_passed" : "supply_chain_passed";
  console.log(JSON.stringify(result, null, 2));
  return issues.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch { console.error("Supply-chain check unavailable. Verify policy, registry connectivity and installed frozen-lockfile dependencies; no advisory/license pass is claimed."); process.exitCode = 2; }
}
