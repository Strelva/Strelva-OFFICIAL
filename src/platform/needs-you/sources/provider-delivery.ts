/**
 * Provider delivery confirmation as a Needs you item (`request.scope`).
 *
 * Pending: the provider accepted the delivery, the assigned work is
 * completed, and the customer hasn't confirmed it. Approve runs the
 * lifecycle's own `decide` command (`decide_provider_delivery`, decision
 * `confirmed`) through `ProviderDeliveryService`. Not yet changes nothing:
 * asking for changes needs the owner's note, so it stays on the delivery
 * screen.
 */
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ProviderDelivery } from "@/platform/offerings/provider-delivery";
import type { ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";
import { itemDetail, itemTitle, memberActor, proposeAsMember, revisionOf, unchangedOutcome, workspaceHref } from "./shared";

export interface ProviderDeliveryPorts {
  list(actor: WorkspaceActor, businessId: string): Promise<ProviderDelivery[]>;
  /** Whether the provider's assigned work is completed, so the customer can confirm. */
  workCompleted(actor: WorkspaceActor, delivery: ProviderDelivery): Promise<boolean>;
  /** The lifecycle's own command: ProviderDeliveryService.execute({ action: "decide", ... }). */
  confirm(actor: WorkspaceActor, input: { deliveryId: string; expectedRevision: number; note: string }): Promise<ProviderDelivery>;
}

function pending(delivery: ProviderDelivery): boolean {
  return delivery.status === "accepted" && delivery.customerDecision === "pending";
}

function deliveryRevision(delivery: ProviderDelivery): string {
  return revisionOf("provider_delivery", delivery.id, delivery.revision, delivery.status, delivery.customerDecision, delivery.scope);
}

export function providerDeliveryItem(delivery: ProviderDelivery): ProposedItem | null {
  if (!pending(delivery)) return null;
  return {
    kind: "request.scope",
    route: "owner_decides",
    title: itemTitle(`Confirm the delivered work: ${delivery.scope.join(", ")}`),
    detail: itemDetail(`Scope: ${delivery.scope.join("; ")}`),
    approveEffect: "You confirm the provider delivered this work.",
    notYetEffect: "Nothing changes; open it to ask for changes.",
    sourceLifecycle: "provider_delivery",
    sourceId: delivery.id,
    revisionHash: deliveryRevision(delivery),
    urgent: false,
    adminMayDecide: true,
    openHref: workspaceHref(delivery.businessId, { view: "operations", assignmentId: delivery.assignmentId }),
  };
}

export function providerDeliveryAdapter(ports: ProviderDeliveryPorts): SourceAdapter {
  async function find(actor: WorkspaceActor, workspaceId: string, deliveryId: string) {
    const delivery = (await ports.list(actor, workspaceId)).find(row => row.id === deliveryId && row.businessId === workspaceId);
    return delivery && pending(delivery) && (await ports.workCompleted(actor, delivery)) ? delivery : null;
  }
  return {
    lifecycle: "provider_delivery",
    needsMemberActor: true,
    ownerLinkWithoutAccount: true,
    propose: (ctx) => proposeAsMember(ctx, async actor => {
      const items: ProposedItem[] = [];
      for (const delivery of await ports.list(actor, ctx.workspaceId)) {
        if (delivery.businessId !== ctx.workspaceId || !pending(delivery)) continue;
        if (!(await ports.workCompleted(actor, delivery))) continue;
        const item = providerDeliveryItem(delivery);
        if (item) items.push(item);
      }
      return items;
    }),
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      const delivery = await find(ctx.actor, ctx.workspaceId, sourceId);
      return delivery ? deliveryRevision(delivery) : null;
    },
    async resolve(ctx, item, decision, by) {
      const unchanged = unchangedOutcome(decision, by);
      if (unchanged) return unchanged;
      const actor = memberActor(by);
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const delivery = await find(actor, ctx.workspaceId, item.sourceId);
        if (!delivery) return { outcome: "done", reason: "already_resolved" };
        if (deliveryRevision(delivery) !== item.revisionHash) return { outcome: "failed", reason: "source_changed" };
        const decided = await ports.confirm(actor, { deliveryId: delivery.id, expectedRevision: delivery.revision, note: "Confirmed from Needs you." });
        if (decided.customerDecision !== "confirmed") return { outcome: "failed", reason: "not_confirmed" };
        return { outcome: "done", receiptRef: `provider_delivery:${decided.id}:${decided.revision}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
