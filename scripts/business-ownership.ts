#!/usr/bin/env npx tsx
/**
 * Who owns and operates a converted business. Operator commands only; nothing
 * here runs on its own.
 *
 *   npx tsx scripts/business-ownership.ts invite-owner <tenant-slug> --operator-email=<super admin>              # dry run
 *   npx tsx scripts/business-ownership.ts invite-owner <tenant-slug> --operator-email=<email> --apply            # local: create, print link, no email
 *   npx tsx scripts/business-ownership.ts invite-owner <tenant-slug> --operator-email=<email> --apply --i-have-jacobs-yes   # send
 *   npx tsx scripts/business-ownership.ts revoke-owner-invite <invitation-id> --operator-email=<email> --apply
 *   npx tsx scripts/business-ownership.ts designate-agency <agency-workspace-id> --operator-email=<email> --apply
 *
 * --apply refuses unless SUPABASE_URL is a loopback host, or --i-have-jacobs-yes
 * is passed. The owner invitation email is sent only with --i-have-jacobs-yes
 * (even locally), through src/lib/email/send.ts, so the per-client email
 * switch still decides whether it leaves. The recipient defaults to the
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

async function main() {
  const options = parseOwnershipArgs(process.argv.slice(2));
  if (!getSupabase()) throw new Error("No database is configured; ownership lives in Postgres.");
  const outcome = await runOwnershipCommand({ ...options, databaseUrl: process.env.SUPABASE_URL }, {
    readLink: readTenantWorkspaceLink,
    readState: readOwnerInvitationState,
    invite: (operator, workspaceId, input) => inviteBusinessOwner(operator, workspaceId, input),
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
