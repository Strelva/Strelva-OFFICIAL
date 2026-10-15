import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { browserContextEnvironment, recordedProductionRelease, installProofRoutes, validateContextResult, validateDiscovery, validateNativeOwnership } from "./browser-ci-contexts.mjs";
import { journeyProfile } from "./full-model-journey-profile.mjs";
import { privateAuthorityProfile } from "./private-authority-journey-window.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "scripts/browser-ci-manifest.json"), "utf8"));
const work = mkdtempSync(join(tmpdir(), "strelva-browser-ci-"));
const requested = process.argv.slice(2);
if (requested.length && (requested.length !== 2 || requested[0] !== "--context" || !["public", "preview", "workspace", "recorded", "native", "dark", "private"].includes(requested[1]))) throw new Error("Use --context public|preview|workspace|recorded|native|dark|private for independent qualification; no argument runs all mandatory contexts.");
const stages = requested.length ? [requested[1]] : ["public", "preview", "workspace", "recorded", "native", "dark", "private"];
let active;
let cleanup = () => undefined;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => {
  interrupted = true;
  if (!active) return;
  try { if (process.platform === "win32") active.kill(signal); else process.kill(-active.pid, signal); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
});
const publicBuiltApp = process.env.PLAYWRIGHT_BUILT_APP || "0";
if (!["0", "1"].includes(publicBuiltApp)) throw new Error("PLAYWRIGHT_BUILT_APP must be 0 or 1.");

// Existing empty values override Next's dotenv loading. Keep this list aligned
// with check-ci.sh; no caller credential or provider configuration is admitted.
const empty = ["APP_VERSION", "NEXT_PUBLIC_SENTRY_DSN", "SENTRY_DSN", "DATA_SOURCE", "CONTENT_SOURCE", "TENANTS_SOURCE", "REB_DEV_TENANT", "SCAFFOLD_DEV_TENANT", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_PAGESPEED_API_KEY", "SERP_API_KEY", "RESEND_API_KEY", "SLACK_WEBHOOK_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "BLOB_READ_WRITE_TOKEN", "VERCEL_TOKEN", "VERCEL_API_TOKEN", "INTERNAL_API_SECRET", "CRON_SECRET", "OAUTH_STATE_SECRET", "APPROVE_LINK_SECRET", "SECRETS_ENC_KEY", "VERCEL_ENV", "PLAYWRIGHT_BASE_URL", "PLAYWRIGHT_CHANNEL"];
const env = Object.fromEntries(["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LC_ALL"].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
Object.assign(env, Object.fromEntries(empty.map(name => [name, ""])), { CI: process.env.CI || "", REB_DEV_UNGATED_ACCESS: "0", SCAFFOLD_DEV_UNGATED_ACCESS: "0", ...browserContextEnvironment("public"), STRELVA_CUSTOMERS_RELEASE: "0", PLAYWRIGHT_BUILT_APP: "0", CUSTOM_DOMAIN_MAP: "{}", NEXT_TELEMETRY_DISABLED: "1" });
if (process.env.PLAYWRIGHT_PORT) {
  if (!/^\d+$/.test(process.env.PLAYWRIGHT_PORT) || Number(process.env.PLAYWRIGHT_PORT) < 1 || Number(process.env.PLAYWRIGHT_PORT) > 65535) throw new Error("A valid local browser port is required.");
  env.PLAYWRIGHT_PORT = process.env.PLAYWRIGHT_PORT;
}

function run(command, args, environment, capture = false) {
  if (interrupted) throw new Error("Browser gate interrupted.");
  return new Promise((resolveRun, reject) => {
    let output = "";
    active = spawn(command, args, { cwd: root, env: environment, detached: process.platform !== "win32", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
    active.stdout?.on("data", chunk => { output += chunk; });
    active.once("error", reject);
    active.once("close", (code, signal) => { active = undefined; if (code === 0 && !signal) resolveRun(output); else reject(new Error(`${command} ${args.join(" ")} failed (exit ${code}, signal ${signal || "none"}).`)); });
  });
}

try {
  console.log(`Browser CI evidence: ${work}`);
  writeFileSync(join(work, "recorded-production-release.json"), JSON.stringify(recordedProductionRelease, null, 2));
  const discovery = JSON.parse(await run("pnpm", ["exec", "playwright", "test", "--list", "--reporter=json"], env, true));
  writeFileSync(join(work, "original-discovery.json"), JSON.stringify(discovery));
  const inventory = validateDiscovery(manifest, discovery);
  validateNativeOwnership(manifest, { native: journeyProfile("full-native"), dark: journeyProfile("full-dark"), private: privateAuthorityProfile() });
  console.log(`Every original spec/case is mapped: ${inventory.specs} specs, ${inventory.cases} cases.`);
  for (const context of stages) {
    console.log(`== mandatory browser context: ${context} ==`);
    if (["native", "dark", "private"].includes(context)) {
      // Existing owned Auth runners validate exact case identities/counts and
      // forbid skipped/repeated attempts. Their provider gates remain intact.
      const args = context === "private" ? ["scripts/check-private-authority-journeys.sh"] : ["scripts/check-full-model-journeys.sh", "--profile", context === "native" ? "full-native" : "full-dark"];
      await run("bash", args, env);
      continue;
    }
    if (context === "preview") cleanup = installProofRoutes(root);
    const resultPath = join(work, `${context}-results.json`);
    try {
      await run("pnpm", ["exec", "playwright", "test", "--config=playwright.browser-ci.config.ts", "--reporter=line,json"], {
        ...env, PLAYWRIGHT_BUILT_APP: context === "public" ? publicBuiltApp : "0", STRELVA_BROWSER_CI_CONTEXT: context, ...browserContextEnvironment(context), PLAYWRIGHT_JSON_OUTPUT_FILE: resultPath,
      });
      const count = validateContextResult(manifest, context, JSON.parse(readFileSync(resultPath, "utf8")));
      console.log(`Qualified ${context}: ${count} recorded cases; required cases passed.`);
    } finally { cleanup(); cleanup = () => undefined; }
  }
  console.log("All requested browser contexts passed locally; no hosted/provider qualification is implied.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = interrupted ? 130 : 1;
} finally { cleanup(); }
