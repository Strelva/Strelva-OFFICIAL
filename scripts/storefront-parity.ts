#!/usr/bin/env npx tsx
/**
 * Storefront parity: prove a production step changed nothing a client site
 * reads (the Sept 30 "60 of 60 byte-identical" check, made repeatable).
 *
 *   npx tsx scripts/storefront-parity.ts capture --base=https://app.strelva.com --tenants=gldf,rohlax --out=/private/tmp/before.json --i-have-jacobs-yes
 *   npx tsx scripts/storefront-parity.ts capture --base=https://<candidate>.vercel.app --tenants=... --out=/private/tmp/candidate.json --i-have-jacobs-yes
 *   npx tsx scripts/storefront-parity.ts compare /private/tmp/before.json /private/tmp/after.json
 *
 * capture GETs five public /api/v1 reads per tenant, one at a time, and
 * stores status, byte length and SHA-256 of each body (never the body).
 * A protected Vercel URL is reached with VERCEL_AUTOMATION_BYPASS_SECRET from
 * the environment, never from argv. Any non-loopback base needs
 * --i-have-jacobs-yes, because even a read of production is Jacob's call.
 * compare exits 2 when any read differs. Nothing is written anywhere except
 * the --out file.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const STOREFRONT_READS = [
  (t: string) => `/api/v1/site-capabilities/${t}`,
  (t: string) => `/api/v1/page-config/${t}`,
  (t: string) => `/api/v1/content/${t}/settings`,
  (t: string) => `/api/v1/content/${t}/hero`,
  (t: string) => `/api/v1/content/${t}/navigation`,
];

export interface ParityRead {
  path: string;
  status: number;
  bytes: number;
  sha256: string;
}

export interface ParityCapture {
  base: string;
  capturedAt: string;
  reads: ParityRead[];
}

export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<{ status: number; body: Uint8Array }>;

function isLoopback(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function parseParityArgs(argv: string[]) {
  const [mode, ...rest] = argv;
  const flag = (name: string) => rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (mode === "compare") {
    const files = rest.filter((a) => !a.startsWith("--"));
    if (files.length !== 2) throw new Error("Usage: storefront-parity compare <before.json> <after.json>");
    return { mode: "compare" as const, before: files[0]!, after: files[1]! };
  }
  if (mode !== "capture") throw new Error("Usage: storefront-parity <capture|compare> ...");
  const unknown = rest.filter((a) => !/^--(?:base|tenants|out)=.+$/.test(a) && a !== "--i-have-jacobs-yes");
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  const base = flag("base");
  const tenants = (flag("tenants") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const out = flag("out");
  if (!base || !out || tenants.length === 0) throw new Error("capture needs --base=, --tenants=a,b and --out=");
  for (const t of tenants) if (!/^[a-z0-9-]+$/.test(t)) throw new Error(`"${t}" is not a tenant slug.`);
  return { mode: "capture" as const, base: base.replace(/\/$/, ""), tenants, out, jacobsYes: rest.includes("--i-have-jacobs-yes") };
}

export async function captureStorefront(
  options: { base: string; tenants: string[]; jacobsYes: boolean; bypassSecret?: string },
  fetcher: Fetcher,
  now: () => Date = () => new Date(),
): Promise<ParityCapture> {
  if (!isLoopback(options.base) && !options.jacobsYes) {
    throw new Error("Refusing to read a non-local base without Jacob's yes (--i-have-jacobs-yes).");
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.bypassSecret) headers["x-vercel-protection-bypass"] = options.bypassSecret;
  const reads: ParityRead[] = [];
  for (const tenant of options.tenants) {
    for (const build of STOREFRONT_READS) {
      const path = build(tenant);
      const response = await fetcher(`${options.base}${path}`, { headers });
      reads.push({ path, status: response.status, bytes: response.body.byteLength, sha256: createHash("sha256").update(response.body).digest("hex") });
    }
  }
  return { base: options.base, capturedAt: now().toISOString(), reads };
}

export function compareCaptures(before: ParityCapture, after: ParityCapture) {
  const afterByPath = new Map(after.reads.map((r) => [r.path, r]));
  const differences: { path: string; before: ParityRead | null; after: ParityRead | null }[] = [];
  for (const read of before.reads) {
    const other = afterByPath.get(read.path) ?? null;
    if (!other || other.status !== read.status || other.sha256 !== read.sha256) differences.push({ path: read.path, before: read, after: other });
    afterByPath.delete(read.path);
  }
  for (const extra of afterByPath.values()) differences.push({ path: extra.path, before: null, after: extra });
  const identical = before.reads.length - differences.filter((d) => d.before).length;
  return { identical, total: before.reads.length, differences };
}

async function main() {
  const options = parseParityArgs(process.argv.slice(2));
  if (options.mode === "compare") {
    const before = JSON.parse(readFileSync(options.before, "utf8")) as ParityCapture;
    const after = JSON.parse(readFileSync(options.after, "utf8")) as ParityCapture;
    const result = compareCaptures(before, after);
    console.log(`${result.identical} of ${result.total} storefront reads identical (${before.base} at ${before.capturedAt} vs ${after.base} at ${after.capturedAt}).`);
    for (const d of result.differences) {
      console.log(`  DIFFERENT ${d.path}: ${d.before ? `${d.before.status}/${d.before.bytes}b` : "missing"} -> ${d.after ? `${d.after.status}/${d.after.bytes}b` : "missing"}`);
    }
    if (result.differences.length) process.exitCode = 2;
    return;
  }
  const capture = await captureStorefront(
    { base: options.base, tenants: options.tenants, jacobsYes: options.jacobsYes, bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET },
    async (url, init) => {
      const response = await fetch(url, { headers: init.headers, redirect: "manual" });
      return { status: response.status, body: new Uint8Array(await response.arrayBuffer()) };
    },
  );
  writeFileSync(options.out, JSON.stringify(capture, null, 2));
  const ok = capture.reads.filter((r) => r.status === 200).length;
  console.log(`Captured ${capture.reads.length} reads from ${capture.base} (${ok} returned 200) to ${options.out}.`);
}

if (process.argv[1]?.endsWith("storefront-parity.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
