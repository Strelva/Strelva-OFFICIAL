#!/usr/bin/env npx tsx
import { readFileSync } from "node:fs";
import { parseRolloutEnv, silentRolloutEnvStops } from "./silent-rollout";

// The file must be the complete intended environment for this step, not a delta.
// Never loads the application env or connects to any provider.
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--env-file") {
    throw new Error("Usage: pnpm exec tsx scripts/silent-rollout-preflight.ts --env-file <complete-intended-env>");
  }
  const stops = silentRolloutEnvStops(parseRolloutEnv(readFileSync(args[1]!, "utf8")));
  console.log(stops.length ? `STOP: ${stops.join(" ")}` : "Silent rollout env preflight passed. Tenant overrides still require a fresh readiness snapshot; owner invites remain deferred.");
  if (stops.length) process.exitCode = 1;
} catch (error) {
  // Filesystem errors can contain private paths. Do not print file contents or paths.
  console.error(error instanceof Error && !("code" in error) ? error.message : "Cannot read intended env file.");
  process.exitCode = 1;
}
