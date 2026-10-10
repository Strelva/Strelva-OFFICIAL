import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, symlinkSync, existsSync, chmodSync, readdirSync, rmSync, createWriteStream, statfsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:net";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OLD = "2dd3453a5e8ae5493c86a57a428a6f71f32f30c1";
const options = {};
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--keep") options.keep = true;
  else {
    if (!["--stack-env", "--workspace-release", "--candidate"].includes(arg)) throw new Error("Unknown option " + arg);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error("Missing value for " + arg);
    options[arg.slice(2)] = value;
  }
}
if (!options["stack-env"] || !["0", "1"].includes(options["workspace-release"])) {
  throw new Error("Required: --stack-env <disposable-local-env-file> --workspace-release 0|1");
}
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const candidate = git("rev-parse", "--verify", (options.candidate || "HEAD") + "^{commit}");
// Secrets are read into memory and written only to private local process files.
// The parser accepts assignment data, never executes shell syntax.
const local = {};
for (const line of readFileSync(resolve(options["stack-env"]), "utf8").split(/\r?\n/)) {
  const match = /^(?:export )?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if (match) local[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
}
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "STRELVA_LOCAL_DB_URL"]) {
  if (!["127.0.0.1", "localhost"].includes(new URL(local[name] || "").hostname)) throw new Error("Refusing non-loopback " + name);
}
for (const name of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) if (!local[name]) throw new Error("Missing local " + name);
try {
  const healthy = await fetch(local.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/health", { headers: { apikey: local.NEXT_PUBLIC_SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(5000) });
  if (!healthy.ok) throw new Error("not healthy");
} catch { throw new Error("Supplied disposable Auth stack is not healthy; no app checkout or process was started."); }
const space = statfsSync(process.env.TMPDIR || "/private/tmp");
if (space.bavail * space.bsize < 3 * 1024 ** 3) throw new Error("Release pair needs at least 3 GiB free before starting a disposable Next server.");
const work = mkdtempSync(join(process.env.TMPDIR || "/private/tmp", "strelva-release-pair-"));
chmodSync(work, 0o700);
const allowed = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "STRELVA_LOCAL_DB_URL"];
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || "/private/tmp", NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" };
for (const name of allowed) env[name] = local[name];
Object.assign(env, {
  SUPABASE_URL: local.NEXT_PUBLIC_SUPABASE_URL,
  CONTENT_SOURCE: "postgres", TENANTS_SOURCE: "postgres", DATA_SOURCE: "postgres",
  STRELVA_WORKSPACE_RELEASE: options["workspace-release"], STRELVA_LOCAL_AUTH_PROOF: "1",
  REB_DEV_UNGATED_ACCESS: "0", SCAFFOLD_DEV_UNGATED_ACCESS: "0",
  EMAIL_SENDING_ENABLED: "false", CUSTOMER_EMAIL_ENABLED: "false", OPERATOR_EMAILS_ENABLED: "false", PROSPECT_EMAILS_ENABLED: "false",
  APPROVE_LINK_SECRET: randomBytes(32).toString("hex"), CRON_SECRET: randomBytes(32).toString("hex"),
  SECRETS_ENC_KEY: randomBytes(32).toString("hex"),
  LEGACY_RELEASE_PAIR_STATE: join(work, "fixture.json"),
});
// No 1.0, agency, provider, model or billing transport configuration is copied.
const receipt = { old: OLD, candidate, workspaceRelease: options["workspace-release"], bundler: "Next webpack development server; production artifact qualification remains separate", scope: "Real local Auth/Postgres/Redis; shared upgraded database; synthetic tenant only; no provider transport or production traffic", phases: [], passed: false };
const processes = new Set();
const checkouts = [];
let logFailure = false;
function child(command, args, cwd, settings, log) {
  // Node owns descriptors; no shell interpolation of paths or credentials.
  const output = createWriteStream(log, { mode: 0o600 });
  output.on("error", () => {
    logFailure = true;
    // A full disk must not crash the controller and strand detached services.
    for (const owned of processes) { try { process.kill(-owned.pid, "SIGTERM"); } catch {} }
  });
  const processChild = spawn(command, args, { cwd, env: settings, stdio: ["ignore", "pipe", "pipe"], detached: true });
  processes.add(processChild);
  processChild.stdout.pipe(output, { end: false });
  processChild.stderr.pipe(output, { end: false });
  processChild.once("exit", () => { output.end(); processes.delete(processChild); });
  return processChild;
}
async function stop(processChild) {
  if (!processChild || processChild.exitCode !== null) return;
  try { process.kill(-processChild.pid, "SIGTERM"); } catch {}
  await Promise.race([new Promise(done => processChild.once("exit", done)), new Promise(done => setTimeout(done, 5000))]);
  if (processChild.exitCode === null) { try { process.kill(-processChild.pid, "SIGKILL"); } catch {} }
}
async function run(command, args, cwd, settings, log) {
  const proc = child(command, args, cwd, settings, log);
  return new Promise((done, reject) => { proc.once("error", reject); proc.once("exit", code => done(code ?? 1)); });
}
async function waitFor(check, proc, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline && proc.exitCode === null && !logFailure) {
    if (await check()) return;
    await new Promise(done => setTimeout(done, 500));
  }
  throw new Error("Local process readiness failed; inspect private logs.");
}
async function freePort() {
  const server = createServer(); await new Promise(done => server.listen(0, "127.0.0.1", done));
  const port = server.address().port; await new Promise(done => server.close(done)); return port;
}
function checkout(sha, label, dependencies) {
  const target = join(work, label);
  git("worktree", "add", "--detach", target, sha);
  checkouts.push(target);
  // Exclude even tracked .env examples. Neither source may load a real env file.
  for (const name of readdirSync(target)) if (name === ".env" || name.startsWith(".env.")) rmSync(join(target, name));
  if (!existsSync(dependencies)) throw new Error("Existing dependencies unavailable for " + label);
  // Webpack accepts a borrowed dependency tree. This avoids duplicating installed
  // packages on a space-constrained machine; no install or dependency changes.
  symlinkSync(dependencies, join(target, "node_modules"), "dir");
  copyFileSync(join(root, "scripts/legacy-release-pair.spec.ts"), join(target, "tests/legacy-release-pair.spec.ts"));
  return target;
}
let redis;
try {
  const redisFile = join(work, "redis.env");
  redis = child("pnpm", ["exec", "tsx", "scripts/journeys-redis.ts", redisFile], root, env, join(work, "redis.log"));
  await waitFor(async () => existsSync(redisFile) && readFileSync(redisFile, "utf8").includes("UPSTASH_REDIS_REST_TOKEN="), redis, 30);
  for (const line of readFileSync(redisFile, "utf8").trim().split("\n")) { const equals = line.indexOf("="); env[line.slice(0, equals)] = line.slice(equals + 1); }
  if (new URL(env.UPSTASH_REDIS_REST_URL).hostname !== "127.0.0.1") throw new Error("Redis bridge is not loopback.");
  const port = await freePort();
  env.PLAYWRIGHT_BASE_URL = env.NEXT_PUBLIC_APP_URL = `http://localhost:${port}`;
  for (const [label, sha, dependencies] of [["old", OLD, "/private/tmp/strelva-0.2.1/node_modules"], ["candidate", candidate, join(root, "node_modules")]]) {
    const available = statfsSync(work);
    if (available.bavail * available.bsize < 3 * 1024 ** 3) throw new Error("Local disk reserve fell below 3 GiB between qualification phases.");
    // Only one source/dependency/build tree exists at a time. The stores and
    // fixture identity continue across phases; browser evidence stays outside it.
    const cwd = checkout(sha, label, dependencies);
    const phaseEnv = { ...env, LEGACY_RELEASE_PAIR_PHASE: label, PLAYWRIGHT_DIST_DIR: ".next-release-pair", PLAYWRIGHT_JSON_OUTPUT_FILE: join(work, "results-" + label + ".json") };
    const app = child("pnpm", ["exec", "next", "dev", "--webpack", "--hostname", "localhost", "--port", String(port)], cwd, phaseEnv, join(work, "app-" + label + ".log"));
    let code = 1;
    try {
      await waitFor(async () => { try { return (await fetch(env.PLAYWRIGHT_BASE_URL + "/sign-in", { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; } }, app, 180);
      const specs = ["tests/legacy-release-pair.spec.ts"];
      // Frozen ordinary-customer regressions run against both exact sources.
      // They stay excluded when the observed production workspace gate is off.
      if (options["workspace-release"] === "1") {
        for (const file of ["onboarding-authenticated-local.spec.ts", "workspace-invitations-authenticated-local.spec.ts"]) {
          writeFileSync(join(cwd, "tests", file), git("show", `${OLD}:tests/${file}`) + "\n");
          specs.push("tests/" + file);
        }
        // Compile the public preview API before the frozen browser test's
        // normal five-second expectation. No token or fixture grant is created.
        await fetch(env.PLAYWRIGHT_BASE_URL + "/api/workspace-invitations/accept/release-pair-prewarm", { signal: AbortSignal.timeout(30000) });
      }
      code = await run("pnpm", ["exec", "playwright", "test", ...specs, "--workers=1", "--retries=0", "--reporter=line,json", "--output=" + join(work, "browser-" + label)], cwd, phaseEnv, join(work, "tests-" + label + ".log"));
      if (existsSync(phaseEnv.PLAYWRIGHT_JSON_OUTPUT_FILE)) {
        const results = JSON.parse(readFileSync(phaseEnv.PLAYWRIGHT_JSON_OUTPUT_FILE, "utf8"));
        if (!results.stats?.expected || results.stats.skipped || results.stats.unexpected || results.stats.flaky) code = 1;
      } else code = 1;
      receipt.phases.push({ phase: label, exitCode: code, specs });
      console.log(`${label}: ${code === 0 ? "PASS" : "FAIL"}; ${specs.length} spec files; private receipt retained`);
    } finally {
      await stop(app);
      if (!options.keep || logFailure) git("worktree", "remove", "--force", cwd);
    }
  }
  receipt.passed = !logFailure && receipt.phases.length === 2 && receipt.phases.every(phase => phase.exitCode === 0);
} finally {
  for (const proc of [...processes]) await stop(proc);
  receipt.harnessSha256 = createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex");
  receipt.contractSha256 = createHash("sha256").update(readFileSync(join(root, "scripts/legacy-release-pair.spec.ts"))).digest("hex");
  if (existsSync(env.LEGACY_RELEASE_PAIR_STATE)) {
    try {
      const state = JSON.parse(readFileSync(env.LEGACY_RELEASE_PAIR_STATE, "utf8"));
      receipt.nativeScope = { oldCreationStatus: state.nativeCreation ?? null, oldPublicationStatus: state.nativePublication ?? null, retainedInstalledRuntimeExercised: state.nativePublication === 200 && receipt.passed && options["workspace-release"] === "1" };
    } catch { receipt.fixtureReadable = false; receipt.passed = false; }
  }
  if (!options.keep || logFailure) for (const target of checkouts) if (existsSync(target)) { try { git("worktree", "remove", "--force", target); } catch {} }
  try { writeFileSync(join(work, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 }); }
  catch { receipt.passed = false; console.log("Private receipt could not be written; qualification failed."); }
  console.log("Private qualification artifacts: " + work);
}
if (!receipt.passed) process.exitCode = 1;
