#!/usr/bin/env npx tsx
/**
 * Who owns and operates a converted business. Operator commands only; nothing
 * here runs on its own.
 *
 *   STRELVA_OPERATOR_SESSION_ACCESS_TOKEN=<signed session> npx tsx scripts/business-ownership.ts invite-owner <tenant-slug> # dry run
 *   … invite-owner <tenant-slug> --approval-id=<id> --apply # required for non-trusted addresses
 *   … revoke-owner-invite <invitation-id> --apply
 *   … designate-agency <agency-workspace-id> --apply
 *
 * --apply refuses unless SUPABASE_URL is a loopback host, or --i-have-jacobs-yes
 * is passed. Invitation email is disabled during the silent rollout. The recipient defaults to the
 * business record's owner contact, falling back to tenants.owner_email.
 */
import { getSupabase } from "../src/platform/infra/db/client";
import { readTenantWorkspaceLink } from "../src/platform/business-record";
import {
  designateStrelvaAgencyWorkspace,
  inviteBusinessOwner,
  readOwnerInvitationState,
  revokeOwnerInvitation,
} from "../src/platform/workspaces/business-ownership";
import { parseOwnershipArgs, runOwnershipCommand } from "./business-ownership-ops";
import { readOperatorSessionFromEnv } from "./operator-session";

async function main() {
  const options = parseOwnershipArgs(process.argv.slice(2));
  if (!getSupabase()) throw new Error("No database is configured; ownership lives in Postgres.");
  const session = await readOperatorSessionFromEnv();
  const outcome = await runOwnershipCommand({ ...options, databaseUrl: process.env.SUPABASE_URL }, {
    actor: { userId: session.userId, verifiedEmail: session.verifiedEmail },
    authTime: session.authTime,
    auditContext: session.auditContext,
    readLink: readTenantWorkspaceLink,
    readState: readOwnerInvitationState,
    invite: (actor, workspaceId, input) => inviteBusinessOwner(actor, workspaceId, input),
    revoke: revokeOwnerInvitation,
    designate: designateStrelvaAgencyWorkspace,
    log: options.json ? () => undefined : (line) => console.log(line),
  });
  if (options.json) console.log(JSON.stringify({ ...outcome, invitation: outcome.invitation && { ...outcome.invitation, acceptUrl: outcome.invitation.delivery.status === "sent" ? undefined : outcome.invitation.acceptUrl } }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
