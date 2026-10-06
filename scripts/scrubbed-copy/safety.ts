/**
 * Refusals for the scrubbed production copy. Every check here throws before any
 * source is contacted or any local process is started. Pure: callers pass env
 * maps and paths in, so each refusal is unit-tested without side effects.
 */
import { existsSync } from "node:fs";
import path from "node:path";

export class RefusalError extends Error {
  constructor(message: string) {
    super(`Refusing: ${message}`);
    this.name = "RefusalError";
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return LOOPBACK_HOSTS.has(normalized) || normalized.endsWith(".localhost");
}

/** A URL is local when its host is loopback, or when it addresses a unix socket. */
export function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const socketHost = url.searchParams.get("host");
    if (socketHost) return socketHost.startsWith("/") && (url.hostname === "" || isLoopbackHost(url.hostname));
    return isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

/** Destination database: loopback or unix socket only. */
export function assertLocalDestinationUrl(label: string, value: string): void {
  if (!isLocalUrl(value)) throw new RefusalError(`${label} is not a local loopback or unix-socket address. The copy only loads into this machine.`);
}

/** The Upstash bridge binds to loopback only, so nothing off this machine can read the copy. */
export function assertLoopbackBind(host: string): void {
  if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
    throw new RefusalError(`the local Redis bridge must bind to 127.0.0.1, not ${host}.`);
  }
}

/**
 * The git checkout that contains `dir`, or null. Walks up from `dir` itself
 * (which may not exist yet) looking for a `.git` directory or worktree file, so
 * any repository counts, not only this one.
 */
