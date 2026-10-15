/**
 * Names-only report of which release flags, switches and keys a pulled env file
 * sets. Values are never printed: flags show a normalized state, keys show
 * set/unset. Reads one file, makes no network calls, writes nothing.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { RELEASE_FLAG_ENV, RELEASE_FLAG_LABELS } from "../src/platform/release-flags/resolve";
import { CLIENT_SEND_FLAGS, parseRolloutEnv, silentRolloutEnvStops } from "./silent-rollout";

export type FlagState = "unset" | "on" | "off" | "workspace" | "operators" | "set (value hidden)";

export interface ProdFlagReport {
  clientEmail: Array<{ name: string; state: FlagState }>;
  releaseFlags: Array<{ name: string; label?: string; state: FlagState }>;
  switches: Array<{ name: string; state: FlagState }>;
  keys: Array<{ name: string; state: "set" | "unset" }>;
  unknownInFile: string[];
  stops: string[];
}

const ROOT_FILES = [
  "instrumentation.ts",
  "instrumentation-client.ts",
  "sentry.client.config.ts",
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
  "next.config.ts",
];

const SECRET_SHAPED =
  /(SECRET|TOKEN|KEY|PASSWORD|PASS|DSN|PRIVATE|WEBHOOK|CREDENTIAL|COOKIE|_URL$|_URI$|_ID$|_IDS$|EMAIL$|EMAILS$|ADDRESS|RECIPIENT|COLLECTOR|TENANTS$|_MAP$)/;

/** Every env name the source reads, so the inventory cannot go stale like a hand-kept list. */
export function scanEnvNames(root: string): string[] {
  const files = (readdirSync(join(root, "src"), { recursive: true }) as string[])
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes("__tests__"))
    .map((file) => join(root, "src", file));
  for (const file of ROOT_FILES) files.push(join(root, file));
  const names = new Set<string>();
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const pattern of [/process\.env\.([A-Z][A-Z0-9_]+)/g, /process\.env\[["']([A-Z][A-Z0-9_]+)["']\]/g]) {
      for (const match of text.matchAll(pattern)) names.add(match[1]!);
    }
  }
  return [...names].sort();
}

export function releaseFlagNames(scanned: string[]): string[] {
  const names = new Set<string>(Object.values(RELEASE_FLAG_ENV));
  for (const name of scanned) if (/^STRELVA_.*_RELEASE$/.test(name)) names.add(name);
  names.add("STRELVA_WORKSPACE_RELEASE");
  names.add("STRELVA_OWNER_ENTRY");
  return [...names].sort();
}

export function normalize(value: string | undefined): FlagState {
  const v = value?.trim().toLowerCase();
  if (!v) return "unset";
  if (["1", "true", "on", "yes"].includes(v)) return "on";
  if (["0", "false", "off", "no"].includes(v)) return "off";
  if (v === "workspace" || v === "operators") return v;
  return "set (value hidden)";
}

export function buildReport(env: Record<string, string>, scanned: string[]): ProdFlagReport {
  const flagNames = releaseFlagNames(scanned);
  const labelByEnv = new Map<string, string>();
  for (const [flag, name] of Object.entries(RELEASE_FLAG_ENV)) {
    labelByEnv.set(name, RELEASE_FLAG_LABELS[flag as keyof typeof RELEASE_FLAG_LABELS]);
  }
  const clientEmail = new Set<string>(CLIENT_SEND_FLAGS);
  const known = new Set([...scanned, ...flagNames, ...clientEmail]);
  return {
    clientEmail: [...clientEmail].map((name) => ({ name, state: normalize(env[name]) })),
    releaseFlags: flagNames.map((name) => ({ name, label: labelByEnv.get(name), state: normalize(env[name]) })),
    switches: scanned
      .filter((name) => !SECRET_SHAPED.test(name) && !flagNames.includes(name) && !clientEmail.has(name))
      .map((name) => ({ name, state: normalize(env[name]) })),
    keys: scanned
      .filter((name) => SECRET_SHAPED.test(name) && !flagNames.includes(name) && !clientEmail.has(name))
      .map((name) => ({ name, state: env[name]?.trim() ? ("set" as const) : ("unset" as const) })),
    unknownInFile: Object.keys(env)
      .filter((name) => !known.has(name))
      .sort(),
    stops: silentRolloutEnvStops(env),
  };
}

