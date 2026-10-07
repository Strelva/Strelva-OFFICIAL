import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const postgres = process.env.POSTGRES_BIN ?? "/opt/homebrew/opt/postgresql@18/bin";
const available = existsSync(join(postgres, "initdb"));
const scripts = ["workspace-sql", "workspace-upgrade", "inquiry-workspace-sql", "customer-mapping-sql"];

for (const script of scripts) {
  for (const failure of ["initdb", "startup", "sql"]) {
    test(`${script}: ${failure} failure removes only its own cluster and stops its postmaster`, { skip: !available }, () => {
      const sandbox = mkdtempSync(join("/tmp", "strelva-cleanup-test-"));
      try {
        const bin = join(sandbox, "bin");
        const temporary = join(sandbox, "tmp");
        mkdirSync(bin);
        mkdirSync(temporary);
        const unrelated = join(temporary, "strelva-unrelated-cluster");
        mkdirSync(unrelated);
        writeFileSync(join(unrelated, "keep"), "another agent's cluster");
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
        writeFileSync(join(bin, "psql"), "#!/usr/bin/env bash\nexit 42\n", { mode: 0o700 });
        const result = spawnSync("bash", [join(root, `scripts/check-${script}.sh`)], {
          env: { ...process.env, PATH: `${bin}:${postgres}:${process.env.PATH}`, TMPDIR: temporary,
            LC_ALL: "", LANG: "invalid-locale", POSTGRES_BIN: postgres, TEST_FAILURE: failure,
            TEST_POSTMASTER_PID: join(sandbox, "pid"), TEST_CLUSTER_DATA: join(sandbox, "data") },
          encoding: "utf8", timeout: 60_000,
        });
        assert.equal(result.status, 42, result.stderr);
        assert.deepEqual(readdirSync(temporary), ["strelva-unrelated-cluster"]);
        assert.equal(readFileSync(join(unrelated, "keep"), "utf8"), "another agent's cluster");
        if (failure !== "initdb") {
          const pid = Number(readFileSync(join(sandbox, "pid"), "utf8"));
          assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
          assert.equal(existsSync(readFileSync(join(sandbox, "data"), "utf8").trim()), false);
        }
      } finally { rmSync(sandbox, { recursive: true, force: true }); }
    });
  }
}

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
