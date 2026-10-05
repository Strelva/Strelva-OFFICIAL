#!/usr/bin/env node
/**
 * Measure the code-side Strelva Reborn (1.0.0) exit criteria from the working tree.
 * Reads files only: no network, environment, database or production access.
 * Data and customer criteria (clients converted, flags on) live in
 * docs/product/strelva-reborn.md and need production evidence, not this script.
 *
 * Usage: node scripts/reborn-progress.mjs [--json] [--strict]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_LAYERS = ["src/platform", "src/products", "src/experience", "src/server"];

function files(dir, out = []) {
  let entries;
  try { entries = readdirSync(join(root, dir)); } catch { return out; }
  for (const name of entries) {
    const path = join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(join(root, path)).isDirectory()) files(path, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const read = path => readFileSync(join(root, path), "utf8");
const importsFrom = (source, prefix) =>
  new RegExp(`(from\\s+|import\\(\\s*)["']${prefix}`).test(source);

const src = files("src");
const lib = src.filter(f => f.startsWith("src/lib/"));
const workspace = src.filter(f => WORKSPACE_LAYERS.some(layer => f.startsWith(`${layer}/`)));
const migrations = readdirSync(join(root, "supabase/migrations")).filter(f => f.endsWith(".sql"));
const migrationText = migrations.map(f => read(`supabase/migrations/${f}`)).join("\n");
const routes = src.filter(f => f.startsWith("src/app/api/") && /\/route\.ts$/.test(f));

const workspaceOnLib = workspace.filter(f => importsFrom(read(f), "@/lib/"));
const libOnWorkspace = lib.filter(f => {
  const s = read(f);
  return ["@/platform", "@/products", "@/experience", "@/server"].some(p => importsFrom(s, p));
});
const tenantGate = src.filter(f => /requireTenant(Access|Permissions?)\(/.test(read(f)));
const modelCallSites = src.filter(f => /(from\s+|import\(\s*)["']ai["']/.test(read(f)) &&
  /\b(generateText|streamText|generateObject|streamObject)\b/.test(read(f)));
const resendOutsideSend = src.filter(f => f !== "src/lib/email/send.ts" && /new Resend\(/.test(read(f)));
const routeKind = f => {
  const s = read(f);
  const ws = ["@/platform", "@/products", "@/experience", "@/server"].some(p => importsFrom(s, p));
  const tl = importsFrom(s, "@/lib/");
  return ws && !tl ? "workspace" : ws ? "mixed" : tl ? "tenant" : "neither";
};
const routeCounts = routes.reduce((acc, f) => ({ ...acc, [routeKind(f)]: (acc[routeKind(f)] ?? 0) + 1 }), {});
const businessRecord = /create table[^;]*business_record/i.test(migrationText);
// Section 0: every captured lead also lands in Postgres, and the release
// manifest covers every client repo.
const leadStore = /create table public\.tenant_leads\b/.test(migrationText) &&
  /\bmirrorLead\(/.test(read("src/lib/leads.ts"));
let manifestRepos = 0;
try { manifestRepos = JSON.parse(read("release-manifest.json")).customRepoWorkspace?.repos?.length ?? 0; } catch { manifestRepos = 0; }
const workspaceLeads = /create table[^;]*\binquir\w*[^;]*workspace_id uuid[^;]*references public\.workspaces/is
  .test(migrationText);

// target: what Strelva Reborn requires. baseline: measured 2026-10-02 on nav-three-places.
const checks = [
  { id: "lead_store", label: "Captured leads also written to Postgres", value: leadStore, target: true, baseline: false },
  { id: "client_repos_in_manifest", label: "release-manifest.json lists all 9 client repos", value: manifestRepos >= 9, target: true, baseline: false },
  { id: "business_record", label: "Business record table exists", value: businessRecord, target: true, baseline: false },
  { id: "workspace_keyed_inquiries", label: "Inquiry table references workspaces(id)", value: workspaceLeads, target: true, baseline: false },
  { id: "workspace_imports_lib", label: "Workspace files importing @/lib", value: workspaceOnLib.length, target: 0, baseline: 98 },
  { id: "lib_imports_workspace", label: "src/lib files importing workspace layers", value: libOnWorkspace.length, target: 0, baseline: 2 },
  { id: "model_call_sites", label: "Files calling the model directly", value: modelCallSites.length, target: 1, baseline: 12 },
  { id: "resend_outside_send", label: "Resend clients outside email/send.ts (webhook verify allowed)", value: resendOutsideSend.length, target: 1, baseline: 2 },
  { id: "tenant_gate_files", label: "Files using requireTenantAccess/Permission", value: tenantGate.length, target: null, baseline: 79 },
  { id: "routes_tenant_only", label: "API routes on tenant model only", value: routeCounts.tenant ?? 0, target: null, baseline: 153 },
  { id: "routes_workspace_only", label: "API routes on workspace model only", value: routeCounts.workspace ?? 0, target: null, baseline: 47 },
];
const met = c => c.target === null ? null : typeof c.target === "boolean" ? c.value === c.target : c.value <= c.target;

const details = {
  lib_imports_workspace: libOnWorkspace,
  model_call_sites: modelCallSites,
  resend_outside_send: resendOutsideSend,
};

const arg = name => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ checks: checks.map(c => ({ ...c, met: met(c) })), details }, null, 2));
} else if (process.argv.includes("--markdown")) {
  // --previous <file>: an earlier --json run (the last Preview build) for night-over-night change.
  let previous = new Map();
  const previousPath = arg("--previous");
  if (previousPath) {
    try {
      previous = new Map(JSON.parse(readFileSync(previousPath, "utf8")).checks.map(c => [c.id, c.value]));
    } catch { previous = new Map(); }
  }
  const done = checks.filter(c => met(c) === true).length;
  const goals = checks.filter(c => met(c) !== null).length;
  console.log(`### Strelva Reborn progress: ${done} of ${goals} code targets met\n`);
  console.log("| | Check | Now | Last Preview | Baseline (Oct 2) | Target |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const c of checks) {
    const state = met(c) === null ? "·" : met(c) ? "✅" : "⬜";
    const last = previous.has(c.id) ? String(previous.get(c.id)) : "—";
    console.log(`| ${state} | ${c.label} | ${c.value} | ${last} | ${c.baseline ?? "—"} | ${c.target ?? "track"} |`);
  }
} else {
  console.log("Strelva Reborn code progress (working tree, not production)\n");
  for (const c of checks) {
    const state = met(c) === null ? "track" : met(c) ? "done " : "open ";
    const target = c.target === null ? "" : `  target ${c.target}`;
    console.log(`  [${state}] ${c.label}: ${c.value}${target}`);
  }
  for (const [id, list] of Object.entries(details)) {
    if (list.length) console.log(`\n  ${id}:\n${list.map(f => `    ${relative(".", f)}`).join("\n")}`);
  }
}

if (process.argv.includes("--strict") && checks.some(c => met(c) === false)) process.exitCode = 1;