export function formatReport(report: ProdFlagReport): string {
  const lines = ["Strelva prod flag report (names and normalized states only; values never printed)", ""];
  const section = (title: string, rows: string[]) => lines.push(title, ...(rows.length ? rows.map((r) => `  ${r}`) : ["  (none)"]), "");
  section("Client email (must be off)", report.clientEmail.map((f) => `${f.name}: ${f.state}`));
  section("Release flags", report.releaseFlags.map((f) => `${f.name}: ${f.state}${f.label ? `  (${f.label})` : ""}`));
  section("Switches", report.switches.map((f) => `${f.name}: ${f.state}`));
  section("Keys (set/unset)", report.keys.map((k) => `${k.name}: ${k.state}`));
  section("In env file but unused by this source", report.unknownInFile);
  lines.push(...(report.stops.length ? report.stops.map((s) => `STOP: ${s}`) : ["Silent rollout: safe"]), "");
  lines.push('A key pulled from Vercel as a Sensitive variable may arrive as a placeholder; "set" proves presence of a name, not a working value.');
  return lines.join("\n");
}

const VALUE_FREE_ROW = /^ {2}[A-Z][A-Z0-9_]*: (unset|on|off|workspace|operators|set \(value hidden\)|set)$/;
const FIXED_LINES = new Set([
  "Strelva prod flag report (names and normalized states only; values never printed)",
  "Client email (must be off)",
  "Release flags",
  "Switches",
  "Keys (set/unset)",
  "In env file but unused by this source",
  "  (none)",
  "Silent rollout: safe",
  'A key pulled from Vercel as a Sensitive variable may arrive as a placeholder; "set" proves presence of a name, not a working value.',
]);

/**
 * Fails closed if any env value of 4+ characters shows up in what is about to print.
 * Only the value-bearing text is checked: fixed template lines, rows that match the
 * name-and-state shape, and env names (so VERCEL_ENV=production does not trip on
 * STRELVA_..._PRODUCTION_APPROVED) are removed before the substring test.
 */
export function assertNoValues(output: string, env: Record<string, string>): void {
  const labels = Object.values(RELEASE_FLAG_LABELS);
  const rest = output
    .split("\n")
    .filter((line) => !FIXED_LINES.has(line) && !VALUE_FREE_ROW.test(line))
    .join("\n")
    .replace(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g, " ");
  const lowered = labels.reduce((text, label) => text.split(label.toLowerCase()).join(" "), rest.toLowerCase());
  for (const value of Object.values(env)) {
    if (value.length < 4 || ["true", "false", "workspace", "operators"].includes(value.toLowerCase())) continue;
    if (lowered.includes(value.toLowerCase())) throw new Error("Report would print an env value; refusing.");
  }
}

const USAGE =
  "pnpm report:prod-flags --env-file .vercel/.env.production.local   (create it with: vercel env pull .vercel/.env.production.local --environment=production)";

export function main(argv: string[], log: (line: string) => void = console.log): number {
  const json = argv.includes("--json");
  const args = argv.filter((a) => a !== "--json");
  if (args.length !== 2 || args[0] !== "--env-file" || !args[1]) {
    console.error(`Usage: ${USAGE}`);
    return 2;
  }
  const env = parseRolloutEnv(readFileSync(resolve(args[1]), "utf8"));
  const report = buildReport(env, scanEnvNames(process.cwd()));
  const output = json ? JSON.stringify(report, null, 2) : formatReport(report);
  try {
    assertNoValues(output, env);
  } catch {
    console.error("Report refused: it would have printed an env value. Nothing was printed.");
    return 3;
  }
  log(output);
  return report.stops.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
