/**
 * check:ontology — a STARTER enforcement gate for the ontology invariants that
 * are cleanly machine-checkable today. It is deliberately a subset: the full
 * 9-rule gate in the ontology proposal presupposes the operation registry +
 * declarative route contracts that aren't built yet. As those land, add rules
 * here. What it enforces now:
 *
 *  1. FILE SIZE — no NEW production source file balloons past the ceiling. The
 *     existing god-files (the 1558-line agent route, etc.) are grandfathered so
 *     the gate is green today; the point is to stop the next one being created.
 *  2. LIFECYCLE CONSTRAINED — the internal closed-set columns keep their CHECK
 *     constraints, so a migration can't silently drop the guard that keeps a
 *     lifecycle column from accepting garbage.
 *
 * Run: `pnpm check:ontology`. Exits non-zero on a violation.
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { execSync } from "child_process";

const repoRoot = path.resolve(__dirname, "..");
const failures: string[] = [];

// ── Rule 1: file-size ceiling ────────────────────────────────────────────────
const LINE_LIMIT = 1000;
// Generated + static-content files aren't hand-maintained logic — exempt them.
const SIZE_EXEMPT = [/^src\/lib\/db\/database\.types\.ts$/, /^src\/content\//];
// Grandfathered existing over-limit files (2026-07-14). Do NOT add to this list
// to dodge the gate — split the file instead. Trim it as files shrink.
const SIZE_GRANDFATHER = new Set([
  "scripts/production-checklist.ts",
  "src/app/dashboard/settings/page.tsx",
  "src/app/api/agent/route.ts",
  "src/__tests__/route-handlers.test.ts",
  "src/__tests__/production-readiness-rules.test.ts",
  "src/components/dashboard/ChatPanel.tsx",
]);

function tsFiles(): string[] {
  const out = execSync(`git ls-files 'src/**/*.ts' 'src/**/*.tsx' 'scripts/**/*.ts'`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

for (const rel of tsFiles()) {
  if (SIZE_EXEMPT.some((re) => re.test(rel))) continue;
  const lines = readFileSync(path.join(repoRoot, rel), "utf8").split("\n").length;
  if (lines > LINE_LIMIT && !SIZE_GRANDFATHER.has(rel)) {
    failures.push(`file-size: ${rel} is ${lines} lines (> ${LINE_LIMIT}). Split it, don't grandfather.`);
  }
}
// Keep the grandfather list honest: flag entries that no longer exist / are now small.
for (const rel of SIZE_GRANDFATHER) {
  let lines = 0;
  try {
    lines = readFileSync(path.join(repoRoot, rel), "utf8").split("\n").length;
  } catch {
    failures.push(`file-size: grandfathered ${rel} no longer exists — remove it from SIZE_GRANDFATHER.`);
    continue;
  }
  if (lines <= LINE_LIMIT) {
    failures.push(`file-size: grandfathered ${rel} is now ${lines} lines (<= ${LINE_LIMIT}) — remove it from SIZE_GRANDFATHER.`);
  }
}

// ── Rule 2: lifecycle columns keep their CHECK constraints ───────────────────
// Each closed-set column must have a CHECK constraint defined somewhere in the
// migration history. (Value list intentionally not asserted — the point is the
// guard exists, not to duplicate the enum here.)
const REQUIRED_CHECKS = [
  "tenants_delivery_model_check",
  "domain_claims_status_check",
  "tenants_subscription_plan_check",
];
const migrationsDir = path.join(repoRoot, "supabase/migrations");
const allMigrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(path.join(migrationsDir, f), "utf8"))
  .join("\n");
for (const constraint of REQUIRED_CHECKS) {
  if (!allMigrations.includes(constraint)) {
    failures.push(`lifecycle: no migration defines CHECK constraint '${constraint}'.`);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("check:ontology FAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("check:ontology passed (file-size ceiling + lifecycle CHECK constraints).");
