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
import type { WorkspaceActor } from "../src/platform/workspaces/types";
import type { OperatorAuditContext } from "../src/platform/workspaces/operator-approvals";
import { isLocalDatabaseUrl } from "./tenant-conversion";

export type OwnershipCommand = "designate-agency" | "invite-owner" | "revoke-owner-invite";

export interface OwnershipOptions {
  command: OwnershipCommand;
  target: string;
  recipientEmail?: string;
  approvalId?: string;
  apply: boolean;
  jacobsYes: boolean;
  json: boolean;
  databaseUrl?: string;
}

export interface OwnershipDeps {
  actor: WorkspaceActor;
  authTime: number | null;
  auditContext: OperatorAuditContext;
  readLink(operatorEmail: string, tenantId: string): Promise<TenantLinkState>;
  readState(operatorEmail: string, workspaceId: string): Promise<OwnerInvitationState>;
  invite(actor: WorkspaceActor, workspaceId: string, options: { recipientEmail?: string; approvalId?: string; authTime: number | null; auditContext: OperatorAuditContext }): Promise<OwnerInvitationResult>;
  revoke(actor: WorkspaceActor, invitationId: string, auditContext: OperatorAuditContext): Promise<string>;
  designate(actor: WorkspaceActor, workspaceId: string, auditContext: OperatorAuditContext): Promise<StrelvaAgencyDesignation>;
  log(line: string): void;
}

const USAGE = "Usage: STRELVA_OPERATOR_SESSION_ACCESS_TOKEN=<signed session> npx tsx scripts/business-ownership.ts <designate-agency <agency-workspace-id> | invite-owner <tenant-slug> | revoke-owner-invite <invitation-id>> [--recipient=<email>] [--approval-id=<id>] [--apply] [--i-have-jacobs-yes] [--json]";

export function parseOwnershipArgs(argv: string[]): OwnershipOptions {
  const [command, target] = argv.filter((arg) => !arg.startsWith("--"));
  if (command !== "designate-agency" && command !== "invite-owner" && command !== "revoke-owner-invite") throw new Error(USAGE);
  if (!target) throw new Error(USAGE);
  const unknown = argv.filter((arg) => arg.startsWith("--") && !/^--(?:apply|dry-run|json|i-have-jacobs-yes|recipient=.+|approval-id=.+)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(", ")}`);
  const apply = argv.includes("--apply");
  if (apply && argv.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  const recipientEmail = argv.find((arg) => arg.startsWith("--recipient="))?.slice("--recipient=".length);
  if (recipientEmail && command !== "invite-owner") throw new Error("--recipient applies to invite-owner only.");
  const approvalId = argv.find((arg) => arg.startsWith("--approval-id="))?.slice("--approval-id=".length);
  if (approvalId && command !== "invite-owner") throw new Error("--approval-id applies to invite-owner only.");
  return { command, target, recipientEmail, approvalId, apply, jacobsYes: argv.includes("--i-have-jacobs-yes"), json: argv.includes("--json") };
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
  const operatorEmail = deps.actor.verifiedEmail;
  const mode = options.apply ? "apply" : "dry-run";
  const log = deps.log;
  log(`Business ownership: ${options.command} ${options.target} (${mode})`);
  log(`  database: ${options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "NOT local") : "not configured"}`);

  if (options.command === "designate-agency") {
    log(`  would name workspace ${options.target} Strelva's agency workspace and mark every converted business as operated by it`);
    log("  the mark grants no access; Strelva keeps reaching clients only through its admin membership");
    if (!options.apply) { log("Dry run: nothing was written."); return { mode, command: options.command }; }
    const designation = await deps.designate(deps.actor, options.target, deps.auditContext);
    log(designation.replayed
      ? `Already designated (${designation.designatedAt}); marked ${designation.marked} business(es) converted since.`
      : `Designated. Marked ${designation.marked} converted business(es).`);
    return { mode, command: options.command, designation };
  }

  if (options.command === "revoke-owner-invite") {
    if (!options.apply) { log(`  would revoke owner invitation ${options.target}`); log("Dry run: nothing was written."); return { mode, command: options.command }; }
    const revoked = await deps.revoke(deps.actor, options.target, deps.auditContext);
    log(`  invitation is now ${revoked}`);
    return { mode, command: options.command, revoked };
  }

  const link = await deps.readLink(operatorEmail, options.target);
  if (!link.link) throw new Error(`"${options.target}" is not converted to a business yet. Convert it first (scripts/convert-tenant-to-workspace.ts).`);
  const state = await deps.readState(operatorEmail, link.link.workspaceId);
  const recipient = options.recipientEmail?.trim().toLowerCase() || state.recipient?.email || null;
  log(`  business: ${state.workspaceName} (${state.workspaceId})`);
  log(`  sites: ${state.tenants.map((tenant) => `${tenant.tenantId} "${tenant.siteName}"`).join(", ")}`);
  log(`  owner today: ${state.hasOwner ? "yes, nothing to do" : "none"}`);
  if (state.pending.length) log(`  pending owner invitation: ${state.pending.map((item) => `${item.invitationId} to ${item.recipientEmail} until ${item.expiresAt}`).join("; ")}`);
  log(`  recipient: ${recipient ?? "none on record (pass --recipient=<email>)"}${!options.recipientEmail && state.recipient ? ` (from ${state.recipient.from === "record" ? "the business record" : "the tenant owner email"})` : ""}`);
  log(`  on accept: workspace owner + tenant owner on ${state.tenants.length} site(s), in one transaction; Strelva stays admin`);
  log("  email: disabled during the silent rollout; issuance creates a link only");
  if (state.hasOwner) { log("Nothing to do."); return { mode, command: options.command, state }; }
  if (!recipient) throw new Error("No owner address is on record. Pass --recipient=<email>.");
  if (!options.apply) { log("Dry run: nothing was written and no email was sent."); return { mode, command: options.command, state }; }
  const trusted = (() => {
    const owner = state.recipient as (OwnerInvitationState["recipient"] & { trusted?: boolean; source?: string; verified?: boolean }) | null;
    return Boolean(owner && owner.email.trim().toLowerCase() === recipient.trim().toLowerCase() && (
      owner.trusted === true || (owner.from === "record" && (owner.source === "tenant_import" || (owner.source === "owner" && owner.verified === true)))
    ));
  })();
  if (!trusted && !options.approvalId) throw new Error("A different active operator must record an approval. Pass its --approval-id=<id>.");
  const invitation = await deps.invite(deps.actor, state.workspaceId, { recipientEmail: recipient, approvalId: options.approvalId, authTime: deps.authTime, auditContext: deps.auditContext });
  log(`  invitation ${invitation.invitation.invitationId} to ${invitation.invitation.recipientEmail}, expires ${invitation.invitation.expiresAt}`);
  if (invitation.delivery.status === "sent") {
    log(`  email accepted by the provider (${invitation.delivery.providerMessageId})`);
  } else {
    log(`  email not sent (${invitation.delivery.reason}). Share this accept link by hand, or revoke: ${invitation.acceptUrl}`);
  }
  return { mode, command: options.command, state, invitation };
}
