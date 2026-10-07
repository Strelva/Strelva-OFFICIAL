/**
 * Business details a provider changed, waiting on the owner (#509, ADR 0012).
 * Client sites read only the confirmed copy of the business record. An edit
 * by Strelva's operators, any agency (Strelva's included), an admin, an
 * import or a model waits here as one item per business; the owner's own
 * edits are already confirmed. Owner only, by signed link or signed in; the
 * SQL (confirm_business_facts) rechecks the decision, who made it and the
 * exact changes before anything goes live.
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceStoreError } from "@/platform/workspaces/types";
import type { SourceAdapter } from "../adapters";
import type { ProposedItem } from "../contracts";
import { itemDetail, unchangedOutcome } from "./shared";

const changeSchema = z.object({
  entity: z.enum(["fact", "service"]),
  id: z.string().min(1),
  before: z.unknown(),
  after: z.unknown(),
  source: z.string().nullable(),
});
export const businessFactReviewSchema = z.object({
  workspaceId: z.string().uuid(),
  recordRevision: z.number().int().min(0),
  revisionHash: z.string().regex(/^[0-9a-f]{64}$/),
  changes: z.array(changeSchema).min(1),
});
export type BusinessFactReview = z.infer<typeof businessFactReviewSchema>;
export type BusinessFactChange = z.infer<typeof changeSchema>;

const receiptSchema = z.object({ decisionId: z.string().uuid(), changeCount: z.number().int().min(0), replayed: z.boolean() }).passthrough();

/** The record moved on after the owner saw it; nothing was confirmed. */
export class BusinessFactsChangedError extends WorkspaceStoreError {
  constructor() { super("These business details changed after they were shown. Nothing went live."); this.name = "BusinessFactsChangedError"; }
}

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
export function createBusinessFactReviewStore(client?: Rpc) {
  async function rpc(name: string, args: Record<string, unknown>) {
    const db = client ?? getSupabase() as unknown as Rpc | null;
    if (!db) throw new WorkspaceStoreError("Business details review is unavailable.");
    const result = await db.rpc(name, args);
    if (result.error) {
      if (result.error.message.includes("business_facts_changed")) throw new BusinessFactsChangedError();
      if (result.error.message.includes("business_facts_owner_approval_required")) throw new WorkspaceStoreError("Only the owner's decision confirms these details.");
      throw new WorkspaceStoreError("Business details review could not be read.");
    }
    return result.data;
  }
  return {
    async read(workspaceId: string): Promise<BusinessFactReview | null> {
      return businessFactReviewSchema.nullable().parse(await rpc("read_business_fact_review", { p_workspace_id: z.string().uuid().parse(workspaceId) }));
    },
    async confirm(workspaceId: string, decisionId: string, revisionHash: string) {
      return receiptSchema.parse(await rpc("confirm_business_facts", {
        p_workspace_id: z.string().uuid().parse(workspaceId), p_decision_id: z.string().uuid().parse(decisionId), p_revision_hash: revisionHash,
      }));
    },
  };
}

const FACT_LABELS: Record<string, string> = {
  legal_name: "Legal name", display_name: "Business name", phone: "Phone", email: "Public email", description: "Description",
  owner_recipient: "Who gets Strelva's emails", address: "Address", service_area: "Service area", hours: "Hours", links: "Links",
};

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    if (typeof item.email === "string") return item.email;
    if (typeof item.formatted === "string") return item.formatted;
    if (typeof item.line1 === "string") return [item.line1, item.city].filter(value => typeof value === "string").join(", ");
  }
  return null;
}

/** One plain line per change: what the site shows now, and what it would show. */
export function describeBusinessFactChange(change: BusinessFactChange): string {
  if (change.entity === "service") {
    const before = change.before as { name?: unknown; active?: unknown } | null;
    const after = change.after as { name?: unknown; active?: unknown; priceText?: unknown } | null;
    const name = String(after?.name ?? before?.name ?? "A service");
    if (!after || after.active === false) return `Service "${name}": removed`;
    if (!before || before.active === false) return `Service "${name}": added${typeof after.priceText === "string" ? ` (${after.priceText})` : ""}`;
    return `Service "${name}": changed`;
  }
  const label = FACT_LABELS[change.id] ?? change.id;
  const before = text(change.before);
  const after = text(change.after);
  if (change.after === null || change.after === undefined) return `${label}: removed`;
  if (before !== null && after !== null) return `${label}: ${before} → ${after}`;
  if (after !== null) return `${label}: ${after}`;
  return `${label}: updated`;
}

/** A new recipient for owner links is pending until this item is approved
 * (#524), so it leads the detail and never falls past the truncation. */
function ownerRecipientFirst(changes: BusinessFactChange[]): BusinessFactChange[] {
  return [...changes].sort((a, b) => Number(b.entity === "fact" && b.id === "owner_recipient") - Number(a.entity === "fact" && a.id === "owner_recipient"));
}

export function businessFactsItem(review: BusinessFactReview): ProposedItem {
  return {
    // fact.inferred: its floor is owner_decides, so no Strelva policy can loosen it.
    kind: "fact.inferred", route: "owner_decides",
    title: "Confirm changes to your business details",
    detail: itemDetail(ownerRecipientFirst(review.changes).map(describeBusinessFactChange).join("; ")),
    approveEffect: "These details go live on your website and anywhere Strelva shows your business.",
    notYetEffect: "Nothing changes. Your website keeps the details you last confirmed.",
    sourceLifecycle: "business_facts", sourceId: review.workspaceId, revisionHash: review.revisionHash,
    urgent: false, adminMayDecide: false,
    openHref: `/workspace/business-details?workspaceId=${encodeURIComponent(review.workspaceId)}`,
  };
}

export interface BusinessFactsPorts {
  read(workspaceId: string): Promise<BusinessFactReview | null>;
  confirm(workspaceId: string, decisionId: string, revisionHash: string): Promise<z.infer<typeof receiptSchema>>;
}

export function businessFactsAdapter(ports: BusinessFactsPorts): SourceAdapter {
  const current = async (workspaceId: string) => {
    const review = await ports.read(workspaceId);
    return review && review.workspaceId === workspaceId ? review : null;
  };
  return {
    lifecycle: "business_facts",
    // The SQL checks the owner's link or session itself; no member identity is borrowed.
    needsMemberActor: false,
    async propose(ctx) {
      const review = await current(ctx.workspaceId);
      return { items: review ? [businessFactsItem(review)] : [], complete: true };
    },
    async currentRevision(ctx, sourceId) {
      if (sourceId !== ctx.workspaceId) return null;
      return (await current(ctx.workspaceId))?.revisionHash ?? null;
    },
    async resolve(ctx, item, decision, by) {
      const unchanged = unchangedOutcome(decision, by);
      if (unchanged) return unchanged;
      try {
        const receipt = await ports.confirm(ctx.workspaceId, item.id, item.revisionHash);
        return { outcome: "done", receiptRef: `business_facts:${receipt.decisionId}` };
      } catch (error) {
        return { outcome: "failed", reason: error instanceof BusinessFactsChangedError ? "source_changed" : "business_facts_not_confirmed" };
      }
    },
  };
}
