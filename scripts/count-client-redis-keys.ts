#!/usr/bin/env npx tsx
/**
 * Read-only count of the Redis client stores that are NOT being moved yet:
 * orders and rewards. Decides "move first or freeze" (product model, problem
 * 6): the catalog spec found no client repo sending orders, so these are
 * probably empty.
 *
 *   npx tsx scripts/count-client-redis-keys.ts          # local Redis only
 *   npx tsx scripts/count-client-redis-keys.ts --json
 *   npx tsx scripts/count-client-redis-keys.ts --i-have-jacobs-yes   # any other Redis
 *
 * SCAN only. Never reads a value, never writes, never prints a key's content:
 * output is key counts per family and tenant. Running it against production
 * Redis is a read of production, so it refuses any UPSTASH_REDIS_REST_URL that
 * isn't loopback or `*.localhost` unless `--i-have-jacobs-yes` is passed.
 */
import { getRedis } from "../src/lib/redis";
import { isLocalDatabaseUrl } from "./tenant-conversion";

export interface CountOptions { json: boolean; jacobsYes: boolean }

export function parseCountArgs(argv: string[]): CountOptions {
  const unknown = argv.filter((arg) => !/^--(?:json|i-have-jacobs-yes)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(", ")}. Usage: count-client-redis-keys [--json] [--i-have-jacobs-yes]`);
  return { json: argv.includes("--json"), jacobsYes: argv.includes("--i-have-jacobs-yes") };
}

/** Throws unless the Redis is local or Jacob said yes. Nothing is read before this passes. */
export function assertCountTargetAllowed(redisUrl: string | undefined, options: Pick<CountOptions, "jacobsYes">): "local" | "not local" {
  if (!redisUrl) throw new Error("Redis is not configured (UPSTASH_REDIS_REST_URL / _TOKEN).");
  if (isLocalDatabaseUrl(redisUrl)) return "local";
  if (!options.jacobsYes) throw new Error("Refusing: UPSTASH_REDIS_REST_URL is not a local loopback host. Counting production Redis needs Jacob's yes (--i-have-jacobs-yes).");
  return "not local";
}

export const COUNTED_FAMILIES = [
  { family: "orders_index", match: "orders:*", tenantAt: 1 },
  { family: "order", match: "order:*", tenantAt: 1 },
  { family: "rewards", match: "reb:rewards:*", tenantAt: 2 },
] as const;

export type KeyScanner = (match: string) => AsyncIterable<string>;

export async function countClientRedisKeys(scan: KeyScanner) {
  const families: Record<string, { total: number; byTenant: Record<string, number> }> = {};
  for (const { family, match, tenantAt } of COUNTED_FAMILIES) {
    const entry = { total: 0, byTenant: {} as Record<string, number> };
    for await (const key of scan(match)) {
      const tenant = key.split(":")[tenantAt] ?? "?";
      entry.total++;
      entry.byTenant[tenant] = (entry.byTenant[tenant] ?? 0) + 1;
    }
    families[family] = entry;
  }
  return families;
}

async function main() {
  const options = parseCountArgs(process.argv.slice(2));
  assertCountTargetAllowed(process.env.UPSTASH_REDIS_REST_URL, options);
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured (UPSTASH_REDIS_REST_URL / _TOKEN).");
  const scan: KeyScanner = async function* (match) {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match, count: 500 });
      cursor = String(next);
      yield* keys;
    } while (cursor !== "0");
  };
  const counts = await countClientRedisKeys(scan);
  if (options.json) { console.log(JSON.stringify(counts, null, 2)); return; }
  for (const [family, { total, byTenant }] of Object.entries(counts)) {
    console.log(`${family}: ${total} keys`);
    for (const [tenant, n] of Object.entries(byTenant).sort()) console.log(`  ${tenant}: ${n}`);
  }
}

if (process.argv[1]?.endsWith("count-client-redis-keys.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
