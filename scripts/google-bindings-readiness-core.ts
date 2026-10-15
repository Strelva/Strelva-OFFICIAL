/**
 * Is STRELVA_GOOGLE_BINDINGS safe to flip? Logic only; the CLI is
 * scripts/google-bindings-readiness.ts. It reads and prints counts and
 * present/absent: never a token, never a value from the environment. All reads
 * are injected so tests prove it touches nothing.
 */
import { googleBindingsFlipPrerequisites, type FlipPrerequisite } from "../src/platform/account-bindings/flip-readiness";
import { isLocalDatabaseUrl } from "./tenant-conversion";
import type { CopyOutcome } from "./google-binding-copy";

export const JACOBS_YES = "--i-have-jacobs-yes";

export interface ReadinessOptions { jacobsYes: boolean; json: boolean; databaseUrl?: string }

export interface ReadinessDeps {
  env: Record<string, string | undefined>;
  fallbacks(days: number): Promise<Array<{ date: string; counts: Record<string, number> }>>;
  /** A dry run of the Redis to Postgres copy: counts only, writes nothing. */
  copyDryRun(): Promise<CopyOutcome>;
  log(line: string): void;
}

export interface ReadinessReport {
  database: "local" | "not local" | "not configured";
  prerequisites: FlipPrerequisite[];
  prerequisitesOk: boolean;
  /** Null when no database is configured, so there is nothing to read. */
  fallbacks: { days: number; total: number; byKind: Record<string, number>; zero: boolean } | null;
  copy: { withGoogle: number; linked: number; alreadyCopied: number; toCopy: number } | null;
  flipReady: boolean;
}

export function parseReadinessArgs(argv: string[]): { jacobsYes: boolean; json: boolean } {
  const unknown = argv.filter(arg => !/^--(?:json|i-have-jacobs-yes)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  return { jacobsYes: argv.includes(JACOBS_YES), json: argv.includes("--json") };
}

export async function runGoogleBindingsReadiness(options: ReadinessOptions, deps: ReadinessDeps): Promise<ReadinessReport> {
  const database = options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "not local") : "not configured";
  if (database === "not local" && !options.jacobsYes) {
    throw new Error(`Refusing to read a non-local database. It is read-only, but it still needs Jacob's yes (${JACOBS_YES}).`);
  }
  const prerequisites = googleBindingsFlipPrerequisites(deps.env);
  const prerequisitesOk = prerequisites.every(item => item.ok);
  let fallbacks: ReadinessReport["fallbacks"] = null;
  let copy: ReadinessReport["copy"] = null;
  if (database !== "not configured") {
    const days = await deps.fallbacks(30);
    const byKind: Record<string, number> = {};
    for (const day of days) for (const [kind, count] of Object.entries(day.counts)) byKind[kind] = (byKind[kind] ?? 0) + count;
    const total = Object.values(byKind).reduce((sum, count) => sum + count, 0);
    fallbacks = { days: days.length, total, byKind, zero: total === 0 };
    const t = (await deps.copyDryRun()).totals;
    copy = { withGoogle: t.withGoogle, linked: t.linked, alreadyCopied: t.alreadyCopied, toCopy: t.toCopy };
  }
  const report: ReadinessReport = {
    database, prerequisites, prerequisitesOk, fallbacks, copy,
    flipReady: prerequisitesOk && fallbacks?.zero === true && copy?.toCopy === 0,
  };
  if (!options.json) {
    deps.log(`Database: ${database}.`);
    for (const item of prerequisites) deps.log(`${item.ok ? "present" : "ABSENT "}  ${item.key}${item.ok ? "" : `  (${item.why})`}`);
    deps.log(fallbacks ? `Redis fallbacks, last ${fallbacks.days} days: ${fallbacks.total}${fallbacks.zero ? " (zero)" : ""}.` : "Redis fallbacks: not read (no database configured).");
    deps.log(copy ? `Redis grants still to copy: ${copy.toCopy} (with Google ${copy.withGoogle}, linked ${copy.linked}, already copied ${copy.alreadyCopied}).` : "Copy dry run: not read (no database configured).");
    deps.log(report.flipReady ? "Ready to flip STRELVA_GOOGLE_BINDINGS." : "Not ready to flip STRELVA_GOOGLE_BINDINGS.");
  }
  return report;
}
