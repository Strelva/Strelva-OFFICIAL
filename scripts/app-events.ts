#!/usr/bin/env npx tsx
/**
 * Operator view and switch for Events Apps receive (src/platform/app-events).
 *
 *   pnpm app-events status                                                    # capture switch and delivery health
 *   pnpm app-events capture on|off --operator-email <email> --reason "<why>"  # the database capture switch
 *   pnpm app-events lanes --workspace <uuid> --operator-email <email>         # one business's lanes, no payloads
 *
 * Capture changes need --yes against a local (loopback) database. Any other database
 * is production: that is Jacob's yes, given as --production-approved. Nothing here
 * prints a secret or an event's data. Loads `.env.local`, as the other scripts do.
 */
import { isLocalDatabaseUrl } from "./tenant-conversion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = [
  "Usage:",
  "  pnpm app-events status",
  '  pnpm app-events capture on|off --operator-email <email> --reason "<why>" (--yes | --production-approved)',
  "  pnpm app-events lanes --workspace <uuid> --operator-email <email>",
].join("\n");

export type AppEventsCommand =
  | { command: "status" }
  | { command: "capture"; capture: boolean; operatorEmail: string; reason: string; yes: boolean; productionApproved: boolean }
  | { command: "lanes"; workspaceId: string; operatorEmail: string };

export function parseArgs(argv: readonly string[]): AppEventsCommand {
  const known = new Set(["operator-email", "reason", "workspace", "yes", "production-approved"]);
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at]!;
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals === -1 ? undefined : equals);
    if (!known.has(name)) throw new Error(`Unknown flag --${name}. ${USAGE}`);
    if (equals !== -1) { flags.set(name, arg.slice(equals + 1)); continue; }
    if (name === "yes" || name === "production-approved") { flags.set(name, true); continue; }
    const next = argv[at + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`--${name} needs a value. ${USAGE}`);
    flags.set(name, next);
    at++;
  }
  const text = (name: string) => { const value = flags.get(name); return typeof value === "string" ? value.trim() : ""; };
  const [command, sub, ...rest] = positional;
  if (rest.length) throw new Error(`Unexpected argument ${rest[0]}. ${USAGE}`);

  if (command === "status" && !sub) return { command: "status" };
  if (command === "capture") {
    if (sub !== "on" && sub !== "off") throw new Error(`capture needs on or off. ${USAGE}`);
    const operatorEmail = text("operator-email");
    const reason = text("reason");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(operatorEmail)) throw new Error(`--operator-email is required. ${USAGE}`);
    if (reason.length < 3 || reason.length > 500) throw new Error(`--reason (3 to 500 characters) is required. ${USAGE}`);
    return { command: "capture", capture: sub === "on", operatorEmail, reason, yes: flags.get("yes") === true, productionApproved: flags.get("production-approved") === true };
  }
  if (command === "lanes" && !sub) {
    const workspaceId = text("workspace");
    const operatorEmail = text("operator-email");
    if (!UUID.test(workspaceId)) throw new Error(`--workspace (uuid) is required. ${USAGE}`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(operatorEmail)) throw new Error(`--operator-email is required. ${USAGE}`);
    return { command: "lanes", workspaceId: workspaceId.toLowerCase(), operatorEmail };
  }
  throw new Error(USAGE);
}

/** Changing the capture switch is a stop unless it is local and confirmed, or Jacob approved production. */
export function captureStop(command: Extract<AppEventsCommand, { command: "capture" }>, databaseUrl: string | undefined): string | null {
  if (command.productionApproved) return null;
  if (command.yes && isLocalDatabaseUrl(databaseUrl)) return null;
  if (command.yes) return "STOP: SUPABASE_URL is not a local loopback host. Changing the capture switch there is Jacob's yes (--production-approved). Nothing changed.";
  return "STOP: changing the capture switch needs --yes against a local database, or --production-approved. Nothing changed.";
}

const when = (value: string | null) => value ?? "never";

export async function run(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<{ lines: string[]; exitCode: number }> {
  const command = parseArgs(argv);
  const store = await import("../src/platform/app-events/store");
  if (command.command === "status") {
    const [capture, health] = await Promise.all([store.readCapture(), store.readAppEventHealth()]);
    return { exitCode: 0, lines: [
      `Capture: ${capture.capture ? "on" : "off"}${capture.changedAt ? ` since ${capture.changedAt}` : ""}${capture.reason ? ` (${capture.reason})` : ""}`,
      `Lanes behind: ${health.lanesBehind} · retrying: ${health.lanesRetrying}`,
      `Set aside in 24 hours: ${health.deadLast24h} · emit failures in 24 hours: ${health.emitFailuresLast24h}`,
      `Oldest undelivered: ${when(health.oldestUndeliveredAt)}`,
    ] };
  }
  if (command.command === "capture") {
    const stop = captureStop(command, env.SUPABASE_URL);
    if (stop) return { exitCode: 1, lines: [stop] };
    const after = await store.setCapture(command.operatorEmail, command.capture, command.reason);
    return { exitCode: 0, lines: [`Capture is now ${after.capture ? "on" : "off"}.`] };
  }
  const view = await store.readOperatorDeliveries(command.operatorEmail, command.workspaceId);
  return { exitCode: 0, lines: [
    `Business ${view.workspaceId} · capture ${view.captureOn ? "on" : "off"} · last sequence ${view.stream.lastSequence}`,
    ...view.lanes.map((lane) => `  ${lane.subscriber} · through #${lane.deliveredThrough} · behind ${lane.behind} · tries ${lane.attempts}${lane.lastError ? ` · ${lane.lastError}` : ""}`),
    ...view.deadLetters.map((letter) => `  set aside #${letter.sequence} ${letter.type} · ${letter.subscriber} · ${letter.attempts} tries${letter.replayOutcome ? ` · ${letter.replayOutcome}` : ""}`),
    ...view.endpoints.map((endpoint) => `  webhook ${endpoint.id} · ${new URL(endpoint.url).host} · ${endpoint.status} · secret ends in ${endpoint.secretHint}`),
  ] };
}

if (process.argv[1]?.endsWith("app-events.ts")) {
  run(process.argv.slice(2)).then(({ lines, exitCode }) => {
    for (const line of lines) console.log(line);
    process.exitCode = exitCode;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
