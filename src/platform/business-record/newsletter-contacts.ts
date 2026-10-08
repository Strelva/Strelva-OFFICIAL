import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { createUserClient } from "@/platform/infra/db/server-client";
import { dataSourceIsPostgres } from "@/platform/infra/db/source-flags";
import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";
import { releaseWorkspaceForTenant, workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { WorkspaceStoreError } from "@/platform/workspaces/types";

type NewsletterContactsDb = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

function db(): NewsletterContactsDb {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Newsletter storage is unavailable.");
  return client as unknown as NewsletterContactsDb;
}

const subscriptionResult = z.object({
  enabled: z.boolean(),
  duplicate: z.boolean(),
  contact: z.enum(["linked", "failed", "disabled"]),
});

/** The app edge falls back to the unchanged tenant store when this returns null.
 * No workspace read happens with the release off. The RPC writes the subscriber
 * and contact together, but a contact failure keeps the subscription and a
 * repair receipt. Nothing here sends mail or turns a contact into consent. */
export async function subscribeWithNewsletterContact(
  tenantId: string, email: string, name?: string,
): Promise<{ duplicate: boolean } | null> {
  if (!releaseFlagMayBeOn("newsletter_contacts") || !dataSourceIsPostgres()) return null;
  // A failed lookup must not change the legacy newsletter availability.
  let workspaceId: string | null;
  try {
    workspaceId = await releaseWorkspaceForTenant(tenantId);
    if (!workspaceId || !await workspaceReleaseFlagEnabled("newsletter_contacts", workspaceId)) return null;
  } catch {
    return null;
  }
  const { data, error } = await db().rpc("subscribe_newsletter_contact", {
    p_tenant_id: tenantId, p_workspace_id: workspaceId, p_email: email, p_name: name ?? null,
  });
  if (error) throw new WorkspaceStoreError("The newsletter subscription could not be saved.");
  const parsed = subscriptionResult.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("The newsletter subscription response was malformed.");
  if (!parsed.data.enabled) return null;
  return { duplicate: parsed.data.duplicate };
}

const backfillResult = z.object({
  workspaceId: z.string().uuid(), tenantId: z.string(), dryRun: z.boolean(),
  examined: z.number().int().nonnegative(), creates: z.number().int().nonnegative(),
  merges: z.number().int().nonnegative(), invalid: z.number().int().nonnegative(),
  unsubscribed: z.number().int().nonnegative(), linked: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(), nextAfter: z.string().nullable(),
});

/** Preparation is read-only by default. The production run still needs Jacob's
 * explicit authorization; the helper grants none. Page by nextAfter until null.
 * Applying also requires the workspace's row explicitly on (SQL), as well as
 * the env gates (here), and never writes newsletter_subscribers. */
export async function backfillNewsletterContacts(input: {
  tenantId: string; workspaceId: string; apply?: boolean;
  after?: string; limit?: number;
}) {
  const client = await createUserClient();
  if (!client) throw new WorkspaceStoreError("Newsletter backfill requires a signed-in operator.");
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) throw new WorkspaceStoreError("Newsletter backfill requires a signed-in operator.");
  const workspaceId = z.string().uuid().parse(input.workspaceId);
  if (input.apply && (!releaseFlagMayBeOn("newsletter_contacts") || !await workspaceReleaseFlagEnabled("newsletter_contacts", workspaceId))) {
    throw new WorkspaceStoreError("Newsletter contacts are not released for this business.");
  }
  // Carry the verified request session through the RPC; SQL derives auth.uid()
  // and checks current operator authority, including revocation, in its transaction.
  const { data, error } = await (client as unknown as NewsletterContactsDb).rpc("backfill_newsletter_contacts", {
    p_tenant_id: z.string().min(1).max(120).parse(input.tenantId), p_workspace_id: workspaceId,
    p_apply: input.apply ?? false, p_after: input.after ?? null,
    p_limit: z.number().int().min(1).max(500).parse(input.limit ?? 500),
  });
  if (error) throw new WorkspaceStoreError("The newsletter contact backfill could not be read or applied.");
  return backfillResult.parse(data);
}
