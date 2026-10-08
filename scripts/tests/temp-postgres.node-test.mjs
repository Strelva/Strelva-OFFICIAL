import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const postgres = process.env.POSTGRES_BIN ?? "/opt/homebrew/opt/postgresql@18/bin";
const available = existsSync(join(postgres, "initdb"));
const scripts = ["workspace-sql", "workspace-upgrade", "inquiry-workspace-sql", "customer-mapping-sql", "agency-prospects-sql"];

for (const script of scripts) {
  for (const failure of ["initdb", "startup", "sql", ...(script === "agency-prospects-sql" ? ["signal-INT", "signal-TERM"] : [])]) {
    test(`${script}: ${failure} failure removes only its own cluster and stops its postmaster`, { skip: !available }, () => {
      const sandbox = mkdtempSync(join("/tmp", "strelva-cleanup-test-"));
      const unrelatedData = join(sandbox, "tmp/strelva-unrelated-cluster/data");
      try {
        const bin = join(sandbox, "bin");
        const temporary = join(sandbox, "tmp");
        mkdirSync(bin);
        mkdirSync(temporary);
        const unrelated = join(temporary, "strelva-unrelated-cluster");
        mkdirSync(unrelated);
        writeFileSync(join(unrelated, "keep"), "another agent's cluster");
        const liveUnrelated = (script === "workspace-sql" && failure === "sql")
          || (script === "agency-prospects-sql" && failure === "signal-TERM");
        if (liveUnrelated) {
          const options = { env: { ...process.env, LC_ALL: "C" }, encoding: "utf8" };
          const initialized = spawnSync(join(postgres, "initdb"), ["-D", unrelatedData, "--locale=C", "--encoding=UTF8", "--auth=trust", "--no-instructions"], options);
          assert.equal(initialized.status, 0, initialized.stderr);
          const started = spawnSync(join(postgres, "pg_ctl"), ["-D", unrelatedData, "-l", join(unrelated, "postgres.log"), "-o", `-F -k '${unrelated}' -c listen_addresses='' -p ${65000 + process.pid % 400}`, "-w", "start"], options);
          assert.equal(started.status, 0, started.stderr);
        }
        writeFileSync(join(bin, "initdb"), `#!/usr/bin/env bash\n[[ "$LC_ALL" == C ]] || exit 99\n[[ "$TEST_FAILURE" != initdb ]] || exit 42\nexec "$POSTGRES_BIN/initdb" "$@"\n`, { mode: 0o700 });
        writeFileSync(join(bin, "pg_ctl"), `#!/usr/bin/env bash
[[ "$LC_ALL" == C ]] || exit 99
"$POSTGRES_BIN/pg_ctl" "$@"
status=$?
if [[ " $* " == *' start '* && "$status" == 0 ]]; then
  read -r pid < "$2/postmaster.pid"
  printf '%s\\n' "$pid" > "$TEST_POSTMASTER_PID"
  printf '%s\\n' "$2" > "$TEST_CLUSTER_DATA"
  [[ "$TEST_FAILURE" != startup ]] || exit 42
fi
exit "$status"
`, { mode: 0o700 });
        writeFileSync(join(bin, "psql"), `#!/usr/bin/env bash
if [[ "$TEST_FAILURE" == signal-* ]]; then
  kill -s "${failure.replace('signal-', '')}" "$PPID"
  exit 0
fi
exit 42
`, { mode: 0o700 });
        const result = spawnSync("bash", [join(root, `scripts/check-${script}.sh`)], {
          env: { ...process.env, PATH: `${bin}:${postgres}:${process.env.PATH}`, TMPDIR: temporary,
            LC_ALL: "", LANG: "invalid-locale", POSTGRES_BIN: postgres, TEST_FAILURE: failure,
            TEST_POSTMASTER_PID: join(sandbox, "pid"), TEST_CLUSTER_DATA: join(sandbox, "data") },
          encoding: "utf8", timeout: 60_000,
        });
        const expectedStatus = failure === "signal-INT" ? 130 : failure === "signal-TERM" ? 143 : 42;
        assert.equal(result.status, expectedStatus, result.stderr);
        assert.deepEqual(readdirSync(temporary), ["strelva-unrelated-cluster"]);
        assert.equal(readFileSync(join(unrelated, "keep"), "utf8"), "another agent's cluster");
        if (liveUnrelated) {
          assert.equal(spawnSync(join(postgres, "pg_ctl"), ["-D", unrelatedData, "status"], { stdio: "ignore", env: { ...process.env, LC_ALL: "C" } }).status, 0);
        }
        if (failure !== "initdb") {
          const pid = Number(readFileSync(join(sandbox, "pid"), "utf8"));
          assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
          assert.equal(existsSync(readFileSync(join(sandbox, "data"), "utf8").trim()), false);
        }
      } finally {
        // A failing regression may retain its OWN partially started postmaster.
        // Stop it before removing our test sandbox; never unlink a live data dir.
        const recordedData = join(sandbox, "data");
        if (existsSync(recordedData)) {
          const ownedData = readFileSync(recordedData, "utf8").trim();
          if (existsSync(join(ownedData, "postmaster.pid"))) {
            const stopped = spawnSync(join(postgres, "pg_ctl"), ["-D", ownedData, "-m", "fast", "-w", "stop"], { stdio: "ignore", env: { ...process.env, LC_ALL: "C" } });
            assert.equal(stopped.status, 0, "test-owned failed startup must stop before removing its data");
          }
        }
        if (existsSync(join(unrelatedData, "postmaster.pid"))) {
          spawnSync(join(postgres, "pg_ctl"), ["-D", unrelatedData, "-m", "fast", "-w", "stop"], { stdio: "ignore", env: { ...process.env, LC_ALL: "C" } });
        }
        rmSync(sandbox, { recursive: true, force: true });
      }
    });
  }
}

