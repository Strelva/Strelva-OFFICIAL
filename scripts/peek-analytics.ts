#!/usr/bin/env npx tsx
/**
 * Read-only: pull live GSC + GA4 numbers for the configured clients so we can
 * see whether data actually flows. Needs the prod GOOGLE_SEARCH_CONSOLE_KEY.
 *   npx tsx --env-file=.env.prod scripts/peek-analytics.ts
 */
import { readFileSync } from "node:fs";

// The service-account key is multi-quote JSON; `--env-file` truncates it at the
// first inner `"`. Re-read the raw line ourselves and repair process.env before
// the analytics libs read it (they read process.env lazily at call time).
function repairServiceAccountKey() {
  try {
    const raw = readFileSync(".env.prod", "utf8");
    const line = raw.split("\n").find((l) => l.startsWith("GOOGLE_SEARCH_CONSOLE_KEY="));
    if (!line) return;
    let v = line.slice("GOOGLE_SEARCH_CONSOLE_KEY=".length);
    // The service-account JSON is a single flat object; slice first { .. last }
    // to drop the outer quotes + the trailing escaped-newline vercel pull adds.
    const a = v.indexOf("{"), b = v.lastIndexOf("}");
    if (a >= 0 && b > a) v = v.slice(a, b + 1);
    JSON.parse(v); // throws if still malformed
    process.env.GOOGLE_SEARCH_CONSOLE_KEY = v;
  } catch (e) {
    console.error("repair failed:", String(e));
  }
}
const CLIENTS = ["cocard-anderson"];

async function main() {
  repairServiceAccountKey();
  const { getAnalyticsConfig, getSearchConsolePerf, getGa4Perf } = await import("../src/lib/analytics");
  console.log(`SA key present: ${process.env.GOOGLE_SEARCH_CONSOLE_KEY ? "yes" : "NO"}\n`);
  for (const id of CLIENTS) {
    const cfg = await getAnalyticsConfig(id).catch(() => null);
    const [gsc, ga] = await Promise.all([
      getSearchConsolePerf(id).catch((e) => ({ status: "throw", err: String(e) })),
      getGa4Perf(id).catch((e) => ({ status: "throw", err: String(e) })),
    ]);
    console.log(`=== ${id} ===`);
    console.log(`  cfg: gsc=${cfg?.gscProperty ?? "-"}  ga4=${cfg?.ga4PropertyId ?? "-"}`);
    console.log(`  GSC:`, JSON.stringify(gsc));
    console.log(`  GA4:`, JSON.stringify(ga));
    console.log();
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
