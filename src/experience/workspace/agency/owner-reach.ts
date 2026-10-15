/**
 * Whether each client's owner can be reached, merged into the agency overview.
 *
 * One address-free read (`read_agency_client_owner_reach`) says who is signed
 * in, what contact is on record, which claim or invitation is pending and when
 * each open owner decision lapses. This turns that into a plain state per
 * client, a "Lapses in N days" time on each owner decision, and one
 * "Owner not reachable" Queue item per client whose owner can't be told. It
 * changes no clock: items still lapse at day 14. Off unless
 * STRELVA_OWNER_REACH_RELEASE=1; then the page comes back untouched.
 */
import { z } from "zod";
import { clientEmailPolicyAllows } from "@/platform/infra/email/send";
import { ownerReach, ownerReachReleaseEnabled, ownerReachRowSchema } from "@/platform/owner-reach";
import type { VersionsDb } from "@/platform/system-versions/supabase-store";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { AgencyClientsPage, AgencyQueueItem } from "../agency-clients";

const GAP = "Owner reach: could not be read.";

export interface OwnerReachOptions {
  enabled: boolean;
  clientEmailOn(workspaceId: string): Promise<boolean>;
  now: number;
}

const defaults = (): OwnerReachOptions => ({
  enabled: ownerReachReleaseEnabled(),
  clientEmailOn: workspaceId => clientEmailPolicyAllows({ workspaceId }),
  now: Date.now(),
});

export async function addAgencyOwnerReach(actor: WorkspaceActor, page: AgencyClientsPage, db: VersionsDb, options: OwnerReachOptions = defaults()): Promise<AgencyClientsPage> {
  if (!options.enabled) return page;
  const ready = page.clients.filter(client => client.status === "ready");
  if (!ready.length) return page;
  const ids = ready.map(client => client.workspaceId);
  try {
    const { data, error } = await db.rpc("read_agency_client_owner_reach", {
      p_agency_workspace_id: page.agencyWorkspaceId,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail.trim().toLowerCase(),
      p_workspace_ids: ids,
    });
    if (error) throw new Error("owner reach read failed");
    const rows = z.array(ownerReachRowSchema).parse(data);
    if (rows.some(row => !ids.includes(row.workspaceId))) throw new Error("Agency scope changed.");
    const byWorkspace = new Map(rows.map(row => [row.workspaceId, row]));
    const emailOn = new Map(await Promise.all(rows.map(async row => [row.workspaceId,
      row.ownerMember ? false : await options.clientEmailOn(row.workspaceId).catch(() => false)] as const)));

    const reach = new Map(rows.map(row => [row.workspaceId, ownerReach({
      ownerMember: row.ownerMember, contact: row.contact, contactProposed: row.contactProposed,
      invite: row.invite, clientEmailOn: emailOn.get(row.workspaceId) === true, now: options.now,
    })]));
    const decisionIds = new Map(rows.map(row => [row.workspaceId, new Map(row.decisions.map(decision => [decision.id, decision.expiresAt]))]));

    // Owner decisions gain a lapse time; run twice and the items are the same.
    const oldestOpen = new Map<string, string>();
    const queue: AgencyQueueItem[] = [];
    for (const item of page.queue) {
      if (item.kind === "owner_unreachable") continue;
      const expiresAt = item.kind === "needs_you" && item.decisionId ? decisionIds.get(item.workspaceId)?.get(item.decisionId) : undefined;
      if (!expiresAt) { queue.push(item); continue; }
      const known = oldestOpen.get(item.workspaceId);
      if (!known || Date.parse(item.since) < Date.parse(known)) oldestOpen.set(item.workspaceId, item.since);
      queue.push({ ...item, expiresAt, ownerReachable: reach.get(item.workspaceId)!.reachable });
    }

    const unreachable: AgencyQueueItem[] = [];
    for (const client of ready) {
      const state = reach.get(client.workspaceId);
      if (!state || state.reachable || state.state === "owner_in") continue;
      // An unconfirmed claim keeps its own Queue row: it says not to resend.
      if (queue.some(item => item.kind === "owner_claim" && item.workspaceId === client.workspaceId && item.claimDelivery === "unconfirmed")) continue;
      unreachable.push({
        id: `owner-reach:${client.workspaceId}`, kind: "owner_unreachable", workspaceId: client.workspaceId, clientName: client.name,
        title: `Owner not reachable: ${client.name}`.slice(0, 300), label: state.reason, systemId: null, workId: null,
        since: oldestOpen.get(client.workspaceId) ?? new Date(options.now).toISOString(),
        href: `/workspace?${new URLSearchParams({ workspaceId: page.agencyWorkspaceId, agencyView: "clients" })}#owner-${client.workspaceId}`,
      });
    }
    // One row per client: an owner_unreachable item replaces a claim row that only says the claim wasn't sent.
    const flagged = new Set(unreachable.map(item => item.workspaceId));
    const merged = queue.filter(item => !(item.kind === "owner_claim" && flagged.has(item.workspaceId)
      && (item.claimDelivery === "not_sent" || item.claimDelivery === "no_link")));

    return {
      ...page,
      clients: page.clients.map(client => {
        const row = byWorkspace.get(client.workspaceId);
        const state = reach.get(client.workspaceId);
        if (!row || !state) return client;
        return { ...client, ownerReach: { ...state, canIssueClaim: row.canIssueClaim, contactProposed: row.contactProposed,
          openDecisions: row.decisions.length, lapsedRecently: row.lapsedRecently } };
      }),
      queue: [...merged, ...unreachable],
    };
  } catch {
    return { ...page, queueComplete: false, queueGaps: [...new Set([...(page.queueGaps ?? []), GAP])] };
  }
}
