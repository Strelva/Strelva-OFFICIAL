#!/usr/bin/env npx tsx
/**
 * CLI entry point for the Scaffold AI benchmark.
 *
 * Usage:
 *   npx tsx scripts/run-benchmark.ts            # run all active cases
 *   npx tsx scripts/run-benchmark.ts A          # run only A-category cases
 *   npx tsx scripts/run-benchmark.ts A1 D2 F1   # run specific case ids
 *
 * Requirements:
 *   GOOGLE_GENERATIVE_AI_API_KEY    must be set — real LLM calls are made
 *   No Sanity env vars              the runner forces dev-file storage
 *
 * The benchmark provisions a synthetic "benchmark" tenant in
 * dev-tenants.json (preserved across runs) and writes/clears
 * dev-content-benchmark.json per case. Existing tenants are untouched.
 */

import { existsSync, readFileSync } from "node:fs";

// Load .env / .env.local so the API key + any local overrides are available.
for (const filePath of [".env.local", ".env"]) {
  if (!existsSync(filePath)) continue;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
  }
}

// Force hermetic dev-file storage path. The benchmark must never touch real
// Sanity, real Redis, real Slack, or real client-site revalidation. This
// block MUST run before any module that imports storage. The runner uses
// dynamic imports for the agent so deleting these env vars here propagates.
const HERMETIC_GUARD_VARS = [
  // Sanity — would write to real CMS
  "NEXT_PUBLIC_SANITY_PROJECT_ID",
  "SANITY_API_TOKEN",
  // Redis — would persist benchmark data into a shared cache
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  // Slack — would send real notifications on every benchmark AI change
  "SLACK_WEBHOOK_URL",
];
for (const key of HERMETIC_GUARD_VARS) {
  if (process.env[key]) {
    console.warn(
      `[bench] Unsetting ${key} — the benchmark forces hermetic dev-file storage and refuses external side effects.`,
    );
    delete process.env[key];
  }
}

async function main() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(
      "GOOGLE_GENERATIVE_AI_API_KEY is not set. The benchmark makes real LLM calls and needs an API key. Aborting.",
    );
    process.exit(2);
  }

  const { runBenchmark } = await import("../benchmarks/index");
  const filter = process.argv.slice(2);
  const { passing, total } = await runBenchmark({
    filter: filter.length > 0 ? filter : undefined,
  });

  // Exit non-zero if anything failed so CI surfaces it.
  process.exit(passing === total ? 0 : 1);
}

void main();