test("agency-prospects-sql: normal completion removes its nested cluster and preserves sibling data", { skip: !available }, () => {
  const sandbox = mkdtempSync(join("/tmp", "strelva-cleanup-test-"));
  try {
    writeFileSync(join(sandbox, "keep"), "another agent's data");
    const result = spawnSync("bash", [join(root, "scripts/check-agency-prospects-sql.sh")], {
      env: { ...process.env, PATH: `${postgres}:${process.env.PATH}`, TMPDIR: sandbox, LC_ALL: "C" },
      encoding: "utf8", timeout: 60_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(sandbox), ["keep"]);
    assert.equal(readFileSync(join(sandbox, "keep"), "utf8"), "another agent's data");
  } finally {
    for (const name of readdirSync(sandbox).filter(name => name.startsWith("strelva-agency-prospects."))) {
      const ownedData = join(sandbox, name, "data");
      if (existsSync(join(ownedData, "postmaster.pid"))) {
        const stopped = spawnSync(join(postgres, "pg_ctl"), ["-D", ownedData, "-m", "fast", "-w", "stop"], { stdio: "ignore", env: { ...process.env, LC_ALL: "C" } });
        assert.equal(stopped.status, 0, "stop the test-owned postmaster before deleting a failing normal-run fixture");
      }
    }
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("release-safety lifecycle cleans up on failure, SIGINT and SIGTERM", { skip: !available }, () => {
  const sandbox = mkdtempSync(join("/tmp", "strelva-cleanup-test-"));
  try {
    const harness = join(sandbox, "harness.cts");
    writeFileSync(harness, `
import { createTempPostgres } from ${JSON.stringify(join(root, "scripts/release-safety/temp-postgres.ts"))};
import { command } from ${JSON.stringify(join(root, "scripts/release-safety/postgres.ts"))};
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const temporary = createTempPostgres();
command("initdb", ["-D", join(temporary.cluster, "data"), "--locale=C", "--encoding=UTF8", "--auth=trust", "--no-instructions"]);
mkdirSync(join(temporary.cluster, "socket"));
command("pg_ctl", ["-D", join(temporary.cluster, "data"), "-l", join(temporary.cluster, "postgres.log"), "-o", "-F -k '" + join(temporary.cluster, "socket") + "' -c listen_addresses='' -p " + (61000 + process.pid % 3000), "-w", "start"]);
temporary.recordPostmaster();
writeFileSync(process.env.TEST_POSTMASTER_PID!, readFileSync(join(temporary.cluster, "data/postmaster.pid"), "utf8"));
if (process.env.TEST_SIGNAL) process.kill(process.pid, process.env.TEST_SIGNAL as NodeJS.Signals);
else throw new Error("Deliberate failure after startup");
setTimeout(() => process.exit(99), 5000);
`);
    for (const [signal, status] of [["", 1], ["SIGINT", 130], ["SIGTERM", 143]]) {
      const temporary = mkdtempSync(join(sandbox, "tmp-"));
      const result = spawnSync(process.execPath, ["--import", "tsx", harness], {
        cwd: root, env: { ...process.env, TMPDIR: temporary, LC_ALL: "", LANG: "invalid-locale", TEST_SIGNAL: signal, TEST_POSTMASTER_PID: join(sandbox, "pid") },
        encoding: "utf8", timeout: 60_000,
      });
      assert.ok(existsSync(join(sandbox, "pid")), result.stderr);
      assert.equal(result.status, status, result.stderr);
      assert.deepEqual(readdirSync(temporary).filter(name => name.startsWith("strelva-")), []);
      const pid = Number(readFileSync(join(sandbox, "pid"), "utf8").split("\n")[0]);
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    }
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});

for (const [signal, status] of [["INT", 130], ["TERM", 143]]) {
  test(`shell lifecycle cleans up on SIG${signal}`, { skip: !available }, () => {
    const sandbox = mkdtempSync(join("/tmp", "strelva-cleanup-test-"));
    try {
      const result = spawnSync("bash", ["-c", `
set -euo pipefail
source "$TEST_HELPER"
create_temp_postgres strelva-signal-test
mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $((61000 + $$ % 3000))" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
printf '%s\\n' "$cluster_postmaster_pid" > "$TEST_POSTMASTER_PID"
kill -s "$TEST_SIGNAL" "$$"
exit 99
`], {
        env: { ...process.env, PATH: `${postgres}:${process.env.PATH}`, TMPDIR: sandbox, LC_ALL: "", LANG: "invalid-locale",
          TEST_HELPER: join(root, "scripts/temp-postgres.sh"), TEST_SIGNAL: signal, TEST_POSTMASTER_PID: join(sandbox, "pid") },
        encoding: "utf8", timeout: 60_000,
      });
      assert.equal(result.status, status, result.stderr);
      assert.deepEqual(readdirSync(sandbox), ["pid"]);
      assert.throws(() => process.kill(Number(readFileSync(join(sandbox, "pid"), "utf8")), 0), { code: "ESRCH" });
    } finally { rmSync(sandbox, { recursive: true, force: true }); }
  });
}
