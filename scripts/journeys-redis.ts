/**
 * The loopback Redis for `pnpm check:journeys` (flags-on phase). Production
 * runs Redis beside Postgres, so the 1.0 journeys do too: a disposable
 * redis-server on a unix socket, reached through the same Upstash REST bridge
 * the scrubbed copy uses (scripts/scrubbed-copy/redis.ts), so the app's real
 * client (src/lib/redis.ts) talks to it. Nothing persists; nothing leaves
 * 127.0.0.1.
 *
 *   tsx scripts/journeys-redis.ts <env-file>
 *
 * Writes UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN to <env-file> once
 * the bridge answers, then runs until SIGTERM or SIGINT and removes its files.
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startLocalRedis, startUpstashBridge } from "./scrubbed-copy/redis";

async function main() {
  const envFile = process.argv[2];
  if (!envFile) throw new Error("Usage: tsx scripts/journeys-redis.ts <env-file>");
  // A short directory: unix socket paths are capped near 104 bytes on macOS.
  const dir = mkdtempSync("/tmp/strelva-journeys-redis.");
  const redis = await startLocalRedis(dir, path.join(dir, "redis.sock"));
  const bridge = await startUpstashBridge({ socket: redis.socket, token: randomBytes(24).toString("hex"), host: "127.0.0.1" });
  let stopping = false;
  const stop = async (code: number) => {
    if (stopping) return;
    stopping = true;
    await bridge.close().catch(() => undefined);
    await redis.stop(false).catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
    process.exit(code);
  };
  process.on("SIGTERM", () => void stop(0));
  process.on("SIGINT", () => void stop(0));
  redis.process.once("exit", () => {
    if (!stopping) console.error("redis-server exited.");
    void stop(1);
  });
  writeFileSync(envFile, `UPSTASH_REDIS_REST_URL=${bridge.url}\nUPSTASH_REDIS_REST_TOKEN=${bridge.token}\n`, { mode: 0o600 });
  console.log(`Loopback Redis bridge on ${bridge.url}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
