import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

// Opt-in native proof. Never attaches to an existing Redis host or reads env files.
// Redis has no TCP listener; the fixture's private Unix socket owns every key.
test("watchdog recovery Lua guards the current healthy heartbeat", { timeout: 10000 }, async () => {
  assert.equal(process.env.STRELVA_HEARTBEAT_REDIS_PROOF, "1", "Explicitly enable the disposable native proof.");
  const source = readFileSync(new URL("../../src/platform/infra/monitoring.ts", import.meta.url), "utf8");
  const script = source.match(/const RECONCILE_CRON_ALERT = `([\s\S]*?)`;/)?.[1];
  assert.ok(script, "Extract exactly the production recovery Lua.");
  const fixture = mkdtempSync(join(tmpdir(), "strelva-heartbeat-"));
  const socket = join(fixture, "redis.sock");
  const server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--unixsocketperm", "700", "--save", "", "--appendonly", "no", "--dir", fixture], { stdio: "ignore" });
  const stopped = new Promise(resolve => server.once("exit", resolve));
  let startupError;
  server.once("error", error => { startupError = error; });
  const redis = (...args) => execFileSync("redis-cli", ["-s", socket, "--raw", ...args], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  const keys = ["reb:heartbeat:weekly-report", "reb:alert-dedup:cron_failed:cron=weekly-report", "reb:alert-dedup:cron_stale:cron=weekly-report"];
  const reset = () => {
    redis("FLUSHDB"); // Only the new private fixture, never a supplied target.
    redis("MSET", keys[1], "1", keys[2], "1", "reb:alert-dedup:cron_failed:cron=maintenance", "1");
  };
  const reconcile = (mode, timestamp = "100", ttl = "21600") => redis("EVAL", script, "3", ...keys, mode, timestamp, ttl);
  try {
    const deadline = Date.now() + 3000;
    while (true) {
      if (startupError) throw startupError;
      try { if (redis("PING") === "PONG") break; } catch { /* private socket starting */ }
      assert.ok(Date.now() < deadline, "Disposable Redis starts within three seconds.");
      await delay(20);
    }
    for (const heartbeat of [null, "malformed", "null", "[]", JSON.stringify({ ts: 100, ok: false }), JSON.stringify({ ts: 101, ok: true })]) {
      reset();
      if (heartbeat !== null) redis("SET", keys[0], heartbeat);
      assert.equal(reconcile("healthy"), "0");
      assert.equal(redis("EXISTS", keys[1], keys[2]), "2");
    }
    reset();
    // Watchdog A observed healthy100. B later records failure101 and its marker.
    redis("SET", keys[0], JSON.stringify({ ts: 101, ok: false }));
    assert.equal(reconcile("healthy", "100"), "0");
    assert.equal(redis("SET", keys[1], "1", "NX", "EX", "21600"), "", "Continuing failure still dedupes.");
    // Only a still-current recovery observation can clear both incident kinds.
    redis("SET", keys[0], JSON.stringify({ ts: 102, ok: true }));
    assert.equal(reconcile("healthy", "102"), "0");
    assert.equal(redis("EXISTS", keys[1], keys[2]), "0");
    assert.equal(redis("EXISTS", "reb:alert-dedup:cron_failed:cron=maintenance"), "1");
    // An obsolete failed100 snapshot cannot recreate a marker after recovery102.
    assert.equal(reconcile("failed", "100"), "0");
    assert.equal(redis("EXISTS", keys[1]), "0");
    redis("SET", keys[0], JSON.stringify({ ts: 103, ok: false }));
    assert.equal(reconcile("failed", "103", "1"), "1", "A later incident pages immediately.");
    assert.equal(reconcile("failed", "103", "1"), "0", "Continuing failure dedupes.");
    await delay(1100);
    assert.equal(reconcile("failed", "103"), "1", "Expired repeat window allows a reminder.");
    assert.ok(Number(redis("TTL", keys[1])) >= 21599);
    redis("DEL", keys[0], keys[2]);
    assert.equal(reconcile("stale", ""), "1", "Missing heartbeat pages staleness.");
    assert.equal(reconcile("stale", ""), "0");
    redis("SET", keys[0], JSON.stringify({ ts: 104, ok: true }));
    assert.equal(reconcile("stale", ""), "0", "Old missing snapshot cannot page after recovery.");

  } finally {
    server.kill("SIGTERM");
    await Promise.race([stopped, delay(1000)]);
    if (server.exitCode === null && !startupError) {
      server.kill("SIGKILL");
      await stopped;
    }
    rmSync(fixture, { recursive: true, force: true });
  }
});
