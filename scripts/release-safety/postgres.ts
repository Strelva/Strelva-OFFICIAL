/** Local release rehearsal primitives. PostgreSQL CLI only; no application credentials. */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function pgBinary(name: string): string {
  const candidate = join("/opt/homebrew/opt/postgresql@18/bin", name);
  return existsSync(candidate) ? candidate : name;
}

export function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.pathname.slice(1) || url.hash) return false;
    const allowed = new Set(["sslmode", "connect_timeout", "application_name", "channel_binding", "gssencmode", "host", "port"]);
    for (const key of url.searchParams.keys()) {
      if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return false;
    }
    if (url.searchParams.has("host")) {
      const socket = url.searchParams.get("host")!;
      return !url.hostname && socket.startsWith("/") && !socket.includes(",");
    }
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host.endsWith(".localhost") ||
      (isIP(host) === 4 && host.startsWith("127.")) || host === "::1";
  } catch { return false; }
}

export function requireLocal(url: string, jacobsYes = false): void {
  if (!isLocalUrl(url) && !jacobsYes) throw new Error("Refusing a non-local Postgres target without --i-have-jacobs-yes.");
}

export function databaseUrl(admin: string, name: string): string {
  const url = new URL(admin);
  url.pathname = "/" + encodeURIComponent(name);
  return url.href;
}

export function pgEnv(): NodeJS.ProcessEnv {
  // libpq ambient routing, services and passfiles must never redirect a selected target.
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG")));
}

export function command(name: string, args: string[], input?: string): string {
  const result = spawnSync(pgBinary(name), args, { env: pgEnv(), input, encoding: "utf8", timeout: 300_000, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const dir = mkdtempSync(join(tmpdir(), "strelva-pg-error-"));
    chmodSync(dir, 0o700);
    const file = join(dir, "diagnostics.log");
    writeFileSync(file, result.stderr || "PostgreSQL process failed or timed out.", { mode: 0o600 });
    // Raw diagnostics may contain private rows and credentials.
    throw new Error(`${name} failed (exit ${result.status ?? "unknown"}); private diagnostics: ${file}`);
  }
  return result.stdout.trim();
}

export function sql(url: string, options: { text: string } | { file: string }): string {
  return command("psql", ["--dbname=" + url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", ...("file" in options ? ["-f", options.file] : ["-c", options.text])]);
}

export const identifier = (name: string) => '"' + name.replaceAll('"', '""') + '"';
export type Catalog = Record<string, Record<string, unknown>>;
export const catalog = (url: string, root: string): Catalog => JSON.parse(sql(url, { file: join(root, "scripts/release-safety/catalog.sql") }));
