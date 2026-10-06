import { randomUUID } from "node:crypto";
import { getSupabase } from "@/platform/infra/db/client";
import type { ListingAction, ListingAuthority, ListingReceipt, Readback, ReceiptStatus, UndoDescriptor } from "./contracts";

/**
 * Where Google-write receipts live: public.google_listing_receipts through its
 * service-role functions, or an in-memory copy with the same rules for tests
 * and local fixtures. Not an approval store: approvals stay where they are
 * (the tenant event today, one approval store later).
 */

export interface RecordReceiptInput {
  workspaceId: string;
  bindingId: string | null;
  locationId: string;
  action: ListingAction;
  targetRef: string | null;
  authority: ListingAuthority;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  undo?: UndoDescriptor | null;
  undoesReceiptId?: string | null;
  idempotencyKey: string;
}

export interface SettleReceiptInput {
  status: Exclude<ReceiptStatus, "posting" | "undone">;
  readback?: Readback | null;
  after?: Record<string, unknown> | null;
  providerRef?: string | null;
  error?: string | null;
  undo?: UndoDescriptor | null;
}

export interface ListingReceiptStore {
  record(input: RecordReceiptInput): Promise<{ receipt: ListingReceipt; replayed: boolean }>;
  settle(receiptId: string, workspaceId: string, input: SettleReceiptInput): Promise<ListingReceipt>;
  get(receiptId: string, workspaceId: string): Promise<ListingReceipt | null>;
}

export class ListingReceiptError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ListingReceiptError";
  }
}

const ACCEPTED: ReceiptStatus[] = ["posted", "posted_unverified", "held_by_google"];

/** The SQL guard, in TypeScript: accepted writes only move forward. */
export function receiptTransitionAllowed(from: ReceiptStatus, to: ReceiptStatus): boolean {
  if (from === to) return true;
  if (from === "posting") return ["posted", "posted_unverified", "held_by_google", "failed"].includes(to);
  if (from === "posted_unverified") return ["posted", "held_by_google", "undone"].includes(to);
  if (from === "held_by_google") return ["posted", "posted_unverified", "undone"].includes(to);
  if (from === "posted") return to === "undone";
  return false;
}

/** The SQL CHECK, in TypeScript: policy may only post a 3+ star reply. */
export function authorityAllowedFor(action: ListingAction, authority: ListingAuthority): boolean {
  if (authority.kind === "auto_reply_policy") return action === "reply_post" && authority.rating >= 3;
  return true;
}

export function createMemoryReceiptStore(now: () => string = () => new Date().toISOString()): ListingReceiptStore & { all(): ListingReceipt[] } {
  const rows = new Map<string, ListingReceipt>();
  return {
    all: () => [...rows.values()],
    async record(input) {
      const existing = [...rows.values()].find((row) => row.workspaceId === input.workspaceId && row.idempotencyKey === input.idempotencyKey);
      if (existing) return { receipt: { ...existing }, replayed: true };
      if (!authorityAllowedFor(input.action, input.authority)) throw new ListingReceiptError("google_listing_receipts_check");
      if (input.undoesReceiptId && rows.get(input.undoesReceiptId)?.workspaceId !== input.workspaceId) throw new ListingReceiptError("google_receipt_not_found");
      const at = now();
      const receipt: ListingReceipt = {
        id: randomUUID(), workspaceId: input.workspaceId, bindingId: input.bindingId, locationId: input.locationId, action: input.action,
        targetRef: input.targetRef, status: "posting", authority: input.authority, before: input.before, after: input.after,
        readback: null, providerRef: null, undo: input.undo ?? null, undoesReceiptId: input.undoesReceiptId ?? null,
        undoneByReceiptId: null, idempotencyKey: input.idempotencyKey, error: null, createdAt: at, updatedAt: at, completedAt: null,
      };
      rows.set(receipt.id, receipt);
      return { receipt: { ...receipt }, replayed: false };
    },
    async settle(id, workspaceId, input) {
      const row = rows.get(id);
      if (!row || row.workspaceId !== workspaceId) throw new ListingReceiptError("google_receipt_not_found");
      if (!receiptTransitionAllowed(row.status, input.status)) throw new ListingReceiptError("google_receipt_transition_invalid");
      const at = now();
      Object.assign(row, {
        status: input.status, readback: input.readback ?? null, after: input.after ?? row.after,
        providerRef: input.providerRef ?? row.providerRef, error: input.error ?? null,
        undo: input.undo === undefined ? row.undo : input.undo, updatedAt: at, completedAt: at,
      });
      if (row.undoesReceiptId && ACCEPTED.includes(row.status)) {
        const original = rows.get(row.undoesReceiptId);
        if (original && ACCEPTED.includes(original.status)) Object.assign(original, { status: "undone", undoneByReceiptId: row.id, updatedAt: at });
      }
      return { ...row };
    },
    async get(id, workspaceId) {
      const row = rows.get(id);
      return row && row.workspaceId === workspaceId ? { ...row } : null;
    },
  };
}

type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> };

function codeOf(error: { message?: string; code?: string }): string {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  return ["google_receipt_transition_invalid", "google_receipt_immutable", "google_receipt_not_found", "google_receipt_invalid",
    "account_binding_not_found", "google_listing_receipts_check"].find((code) => detail.includes(code)) ?? "google_receipt_store_failed";
}

export function createSupabaseReceiptStore(db: Db | null = getSupabase() as unknown as Db | null): ListingReceiptStore {
  async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    if (!db) throw new ListingReceiptError("google_receipt_store_unavailable");
    const { data, error } = await db.rpc(name, args);
    if (error) throw new ListingReceiptError(codeOf(error));
    return (data ?? null) as Record<string, unknown> | null;
  }
  return {
    async record(input) {
      const data = await call("record_google_listing_receipt", { p_input: {
        workspaceId: input.workspaceId, bindingId: input.bindingId, locationId: input.locationId, action: input.action,
        targetRef: input.targetRef, authority: input.authority, before: input.before, after: input.after,
        undo: input.undo ?? null, undoesReceiptId: input.undoesReceiptId ?? null, idempotencyKey: input.idempotencyKey,
      } });
      const { replayed, ...receipt } = data as Record<string, unknown> & { replayed?: boolean };
      return { receipt: receipt as unknown as ListingReceipt, replayed: Boolean(replayed) };
    },
    async settle(id, workspaceId, input) {
      const payload: Record<string, unknown> = { status: input.status };
      for (const key of ["readback", "after", "providerRef", "error"] as const) if (input[key] !== undefined) payload[key] = input[key];
      if (input.undo !== undefined) payload.undo = input.undo;
      return (await call("settle_google_listing_receipt", { p_receipt_id: id, p_workspace_id: workspaceId, p_input: payload })) as unknown as ListingReceipt;
    },
    async get(id, workspaceId) {
      return (await call("read_google_listing_receipt", { p_receipt_id: id, p_workspace_id: workspaceId })) as unknown as ListingReceipt | null;
    },
  };
}
