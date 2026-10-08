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
import type { ResolveBy, SourceAdapter } from "../adapters";
import type { ProposedItem } from "../contracts";
import { unchangedOutcome } from "./shared";

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

const receiptSchema = z.object({
  decisionId: z.string().uuid(), workspaceId: z.string().uuid(), recordRevision: z.number().int().min(0),
  changeCount: z.number().int().min(0), factKeys: z.array(z.string()), replayed: z.boolean(),
}).passthrough();

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
    /** Businesses with changes waiting on the owner, for the hourly chase. */
    async pendingWorkspaces(limit = 500): Promise<string[]> {
      return z.array(z.string().uuid()).parse(await rpc("list_business_fact_review_workspaces", { p_limit: limit }));
    },
  };
}

const FACT_LABELS: Record<string, string> = {
  legal_name: "Legal name", display_name: "Business name", phone: "Phone", email: "Public email", description: "Description",
  owner_recipient: "Who gets Strelva's emails", address: "Address", service_area: "Service area", hours: "Hours", links: "Links",
};
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ADDRESS_PARTS = ["formatted", "line1", "line2", "city", "region", "postalCode", "country"];
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** One fact's whole public value, every part of it. Unknown shapes print as JSON. */
export function factValueText(key: string, value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (typeof value === "string") return value;
  const item = record(value);
  if (key === "owner_recipient" && item && typeof item.email === "string") return typeof item.name === "string" ? `${item.email} (${item.name})` : item.email;
  if (key === "address" && item && Object.keys(item).every(part => ADDRESS_PARTS.includes(part))) {
    return ADDRESS_PARTS.filter(part => typeof item[part] === "string").map(part => item[part]).join(", ");
  }
  if (key === "service_area" && Array.isArray(value) && value.every(area => typeof area === "string")) return value.join(", ");
  if (key === "links" && Array.isArray(value) && value.every(link => typeof record(link)?.url === "string")) {
    return value.map(link => { const row = record(link)!; return `${String(row.kind ?? "link")}${typeof row.label === "string" ? ` "${row.label}"` : ""}: ${String(row.url)}`; }).join("; ");
  }
  if (key === "hours" && item && Array.isArray(item.weekly) && Object.keys(item).every(part => ["timezone", "weekly", "overrides"].includes(part))) {
    const weekly = item.weekly as Array<Record<string, unknown>>;
    const overrides = Array.isArray(item.overrides) ? item.overrides as Array<Record<string, unknown>> : [];
    return [
      ...[1, 2, 3, 4, 5, 6, 0].map(day => `${DAYS[day]} ${weekly.filter(row => row.day === day).map(row => `${String(row.opens)}–${String(row.closes)}`).join(", ") || "closed"}`),
      ...overrides.map(row => `${String(row.date)}${typeof row.label === "string" ? ` (${row.label})` : ""} ${row.closed ? "closed" : `${String(row.opens)}–${String(row.closes)}`}`),
      `time zone ${String(item.timezone)}`,
    ].join("; ");
  }
  return JSON.stringify(value);
}

