/** Own exactly one disposable cluster, including partial startup and signals. */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pgBinary, pgEnv } from "./postgres";

export function createTempPostgres() {
  const cluster = mkdtempSync(join(tmpdir(), "strelva-release-safety-"));
  const data = join(cluster, "data");
  let postmasterPid: number | undefined;
  let cleaned = false;
  function recordPostmaster() {
    const file = join(data, "postmaster.pid");
    if (existsSync(file)) postmasterPid = Number(readFileSync(file, "utf8").split("\n")[0]);
  }
  function cleanup() {
    if (cleaned) return;
    recordPostmaster(); // pg_ctl may fail after starting its postmaster.
    if (existsSync(join(data, "postmaster.pid"))) {
      for (const mode of ["fast", "immediate"]) {
        const result = spawnSync(pgBinary("pg_ctl"), ["-D", data, "-m", mode, "-w", "stop"], { env: pgEnv(), stdio: "ignore", timeout: 65_000 });
        if (result.status === 0) break;
      }
      if (Number.isInteger(postmasterPid) && postmasterPid! > 0) {
        let running = false;
        try { process.kill(postmasterPid!, 0); running = true; } catch { /* Already stopped. */ }
        if (running) {
          console.error(`Unable to stop owned PostgreSQL PID ${postmasterPid}; retained cluster: ${cluster}`);
          process.exitCode = 1;
          return;
        }
      }
    }
    rmSync(cluster, { recursive: true, force: true });
    cleaned = true;
    process.off("exit", cleanup);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
  function interrupt() { process.exit(130); }
  function terminate() { process.exit(143); }
  process.on("exit", cleanup);
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  chmodSync(cluster, 0o700);
  return { cluster, recordPostmaster, cleanup };
}
