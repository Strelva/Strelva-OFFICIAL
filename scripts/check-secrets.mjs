#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { policy } from "./check-supply-chain.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function summarizeFindings(findings) {
  if (!Array.isArray(findings)) throw new Error("scan_report_invalid");
  // Never forward Match, Secret, author, email or scanner diagnostics.
  return findings.map(item => ({ rule: item.RuleID, file: item.File, line: item.StartLine, commit: item.Commit || null }));
}
export function runScan({ native, source, reportDir, fixture, staged }) {
  let scanner;
  if (native) {
    const probe = spawnSync("gitleaks", ["version"], { encoding: "utf8", timeout: 10_000 });
    if (probe.status !== 0 || probe.stdout.trim() !== policy.scanner.version) throw new Error("local_scanner_version_mismatch");
    const which = spawnSync("/usr/bin/which", ["gitleaks"], { encoding: "utf8", timeout: 10_000 });
    if (which.status !== 0) throw new Error("local_scanner_unavailable");
    const path = realpathSync(which.stdout.trim());
    scanner = { kind: "local-installed-diagnostic", version: policy.scanner.version, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"), upstreamImageQualified: false };
  } else scanner = { kind: "immutable-upstream-image", image: policy.scanner.image, version: policy.scanner.version };
  const report = resolve(reportDir, "scan.json");
  const common = [staged ? "protect" : "detect", "--redact=100", "--no-banner", "--log-level=error", "--report-format=json", "--exit-code=1"];
  if (fixture) common.push("--no-git");
  if (staged) common.push("--staged");
  const args = native
    ? [...common, `--source=${source}`, `--config=${root}/.gitleaks.toml`, `--report-path=${report}`]
    : ["run", "--rm", "--network=none", "--read-only", "-v", `${source}:/repo:ro`, "-v", `${root}/.gitleaks.toml:/config.toml:ro`, "-v", `${reportDir}:/report`, policy.scanner.image, ...common, "--source=/repo", "--config=/config.toml", "--report-path=/report/scan.json"];
  const result = spawnSync(native ? "gitleaks" : "docker", args, { encoding: "utf8", timeout: 120_000, maxBuffer: 1_000_000, stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || ![0, 1].includes(result.status)) {
    throw Object.assign(new Error("secret_scan_unavailable"), {
      scanFailure: { reason: "scanner_process_failed", exit: result.status, signal: result.signal, errorCode: result.error?.code ?? null },
    });
  }
  const findings = summarizeFindings(JSON.parse(readFileSync(report, "utf8")));
  if ((result.status === 0 && findings.length) || (result.status === 1 && !findings.length)) throw new Error("scan_status_report_mismatch");
  return { exit: result.status, scanner, findings };
}

export function main(argv) {
  if (argv.some(arg => !["--native", "--self-test", "--working-tree", "--staged"].includes(arg)) ||
      new Set(argv).size !== argv.length || argv.filter(arg => ["--self-test", "--working-tree", "--staged"].includes(arg)).length > 1) throw new Error("invalid_arguments");
  const owned = mkdtempSync(resolve(tmpdir(), "strelva-secret-check-"));
  const native = argv.includes("--native");
  try {
    if (argv.includes("--self-test")) {
      // Fictional credential shapes are generated at runtime, never printed or
      // committed. This catches the old broad assignment allowlist as well.
      const fixture = resolve(owned, "fixture");
      writeFileSync(fixture, `STRIPE_SECRET_KEY=sk_live_${randomBytes(24).toString("hex")}\nCRON_SECRET=${randomBytes(32).toString("hex")}\nINTERNAL_API_SECRET=${randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
      const result = runScan({ native, source: fixture, reportDir: owned, fixture: true });
      const detectedLines = new Set(result.findings.map(item => item.line));
      const passed = result.exit === 1 && [1, 2, 3].every(line => detectedLines.has(line));
      console.log(JSON.stringify({ status: passed ? "seed_detected" : "seed_missed", scanner: result.scanner, findingCount: result.findings.length, secretValuesPrinted: false }));
      return passed ? 0 : 1;
    }
    const result = runScan({ native, source: root, reportDir: owned, fixture: argv.includes("--working-tree"), staged: argv.includes("--staged") });
    console.log(JSON.stringify({ status: result.exit === 0 ? "scan_passed" : "findings_retained", scope: argv.includes("--staged") ? "staged-diff" : argv.includes("--working-tree") ? "working-tree" : "git-history", ...result }, null, 2));
    return result.exit;
  } finally { rmSync(owned, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) {
    console.log(JSON.stringify({ status: "scan_unavailable", failure: error.scanFailure ?? { reason: "scanner_or_report_unavailable" }, secretValuesPrinted: false }));
    console.error("Secret scan unavailable; verify pinned scanner, repository config and local execution access. Scanner output and secret values are withheld.");
    process.exitCode = 2;
  }
}
