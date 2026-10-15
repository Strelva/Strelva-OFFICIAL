#!/usr/bin/env npx tsx
/**
 * Read-only view of the built-in App Releases (src/platform/app-releases).
 *
 *   pnpm app-releases                        # the catalog: Apps, Releases, gates, required Connections
 *   pnpm app-releases --workspace <uuid>     # where one business stands in each App
 *
 * Writes nothing and calls nothing outside the existing release-flag RPC.
 * Loads `.env.local` for the workspace form, as the other release scripts do.
 */
import { assertBuiltInAppCatalog, BUILT_IN_APPS, builtInAppReleaseLabel, type AppReleaseGate, type BuiltInApp } from "../src/platform/app-releases";
import type { BuiltInAppReleaseState } from "../src/platform/app-releases";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function gateText(gate: AppReleaseGate): string {
  return gate.kind === "workspace_flag" ? `flag ${gate.flag}` : `env ${gate.name}=${gate.values.join("|")}`;
}

function appLines(app: BuiltInApp): string[] {
  const gates = app.availability.length ? `available when ${app.availability.map(gateText).join(" and ")}` : "always available";
  return [
    `${app.name} · latest Release ${app.releases.length} · ${gates}`,
    ...app.releases.map(release => {
      const needs = release.requiredConnections.length ? release.requiredConnections.map(item => `${item.provider}${item.optional ? " (optional)" : ""}`).join(", ") : "no outside accounts";
      return `  Release ${release.number} ${release.key} · ${release.shippedIn ? `shipped in ${release.shippedIn}` : "not shipped"} · gates: ${release.gates.length ? release.gates.map(gateText).join(", ") : "none"} · needs: ${needs}`;
    }),
  ];
}

export function formatCatalog(apps: readonly BuiltInApp[] = BUILT_IN_APPS): string {
  assertBuiltInAppCatalog(apps);
  return apps.flatMap(appLines).join("\n");
}

export function formatWorkspace(states: readonly BuiltInAppReleaseState[], apps: readonly BuiltInApp[] = BUILT_IN_APPS): string {
  return states.map(state => {
    const app = apps.find(item => item.id === state.appId)!;
    if (!state.available) return `${app.name} · not available for this business`;
    const held = state.heldBack ? ` · held back at ${builtInAppReleaseLabel(app, state.heldBack.number)} by ${state.heldBack.gates.map(gateText).join(", ")}` : "";
    return `${builtInAppReleaseLabel(app, state.release)} of ${state.latest}${held}`;
  }).join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--workspace");
  console.log(formatCatalog());
  if (at === -1) return;
  const workspaceId = args[at + 1] ?? "";
  if (!UUID.test(workspaceId)) throw new Error("Usage: pnpm app-releases [--workspace <uuid>]");
  const { readBuiltInAppReleases } = await import("../src/platform/app-releases/server");
  const { OPERATOR_VIEWER } = await import("../src/platform/release-flags/viewer");
  console.log(`\nWorkspace ${workspaceId}\n${formatWorkspace(await readBuiltInAppReleases(workspaceId, OPERATOR_VIEWER))}`);
}

if (process.argv[1]?.endsWith("app-releases.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
