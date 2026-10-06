/**
 * Logic for scripts/business-ownership.ts. Readers and writers are injected so
 * tests prove a dry run writes nothing and that email needs Jacob's yes.
 */
import type {
  OwnerInvitationResult,
  OwnerInvitationState,
  StrelvaAgencyDesignation,
} from "../src/platform/workspaces/business-ownership";
import type { TenantLinkState } from "../src/platform/business-record";
import { isLocalDatabaseUrl } from "./tenant-conversion";

export type OwnershipCommand = "designate-agency" | "invite-owner" | "revoke-owner-invite";

export interface OwnershipOptions {
  command: OwnershipCommand;
  target: string;
  operatorEmail: string;
  recipientEmail?: string;
  apply: boolean;
  jacobsYes: boolean;
  json: boolean;
  databaseUrl?: string;
}

export interface OwnershipDeps {
  readLink(operatorEmail: string, tenantId: string): Promise<TenantLinkState>;
  readState(operatorEmail: string, workspaceId: string): Promise<OwnerInvitationState>;
  invite(operatorEmail: string, workspaceId: string, options: { recipientEmail?: string; sendEmail: boolean }): Promise<OwnerInvitationResult>;
  revoke(operatorEmail: string, invitationId: string): Promise<string>;
  designate(operatorEmail: string, workspaceId: string): Promise<StrelvaAgencyDesignation>;
  log(line: string): void;
}

const USAGE = "Usage: business-ownership <designate-agency <agency-workspace-id> | invite-owner <tenant-slug> | revoke-owner-invite <invitation-id>> --operator-email=<super admin> [--recipient=<email>] [--apply] [--i-have-jacobs-yes] [--json]";

export function parseOwnershipArgs(argv: string[]): OwnershipOptions {
  const [command, target] = argv.filter((arg) => !arg.startsWith("--"));
  if (command !== "designate-agency" && command !== "invite-owner" && command !== "revoke-owner-invite") throw new Error(USAGE);
  if (!target) throw new Error(USAGE);
  const unknown = argv.filter((arg) => arg.startsWith("--") && !/^--(?:apply|dry-run|json|i-have-jacobs-yes|operator-email=.+|recipient=.+)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(", ")}`);
  const apply = argv.includes("--apply");
  if (apply && argv.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  const operatorEmail = argv.find((arg) => arg.startsWith("--operator-email="))?.slice("--operator-email=".length);
  if (!operatorEmail) throw new Error("--operator-email=<a Strelva super admin> is required; ownership lives in the database.");
  const recipientEmail = argv.find((arg) => arg.startsWith("--recipient="))?.slice("--recipient=".length);
  if (recipientEmail && command !== "invite-owner") throw new Error("--recipient applies to invite-owner only.");
  return { command, target, operatorEmail, recipientEmail, apply, jacobsYes: argv.includes("--i-have-jacobs-yes"), json: argv.includes("--json") };
}

function assertWriteAllowed(options: OwnershipOptions): void {
  if (!options.apply) return;
  if (!isLocalDatabaseUrl(options.databaseUrl) && !options.jacobsYes) {
    throw new Error("Refusing --apply: the database is not a local loopback host. This is a production change and needs Jacob's yes (--i-have-jacobs-yes).");
  }
}

export interface OwnershipOutcome {
  mode: "dry-run" | "apply";
  command: OwnershipCommand;
  state?: OwnerInvitationState;
  invitation?: OwnerInvitationResult;
  designation?: StrelvaAgencyDesignation;
  revoked?: string;
}

export async function runOwnershipCommand(options: OwnershipOptions, deps: OwnershipDeps): Promise<OwnershipOutcome> {
  assertWriteAllowed(options);
  const mode = options.apply ? "apply" : "dry-run";
  const log = deps.log;
  log(`Business ownership: ${options.command} ${options.target} (${mode})`);
  log(`  database: ${options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "NOT local") : "not configured"}`);

  if (options.command === "designate-agency") {
    log(`  would name workspace ${options.target} Strelva's agency workspace and mark every converted business as operated by it`);
    log("  the mark grants no access; Strelva keeps reaching clients only through its admin membership");
    if (!options.apply) { log("Dry run: nothing was written."); return { mode, command: options.command }; }
    const designation = await deps.designate(options.operatorEmail, options.target);
    log(designation.replayed
      ? `Already designated (${designation.designatedAt}); marked ${designation.marked} business(es) converted since.`
      : `Designated. Marked ${designation.marked} converted business(es).`);
    return { mode, command: options.command, designation };
  }

  if (options.command === "revoke-owner-invite") {
    if (!options.apply) { log(`  would revoke owner invitation ${options.target}`); log("Dry run: nothing was written."); return { mode, command: options.command }; }
    const revoked = await deps.revoke(options.operatorEmail, options.target);
    log(`  invitation is now ${revoked}`);
    return { mode, command: options.command, revoked };
  }

  const link = await deps.readLink(options.operatorEmail, options.target);
  if (!link.link) throw new Error(`"${options.target}" is not converted to a business yet. Convert it first (scripts/convert-tenant-to-workspace.ts).`);
  const state = await deps.readState(options.operatorEmail, link.link.workspaceId);
  const recipient = options.recipientEmail?.trim().toLowerCase() || state.recipient?.email || null;
  log(`  business: ${state.workspaceName} (${state.workspaceId})`);
  log(`  sites: ${state.tenants.map((tenant) => `${tenant.tenantId} "${tenant.siteName}"`).join(", ")}`);
  log(`  owner today: ${state.hasOwner ? "yes, nothing to do" : "none"}`);
  if (state.pending.length) log(`  pending owner invitation: ${state.pending.map((item) => `${item.invitationId} to ${item.recipientEmail} until ${item.expiresAt}`).join("; ")}`);
  log(`  recipient: ${recipient ?? "none on record (pass --recipient=<email>)"}${!options.recipientEmail && state.recipient ? ` (from ${state.recipient.from === "record" ? "the business record" : "the tenant owner email"})` : ""}`);
  log(`  on accept: workspace owner + tenant owner on ${state.tenants.length} site(s), in one transaction; Strelva stays admin`);
  const sendEmail = options.jacobsYes;
  log(`  email: ${sendEmail ? `through src/lib/email/send.ts (client audience, tenant ${state.tenants[0]?.tenantId ?? "none"}; the per-client email switch applies)` : "not sent without --i-have-jacobs-yes; the accept link is printed for a local rehearsal"}`);
  if (state.hasOwner) { log("Nothing to do."); return { mode, command: options.command, state }; }
  if (!recipient) throw new Error("No owner address is on record. Pass --recipient=<email>.");
  if (!options.apply) { log("Dry run: nothing was written and no email was sent."); return { mode, command: options.command, state }; }
  const invitation = await deps.invite(options.operatorEmail, state.workspaceId, { recipientEmail: recipient, sendEmail });
  log(`  invitation ${invitation.invitation.invitationId} to ${invitation.invitation.recipientEmail}, expires ${invitation.invitation.expiresAt}`);
  if (invitation.delivery.status === "sent") {
    log(`  email accepted by the provider (${invitation.delivery.providerMessageId})`);
  } else {
    log(`  email not sent (${invitation.delivery.reason}). Share this accept link by hand, or revoke: ${invitation.acceptUrl}`);
  }
  return { mode, command: options.command, state, invitation };
}
