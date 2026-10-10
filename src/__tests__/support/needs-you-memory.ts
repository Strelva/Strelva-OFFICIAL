/**
 * In-memory twin of the Needs you SQL functions, enough to drive the service
 * in unit tests. The SQL itself is proven by tests/needs-you-schema.sql.
 * Members see owner_decides items only, as list_owner_decisions does; a
 * session claim refuses strelva_reviews items and admins on owner-only items.
 */
import { randomUUID } from "node:crypto";
import type { OwnerDecision, PolicySetting, ProposedItem } from "@/platform/needs-you/contracts";
import { NeedsYouRefusedError, type DeliveryRow, type NeedsYouStore } from "@/platform/needs-you/repository";
import type { WorkspaceActor } from "@/platform/workspaces/types";

const DAY = 24 * 3600 * 1000;

export function needsYouMemoryStore(options: {
  clock: { now: number };
  roles?: Record<string, "owner" | "admin" | "member">;
  policies?: PolicySetting[];
}) {
  const items = new Map<string, OwnerDecision>();
  const roles = options.roles ?? {};
  const iso = () => new Date(options.clock.now).toISOString();
  const store: NeedsYouStore = {
    async open(workspaceId, p: ProposedItem) {
      const same = [...items.values()].find((i) => i.workspaceId === workspaceId && i.sourceLifecycle === p.sourceLifecycle && i.sourceId === p.sourceId && i.revisionHash === p.revisionHash);
      if (same) return same;
      for (const i of items.values()) {
        if (i.workspaceId === workspaceId && i.sourceLifecycle === p.sourceLifecycle && i.sourceId === p.sourceId && i.state === "open") items.set(i.id, { ...i, state: "superseded", decidedAt: iso() });
      }
      const row: OwnerDecision = {
        id: randomUUID(), workspaceId, systemId: p.systemId ?? null, kind: p.kind, route: p.route, title: p.title, detail: p.detail ?? null,
        approveEffect: p.approveEffect, notYetEffect: p.notYetEffect, sourceLifecycle: p.sourceLifecycle, sourceId: p.sourceId,
        revisionHash: p.revisionHash, urgent: p.urgent, signInRequired: ["access.grant", "money", "exit"].includes(p.kind), adminMayDecide: p.adminMayDecide,
        openHref: p.openHref ?? null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
        deliveryState: "not_sent", operatorNote: null, openedAt: iso(), expiresAt: new Date(options.clock.now + 14 * DAY).toISOString(), reminded1At: null, reminded2At: null, deliveries: [],
      };
      items.set(row.id, row);
      return row;
    },
    async withdraw(_ws, id) { const i = items.get(id)!; const next = { ...i, state: "withdrawn" as const, decidedAt: iso() }; items.set(id, next); return next; },
    async read(ws, id) { const i = items.get(id); return i && i.workspaceId === ws ? structuredClone(i) : null; },
    async list(actor: WorkspaceActor, ws, includeClosed) {
      if (!roles[actor.userId]) throw new Error("owner_decision_access_denied");
      return [...items.values()].filter((i) => i.workspaceId === ws && i.route === "owner_decides" && (i.state === "open" || includeClosed));
    },
    async claim(input) {
      const i = items.get(input.itemId);
      if (!i || i.workspaceId !== input.workspaceId) throw new Error("owner_decision_not_found");
      if (i.state !== "open") return { status: i.state === "superseded" ? "changed" : "already_handled", item: i };
      if (i.revisionHash !== input.revision) return { status: "changed", item: i };
      if (input.by === "session") {
        const role = input.actor ? roles[input.actor.userId] : undefined;
        if (!role || i.route !== "owner_decides" || !(role === "owner" || (role === "admin" && i.adminMayDecide))) {
          throw new NeedsYouRefusedError("owner_decision_permission_denied", "You can't decide this.");
        }
      }
      const next = { ...i, state: input.decision === "approve" ? "approved" as const : "declined" as const, decidedAt: iso(), decidedByKind: input.by };
      items.set(i.id, next);
      return { status: "claimed", item: next };
    },
    async expire(_ws, id) { const i = items.get(id)!; const next = { ...i, state: "expired" as const, decidedAt: iso(), decidedByKind: "expiry" }; items.set(id, next); return next; },
    async finish(_ws, id, outcome, reason, receiptRef) { const i = items.get(id)!; const next = { ...i, outcome, outcomeReason: reason, receiptRef }; items.set(id, next); return next; },
    async recordDelivery(_ws, id) { return items.get(id)!; },
    async dueForDelivery() { return [] as DeliveryRow[]; },
    async linkedTenants() { return []; },
    async ownerActor() { return null; },
    async policies() { return options.policies ?? []; },
    async setPolicy() { throw new Error("unused"); },
    async handled() { return []; },
  };
  return { store, items };
}
