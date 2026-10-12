#!/usr/bin/env npx tsx
/**
 * Set one per-workspace release row by workspace id. The operator console
 * (/admin/clients/[id]) sets rows for a client's business; this covers a
 * workspace with no client page, such as the Strelva agency workspace, whose
 * library, Clients, Queue and Team follow STRELVA_SYSTEMS_RELEASE=workspace
 * (rows on agency workspaces need 20261008161000).
 *
 *   STRELVA_OPERATOR_SESSION_ACCESS_TOKEN=<signed session> npx tsx scripts/workspace-release-flag.ts <workspace-id> <flag> <off|operators|on|unset> \
 *     --reason="<why>"                                                       # dry run: prints current and planned
 *   … --apply                                                                 # local database
 *   … --apply --i-have-jacobs-yes                                             # any other database
 *
 * Writes one row and one change record through a user-id-bound, revision-checked
 * service RPC. Turning on records an audited approval for the signed-in actor.
 * Any SUPABASE_URL that isn't loopback or
 * `*.localhost` is production: refused, dry run included, without the yes.
 */
import { RELEASE_FLAGS, type ReleaseFlag, type ReleaseFlagRowState } from "../src/platform/release-flags/resolve";
import type { WorkspaceActor } from "../src/platform/workspaces/types";
import type { OperatorAuditContext } from "../src/platform/workspaces/operator-approvals";
import { isLocalDatabaseUrl } from "./tenant-conversion";
import { readOperatorSessionFromEnv } from "./operator-session";

export interface FlagCommand {
  workspaceId: string;
  flag: ReleaseFlag;
  state: ReleaseFlagRowState | "unset";
  reason: string;
  apply: boolean;
  jacobsYes: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = "Usage: STRELVA_OPERATOR_SESSION_ACCESS_TOKEN=<signed session> workspace-release-flag <workspace-id> <flag> <off|operators|on|unset> --reason=<text> [--apply] [--i-have-jacobs-yes]";

export function parseFlagArgs(argv: string[]): FlagCommand {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = argv.filter((arg) => arg.startsWith("--") && !/^--(?:apply|dry-run|i-have-jacobs-yes|reason=.+)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(", ")}. ${USAGE}`);
  const [workspaceId, flag, state] = positional;
  if (!workspaceId || !UUID.test(workspaceId)) throw new Error(`A workspace id (uuid) is required. ${USAGE}`);
  if (!flag || !(RELEASE_FLAGS as readonly string[]).includes(flag)) throw new Error(`Flag must be one of ${RELEASE_FLAGS.join(", ")}. ${USAGE}`);
  if (!state || !["off", "operators", "on", "unset"].includes(state)) throw new Error(`State must be off, operators, on or unset. ${USAGE}`);
  const reason = argv.find((arg) => arg.startsWith("--reason="))?.slice("--reason=".length).trim();
  if (!reason || reason.length < 3) throw new Error(`--reason (3 to 500 characters) is required. ${USAGE}`);
  const apply = argv.includes("--apply");
  if (apply && argv.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  return { workspaceId: workspaceId.toLowerCase(), flag: flag as ReleaseFlag, state: state as FlagCommand["state"], reason, apply, jacobsYes: argv.includes("--i-have-jacobs-yes") };
}

/** Checked before anything is read: a dry run reads production too. */
export function assertFlagTargetAllowed(databaseUrl: string | undefined, command: Pick<FlagCommand, "jacobsYes">): void {
  if (!databaseUrl) throw new Error("SUPABASE_URL is not configured.");
  if (!isLocalDatabaseUrl(databaseUrl) && !command.jacobsYes) {
    throw new Error("Refusing: SUPABASE_URL is not a local loopback host. Changing a production release row needs Jacob's yes (--i-have-jacobs-yes).");
  }
}

export interface FlagDeps {
  actor: WorkspaceActor;
  auditContext: OperatorAuditContext;
  read(workspaceId: string): Promise<{ flags: Record<string, { state: string; revision: number }> }>;
  set(input: { actor: WorkspaceActor; auditContext: OperatorAuditContext; workspaceId: string; flag: ReleaseFlag; state: ReleaseFlagRowState | "unset"; reason: string; expectedRevision: number }): Promise<{ flags: Record<string, { state: string; revision: number }> }>;
}

export async function runFlagCommand(command: FlagCommand, deps: FlagDeps): Promise<{ mode: "dry-run" | "apply"; from: string; to: string }> {
  const current = (await deps.read(command.workspaceId)).flags[command.flag];
  const from = current?.state ?? "unset";
  if (!command.apply) return { mode: "dry-run", from, to: command.state };
  const after = await deps.set({
    actor: deps.actor, auditContext: deps.auditContext, workspaceId: command.workspaceId, flag: command.flag,
    state: command.state, reason: command.reason, expectedRevision: current?.revision ?? 0,
  });
  return { mode: "apply", from, to: after.flags[command.flag]?.state ?? "unset" };
}

async function main() {
  const command = parseFlagArgs(process.argv.slice(2));
  assertFlagTargetAllowed(process.env.SUPABASE_URL, command);
  const session = await readOperatorSessionFromEnv();
  const store = await import("../src/platform/release-flags/store");
  const result = await runFlagCommand(command, {
    actor: { userId: session.userId, verifiedEmail: session.verifiedEmail },
    auditContext: session.auditContext,
    read: (workspaceId) => store.readWorkspaceReleaseFlags(workspaceId, { fresh: true }),
    set: (input) => store.setWorkspaceReleaseFlag(input),
  });
  console.log(`${result.mode === "apply" ? "Changed" : "Dry run, nothing changed:"} ${command.flag} on ${command.workspaceId}: ${result.from} -> ${result.to}`);
}

if (process.argv[1]?.endsWith("workspace-release-flag.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
