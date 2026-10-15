/**
 * Logic for scripts/owner-reach-report.ts. Pure: the report reads and prints,
 * and takes no write flags.
 */
import { classifyOperatorRow, type OperatorOwnerProblem } from "../src/platform/owner-reach/operator";
import type { OperatorOwnerReachRow } from "../src/platform/owner-reach/contracts";

export interface OwnerReachArgs { json: boolean; all: boolean }

const USAGE = "Usage: STRELVA_OPERATOR_SESSION_ACCESS_TOKEN=<signed session> npx tsx scripts/owner-reach-report.ts [--all] [--json]";

export function parseOwnerReachArgs(argv: string[]): OwnerReachArgs {
  const unknown = argv.filter((arg) => arg !== "--json" && arg !== "--all");
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(", ")}\n${USAGE}`);
  return { json: argv.includes("--json"), all: argv.includes("--all") };
}

const PROBLEM: Record<OperatorOwnerProblem, string> = {
  owner_in: "owner signed in",
  invite_pending: "invitation pending, not emailed",
  staff_address: "staff address",
  missing: "no owner email",
  proposed_waiting: "address waiting for the owner to confirm",
  trusted_real: "owner email on record",
};
const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : "-");

export function formatOwnerReachReport(rows: readonly OperatorOwnerReachRow[], options: { all: boolean; emailOn?: boolean }): string[] {
  const classified = rows.map((row) => ({ row, ...classifyOperatorRow(row, options.emailOn) }));
  const noRealEmail = classified.filter((item) => ["staff_address", "missing", "proposed_waiting"].includes(item.problem));
  const shown = (options.all ? classified : classified.filter((item) => item.unreachable))
    .sort((a, b) => Number(b.unreachable) - Number(a.unreachable) || a.row.name.localeCompare(b.row.name));
  const lines = ["name | sites | problem | contact on record | pending invite | open decisions | soonest lapse"];
  for (const { row, problem } of shown) {
    const contact = row.trusted ? `${row.trusted.email}${row.trusted.staffReason ? ` (${row.trusted.staffReason})` : ""}` : "none";
    const invite = row.invite ? `${row.invite.kind} to ${row.invite.recipientEmail} until ${day(row.invite.expiresAt)}` : "none";
    lines.push([row.name, row.sites.join(", ") || "-", PROBLEM[problem], contact, invite, String(row.openDecisions), day(row.soonestLapse)].join(" | "));
  }
  lines.push(`${noRealEmail.length} of ${rows.length} businesses have no real owner email`);
  return lines;
}