export function enclosingGitCheckout(dir: string, exists: (candidate: string) => boolean = existsSync): string | null {
  let current = path.resolve(dir);
  for (;;) {
    if (exists(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Output directory: an absolute local path, outside every git checkout (the copy
 * must never be committed), and new or empty. URLs and remote specs are refused.
 * `gitCheckout` is the checkout enclosing `out`, from enclosingGitCheckout.
 */
export function assertLocalOutputDir(out: string, options: { repoRoot: string; gitCheckout?: string | null; exists: boolean; empty: boolean; isCopy: boolean; replace: boolean }): void {
  if (!out) throw new RefusalError("--out=<absolute directory> is required.");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(out) || /^[^/]+:/.test(out)) throw new RefusalError(`--out must be a local directory, not a URL or remote path (${out.split(":")[0]}:).`);
  if (!path.isAbsolute(out)) throw new RefusalError("--out must be an absolute path.");
  if (out.includes("'") || out.includes("\n")) throw new RefusalError("--out may not contain quotes or newlines.");
  if (/\/Library\/(?:Mobile Documents|CloudStorage)(?:\/|$)/.test(out) || /^\/Volumes\//.test(out)) {
    throw new RefusalError("--out is in a cloud-synced folder or a mounted volume. Keep the copy on this machine's own disk.");
  }
  const relative = path.relative(options.repoRoot, out);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new RefusalError("--out is inside the repository. Put the copy outside every git checkout so it can never be committed.");
  }
  if (options.gitCheckout) {
    throw new RefusalError(`--out is inside the git checkout at ${options.gitCheckout}. Put the copy outside every git checkout so it can never be committed.`);
  }
  if (options.exists && !options.empty) {
    if (!options.isCopy) throw new RefusalError("--out exists, is not empty and is not a scrubbed copy.");
    if (!options.replace) throw new RefusalError("--out already holds a scrubbed copy. Pass --replace to rebuild it.");
  }
}

export interface SourceSpec {
  databaseUrl: string;
  redisUrl: string | null;
}

/**
 * The source must be named twice: once in the environment (credentials) and
 * once on the command line (host only). A mismatch means the environment points
 * somewhere the operator did not intend, and the run stops.
 */
export function assertExplicitSource(options: { source?: string; sourceRedis?: string; confirmed: boolean; skipRedis: boolean }, env: Record<string, string | undefined>): SourceSpec {
  if (!options.confirmed) throw new RefusalError("reading production needs Jacob's yes. Pass --i-have-jacobs-yes once he has authorized this run.");
  if (!options.source) throw new RefusalError("--source=<postgres host> is required; it must match SCRUBBED_COPY_SOURCE_DATABASE_URL.");
  const databaseUrl = env.SCRUBBED_COPY_SOURCE_DATABASE_URL?.trim();
  if (!databaseUrl) throw new RefusalError("SCRUBBED_COPY_SOURCE_DATABASE_URL is not set.");
  let dbHost: string;
  try {
    const url = new URL(databaseUrl);
    if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("protocol");
    dbHost = url.hostname.toLowerCase();
  } catch {
    throw new RefusalError("SCRUBBED_COPY_SOURCE_DATABASE_URL is not a postgres:// URL.");
  }
  if (dbHost !== options.source.trim().toLowerCase()) {
    throw new RefusalError(`--source does not match the host in SCRUBBED_COPY_SOURCE_DATABASE_URL.`);
  }
  if (options.skipRedis) return { databaseUrl, redisUrl: null };
  if (!options.sourceRedis) throw new RefusalError("--source-redis=<upstash host> is required (or pass --skip-redis).");
  const redisUrl = env.SCRUBBED_COPY_SOURCE_REDIS_REST_URL?.trim();
  if (!redisUrl || !env.SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN?.trim()) {
    throw new RefusalError("SCRUBBED_COPY_SOURCE_REDIS_REST_URL and SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN must be set (use the Upstash read-only token).");
  }
  let redisHost: string;
  try {
    redisHost = new URL(redisUrl).hostname.toLowerCase();
  } catch {
    throw new RefusalError("SCRUBBED_COPY_SOURCE_REDIS_REST_URL is not a URL.");
  }
  if (redisHost !== options.sourceRedis.trim().toLowerCase()) {
    throw new RefusalError("--source-redis does not match the host in SCRUBBED_COPY_SOURCE_REDIS_REST_URL.");
  }
  return { databaseUrl, redisUrl };
}

/**
 * Outbound switches for anything that runs application code against the copy.
 * Each entry is the exact value the copy environment must have. The app reads
 * these in src/lib/email-enabled.ts, src/lib/email/send.ts, src/lib/billing.ts
 * (and the routes that call `new Stripe`), src/app/api/oauth/google/*,
 * src/products/scheduling/calendar/oauth.ts and src/lib/db/client.ts.
 */
export const COPY_ENV_REQUIRED: Record<string, string> = {
  // Email: every audience switch off, and no transport key at all. The key
  // matters most: a per-tenant client override can arm client mail even when
  // the global switch is off, but nothing sends without RESEND_API_KEY.
  EMAIL_SENDING_ENABLED: "false",
  OPERATOR_EMAILS_ENABLED: "false",
  PROSPECT_EMAILS_ENABLED: "false",
  CUSTOMER_EMAIL_ENABLED: "false",
  RESEND_API_KEY: "",
  // Stripe: no key means getStripe() throws and the direct `new Stripe` routes fail.
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  // Google and Microsoft: no OAuth client, so no token refresh and no write.
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GOOGLE_CALENDAR_CLIENT_ID: "",
  GOOGLE_CALENDAR_CLIENT_SECRET: "",
  GOOGLE_SEARCH_CONSOLE_KEY: "",
  MICROSOFT_CLIENT_ID: "",
  MICROSOFT_CLIENT_SECRET: "",
  // Model providers stay off too: scrubbed data is still not for paid calls.
  GOOGLE_GENERATIVE_AI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  // No hosted database: the app reads tenants and content from the copy's dev files.
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  DATABASE_URL: "",
  CONTENT_SOURCE: "file",
  DATA_SOURCE: "file",
  TENANTS_SOURCE: "file",
  VERCEL_ENV: "development",
  SECRETS_ENC_KEY: "",
};

/** Refuse unless the environment that will run app code has every outbound path disabled. */
export function assertOutboundDisabled(env: Record<string, string | undefined>): void {
  const wrong: string[] = [];
  for (const [name, expected] of Object.entries(COPY_ENV_REQUIRED)) {
    const actual = env[name] ?? "";
    if (actual.trim() !== expected) wrong.push(name);
  }
  const redisUrl = env.UPSTASH_REDIS_REST_URL ?? "";
  if (redisUrl && !isLocalUrl(redisUrl)) wrong.push("UPSTASH_REDIS_REST_URL (not loopback)");
  if (wrong.length) {
    throw new RefusalError(`email, Stripe or Google is not disabled for the copy: ${wrong.join(", ")}. Fix the copy env; never point it at production.`);
  }
}

/** Credentials that must not be loaded in the shell that runs the tool. */
const DANGEROUS_PARENT_ENV = [
  "RESEND_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALENDAR_CLIENT_SECRET",
  "MICROSOFT_CLIENT_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "UPSTASH_REDIS_REST_TOKEN",
];
const DANGEROUS_PARENT_URLS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "UPSTASH_REDIS_REST_URL", "DATABASE_URL"];

/**
 * The tool's own shell must not carry production app credentials (for example
 * after sourcing .env.local). Source credentials use separate SCRUBBED_COPY_*
 * names, so this never blocks a legitimate run.
 */
export function assertCleanParentEnv(env: Record<string, string | undefined>): void {
  const found = DANGEROUS_PARENT_ENV.filter((name) => (env[name] ?? "").trim() !== "");
  for (const name of DANGEROUS_PARENT_URLS) {
    const value = (env[name] ?? "").trim();
    if (value && !isLocalUrl(value)) found.push(name);
  }
  if ((env.VERCEL_ENV ?? "") === "production") found.push("VERCEL_ENV=production");
  if ((env.EMAIL_SENDING_ENABLED ?? "") === "true") found.push("EMAIL_SENDING_ENABLED=true");
  if ((env.CUSTOMER_EMAIL_ENABLED ?? "") === "true") found.push("CUSTOMER_EMAIL_ENABLED=true");
  if (found.length) {
    throw new RefusalError(`this shell has production app settings loaded (${found.join(", ")}). Run from a clean shell; only SCRUBBED_COPY_* source variables belong here.`);
  }
}

/** The environment children get: nothing inherited except PATH and HOME. */
export function copyEnvironment(extra: Record<string, string>, inherited: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = { ...COPY_ENV_REQUIRED, ...extra };
  if (inherited.PATH) env.PATH = inherited.PATH;
  if (inherited.HOME) env.HOME = inherited.HOME;
  env.NODE_ENV = "development";
  assertOutboundDisabled(env);
  return env;
}

export function renderEnvFile(env: Record<string, string>): string {
  const lines = ["# Scrubbed production copy. Local only; every outbound path is off.", "# Generated by scripts/scrubbed-production-copy.ts. Do not edit the outbound switches."];
  for (const [name, value] of Object.entries(env)) {
    if (name === "PATH" || name === "HOME") continue;
    lines.push(`${name}=${value}`);
  }
  return `${lines.join("\n")}\n`;
}

export function parseEnvFile(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}
