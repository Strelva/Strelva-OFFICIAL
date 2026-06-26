/**
 * AnswerRank — AI Visibility Score (CLI proof-of-magic).
 *
 *   npx tsx scripts/ai-visibility.ts "<Business Name>" --site=example.com --category="HVAC" --city="Buffalo, NY"
 *
 * Prints an A-F "AI Visibility Score" scorecard — the shareable wow.
 * Runs with zero config (readiness mode); set GOOGLE_GENERATIVE_AI_API_KEY for the
 * live "does AI actually recommend you?" citation probe.
 *
 * Pass --html to ALSO write a clean, self-contained one-page HTML artifact
 * (ai-visibility-{slug}.html) that Jacob can send to a prospect. ANSI terminal
 * output is unchanged. By default the file lands in the current directory; pass
 * --out=<dir> to write it somewhere specific (the dir is created if missing) —
 * e.g. --out=outbound to collect a batch of prospect one-pagers in one folder.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { scoreAiVisibility, type Grade } from "../src/lib/ai-visibility/score";
import { renderAiVisibilityHtml, slugify } from "../src/lib/ai-visibility/html";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const GRADE_COLOR: Record<Grade, string> = { A: "\x1b[32m", B: "\x1b[32m", C: "\x1b[33m", D: "\x1b[33m", F: "\x1b[31m" };
const R = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

async function main() {
  const business = process.argv[2];
  if (!business || business.startsWith("--")) {
    console.error('Usage: npx tsx scripts/ai-visibility.ts "<Business Name>" --site=example.com --category="HVAC" --city="Buffalo, NY"');
    process.exit(1);
  }
  const result = await scoreAiVisibility({
    business,
    url: arg("site"),
    category: arg("category"),
    location: arg("city"),
  });

  const c = GRADE_COLOR[result.grade];
  const bar = "─".repeat(46);
  console.log("");
  console.log(`  ${BOLD}STRELVA · AI VISIBILITY SCORE${R}`);
  console.log(`  ${result.business}${result.url ? `  ${DIM}${result.url}${R}` : ""}`);
  console.log(`  ${bar}`);
  console.log(`  ${c}${BOLD}GRADE  ${result.grade}${R}    ${c}${result.score}/100${R}`);
  console.log("");
  console.log(`  ${BOLD}${result.verdict}${R}`);
  console.log("");
  for (const s of result.signals) {
    const mark = s.pass ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${mark} ${s.label}`);
    console.log(`     ${DIM}${s.detail}${R}`);
  }
  console.log("");
  console.log(`  ${DIM}AI citation probe:${R} ${result.citation.note}`);
  console.log("");
  console.log(`  ${BOLD}Top fix:${R} ${result.topFix}`);
  console.log(`  ${bar}`);
  console.log(`  ${DIM}Powered by Strelva · strelva.com/ai${R}`);
  console.log("");

  if (flag("html")) {
    const html = renderAiVisibilityHtml(result);
    const outDir = arg("out");
    if (outDir) mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir ?? process.cwd(), `ai-visibility-${slugify(result.business)}.html`);
    writeFileSync(outPath, html, "utf8");
    console.log(`  ${BOLD}HTML artifact:${R} ${outPath}`);
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
