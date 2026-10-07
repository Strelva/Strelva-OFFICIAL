import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { readCandidateMigrations } from "../check-workspace-target.mjs";
import { copyForwardMigrations } from "../copy-forward-migrations.mjs";

// No Docker or hosted project. The CLI connects only to a new loopback cluster.
test("installed Supabase CLI never executes helpers or records them as forward migrations", async t => {
  const root = mkdtempSync(join(tmpdir(), "strelva-helper-proof-"));
  const data = join(root, "data");
  // PostgreSQL's Unix socket path limit is shorter than macOS's default TMPDIR.
  const socket = mkdtempSync("/tmp/strelva-helper-socket-");
  let started = false;
  const env = { PATH: process.env.PATH, HOME: root, TMPDIR: tmpdir(), CI: "true", LC_ALL: "C" };
  const run = (command, args) => {
    const result = spawnSync(command, args, { env, encoding: "utf8", timeout: 60_000 });
    assert.ifError(result.error);
    const log = join(root, "postgres.log");
    const detail = result.status !== 0 && existsSync(log) ? readFileSync(log, "utf8") : "";
    assert.equal(result.status, 0, `${command} failed: ${result.stdout}\n${result.stderr}\n${detail}`);
    return result;
  };
  try {
    t.diagnostic(`Supabase CLI: ${run("supabase", ["--version"]).stdout.trim()}`);
    const server = createServer();
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    run("initdb", ["-D", data, "-U", "postgres", "--locale=C", "--encoding=UTF8", "--auth=trust", "--no-instructions"]);
    run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o", `-F -k '${socket}' -h 127.0.0.1 -p ${port}`, "-w", "start"]);
    started = true;
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
    const psql = sql => run("psql", [url, "--no-psqlrc", "--set=ON_ERROR_STOP=1", "-At", "-c", sql]).stdout.trim();
    const repository = new URL("../../supabase/migrations/", import.meta.url);
    const forwards = new Set(readCandidateMigrations(repository).map(({ version, name }) => `${version}_${name}.sql`));
    const helpers = readdirSync(repository).filter(name => name.endsWith(".sql") && !forwards.has(name));
    assert.ok(helpers.includes("rollback-20260928130000_business_effort_minutes.sql"));
    assert.ok(helpers.includes("rollback-identity-spine-expand.sql"));
    const source = join(root, "source");
    const staged = join(root, "staged");
    for (const workdir of [source, staged]) {
      mkdirSync(join(workdir, "supabase", "migrations"), { recursive: true });
      writeFileSync(join(workdir, "supabase", "config.toml"), 'project_id = "helper-filename-proof"\n');
    }
    const sourceMigrations = join(source, "supabase", "migrations");
    const forward = "20260928130000_business_effort_minutes.sql";
    writeFileSync(join(sourceMigrations, forward), "create table public.helper_proof (id int); insert into public.helper_proof values (1);");
    // Every retained helper has executable poison, including the rollback with
    // the same version/name as the forward. Any accidental application fails.
    for (const name of helpers) writeFileSync(join(sourceMigrations, name), "do $$ begin raise exception 'helper executed'; end $$;");
    // check:workspace-upgrade enumerates 20*.sql before its ordered psql calls.
    const upgradeFiles = run("find", [sourceMigrations, "-maxdepth", "1", "-type", "f", "-name", "20*.sql"]).stdout.trim().split("\n");
    assert.deepEqual(upgradeFiles, [join(sourceMigrations, forward)]);
    const original = run("supabase", ["migration", "up", "--workdir", source, "--db-url", url, "--yes"]);
    for (const name of helpers) assert.ok(`${original.stdout}\n${original.stderr}`.includes(`Skipping migration ${name}`), `CLI did not report skipping ${name}`);
    assert.equal(psql("select version || '_' || name from supabase_migrations.schema_migrations"), "20260928130000_business_effort_minutes");
    assert.equal(psql("select count(*) from public.helper_proof"), "1");

    // The same staging function used by authenticated-journeys removes all skip
    // notices. Reapply to an empty schema to prove it still executes the forward.
    copyForwardMigrations(sourceMigrations, join(staged, "supabase", "migrations"));
    assert.deepEqual(readdirSync(join(staged, "supabase", "migrations")), [forward]);
    psql("drop table public.helper_proof; drop schema supabase_migrations cascade;");
    const copied = run("supabase", ["migration", "up", "--workdir", staged, "--db-url", url, "--yes"]);
    assert.ok(!`${copied.stdout}\n${copied.stderr}`.includes("Skipping migration"));
    assert.equal(psql("select version || '_' || name from supabase_migrations.schema_migrations"), "20260928130000_business_effort_minutes");
    assert.equal(psql("select count(*) from public.helper_proof"), "1");
    t.diagnostic(`Skipped ${helpers.length} poisoned helpers; only the forward was applied in both layouts.`);
  } finally {
    if (started) spawnSync("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], { env, timeout: 60_000 });
    rmSync(socket, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});