const SERVICE_FIELDS = [["description", "Description"], ["durationMinutes", "Length"], ["priceText", "Price"], ["active", "Shown on your site"], ["position", "Order"]] as const;
function serviceFieldText(field: string, value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (field === "durationMinutes" && typeof value === "number") return `${value} minutes`;
  if (field === "active" && typeof value === "boolean") return value ? "yes" : "no";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Every value one change would make public, in full: what the owner approves
 * is exactly what these lines say. Nothing is shortened.
 */
export function businessFactChangeLines(change: BusinessFactChange): string[] {
  if (change.entity === "service") {
    const before = record(change.before);
    const after = record(change.after);
    const name = String(after?.name ?? before?.name ?? "A service");
    const fields = (state: Record<string, unknown>) => SERVICE_FIELDS.filter(([field]) => state[field] !== null && state[field] !== undefined)
      .map(([field, label]) => `${label}: ${serviceFieldText(field, state[field])}`);
    if (!after) return [`Service "${name}" removed${before ? ` (was ${fields(before).join("; ")})` : ""}`];
    if (!before) return [`Service "${name}" added`, ...fields(after).map(line => `Service "${name}" ${line}`)];
    const lines: string[] = [];
    if (JSON.stringify(before.name) !== JSON.stringify(after.name)) lines.push(`Service name: ${serviceFieldText("name", before.name)} → ${serviceFieldText("name", after.name)}`);
    for (const [field, label] of SERVICE_FIELDS) {
      if (JSON.stringify(before[field] ?? null) === JSON.stringify(after[field] ?? null)) continue;
      lines.push(`Service "${name}" ${label}: ${serviceFieldText(field, before[field])} → ${serviceFieldText(field, after[field])}`);
    }
    return lines.length ? lines : [`Service "${name}": ${JSON.stringify(before)} → ${JSON.stringify(after)}`];
  }
  const label = FACT_LABELS[change.id] ?? change.id;
  if (change.after === null || change.after === undefined) return [`${label}: removed (was ${factValueText(change.id, change.before)})`];
  if (change.before === null || change.before === undefined) return [`${label}: ${factValueText(change.id, change.after)} (new)`];
  return [`${label}: ${factValueText(change.id, change.before)} → ${factValueText(change.id, change.after)}`];
}

/** The complete review, one line per changed value. */
export function businessFactReviewLines(review: BusinessFactReview): string[] {
  return review.changes.flatMap(businessFactChangeLines);
}

const DETAIL_LIMIT = 1000;
/**
 * The item detail (1,000 characters in owner_decisions, also the email): the
 * whole review when it fits, otherwise whole lines and a count of the rest.
 * Never a cut value; approval itself happens only where every line is shown.
 */
export function businessFactsDetail(lines: readonly string[]): string {
  const flat = lines.map(line => line.replace(/\s+/g, " ").trim());
  const complete = flat.join("; ");
  if (complete.length <= DETAIL_LIMIT) return complete;
  const rest = (count: number) => `${count === 1 ? "1 more change" : `${count} more changes`}, shown in full before you approve.`;
  const shown: string[] = [];
  for (const line of flat) {
    if ([...shown, line, rest(flat.length - shown.length - 1)].join("; ").length > DETAIL_LIMIT) break;
    shown.push(line);
  }
  return shown.length ? [...shown, rest(flat.length - shown.length)].join("; ")
    : `${flat.length === 1 ? "1 change" : `${flat.length} changes`}, too long to show here. You see every value in full before you approve.`;
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
    detail: businessFactsDetail(businessFactReviewLines({ ...review, changes: ownerRecipientFirst(review.changes) })),
    approveEffect: "These details go live wherever Strelva shows your business. A website Strelva updates by hand follows after a quick check.",
    notYetEffect: "Nothing changes. Your website keeps the details you last confirmed.",
    sourceLifecycle: "business_facts", sourceId: review.workspaceId, revisionHash: review.revisionHash,
    urgent: false, adminMayDecide: false,
    openHref: `/workspace/business-details?workspaceId=${encodeURIComponent(review.workspaceId)}`,
  };
}

export type BusinessFactsReceipt = z.infer<typeof receiptSchema>;
export interface BusinessFactsPorts {
  read(workspaceId: string): Promise<BusinessFactReview | null>;
  confirm(workspaceId: string, decisionId: string, revisionHash: string): Promise<BusinessFactsReceipt>;
  /**
   * After the owner's decision is confirmed: carry it to sites that don't read
   * the confirmed copy themselves. `websitePending` means that work is queued,
   * not done, and the decision says so.
   */
  confirmed?(receipt: BusinessFactsReceipt, by: ResolveBy): Promise<{ websitePending: boolean }>;
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
    // confirm_business_facts accepts only the trusted owner recipient; no link goes elsewhere.
    trustedRecipientOnly: true,
    async propose(ctx) {
      const review = await current(ctx.workspaceId);
      return { items: review ? [businessFactsItem(review)] : [], complete: true };
    },
    async currentRevision(ctx, sourceId) {
      if (sourceId !== ctx.workspaceId) return null;
      return (await current(ctx.workspaceId))?.revisionHash ?? null;
    },
    async review(ctx, item) {
      if (item.sourceId !== ctx.workspaceId) return null;
      const review = await current(ctx.workspaceId);
      return review && review.revisionHash === item.revisionHash ? businessFactReviewLines(review) : null;
    },
    async resolve(ctx, item, decision, by) {
      const unchanged = unchangedOutcome(decision, by);
      if (unchanged) return unchanged;
      let receipt: BusinessFactsReceipt;
      try {
        receipt = await ports.confirm(ctx.workspaceId, item.id, item.revisionHash);
      } catch (error) {
        return { outcome: "failed", reason: error instanceof BusinessFactsChangedError ? "source_changed" : "business_facts_not_confirmed" };
      }
      const after = await ports.confirmed?.(receipt, by).catch(() => ({ websitePending: true })) ?? { websitePending: false };
      return after.websitePending
        ? { outcome: "done_unverified", reason: "website_review_pending", receiptRef: `business_facts:${receipt.decisionId}` }
        : { outcome: "done", receiptRef: `business_facts:${receipt.decisionId}` };
    },
  };
}
