/**
 * Forwarding persistence: service-role RPCs only
 * (supabase/migrations/20261024500000_inquiry_forwarding.sql). The table is
 * revoked; SQL rechecks the actor on every workspace call. Server only.
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { forwardingAddressSchema, forwardingStateSchema, type ForwardingAddressRow, type ForwardingStateRow } from "./contracts";

/** The database refused the message's shape. Final: a retry cannot change it. */
export class ForwardedMessageInvalidError extends Error {
  constructor() { super("inquiry_forwarding_invalid"); this.name = "ForwardedMessageInvalidError"; }
}

export interface ForwardingRpc { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }

export type ResolvedForwarding =
  | { status: "active"; addressId: string; workspaceId: string }
  | { status: "unknown" | "revoked" | "closed" };

export type ForwardedReceiveInput =
  | { kind: "provider_confirmation"; provider: "gmail"; code: string; url: string | null; requestedBy: string | null }
  | { kind: "inquiry"; leadId: string; submissionHash: string; name: string; email: string | null; message: string; fields: Record<string, string>; spamReason: string | null };

export type ForwardedReceiveResult =
  | { status: "recorded" | "held" | "duplicate"; id: string; workspaceId: string }
  | { status: "confirmation"; workspaceId: string }
  | { status: "refused"; reason: "unknown" | "revoked" | "closed" };

export interface ForwardingStore {
  issue(actor: WorkspaceActor, workspaceId: string, localPart: string, rotate: boolean): Promise<{ status: "issued" | "existing" | "rotated"; address: ForwardingAddressRow }>;
  revoke(actor: WorkspaceActor, workspaceId: string, addressId: string): Promise<ForwardingAddressRow>;
  read(actor: WorkspaceActor, workspaceId: string): Promise<ForwardingStateRow>;
  resolve(localPart: string): Promise<ResolvedForwarding>;
  receive(localPart: string, input: ForwardedReceiveInput): Promise<ForwardedReceiveResult>;
}

const uuid = z.string().uuid();
const identity = (actor: WorkspaceActor) => ({ p_user_id: uuid.parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()) });
const resolvedSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("active"), addressId: z.string().uuid(), workspaceId: z.string().uuid() }),
  z.object({ status: z.enum(["unknown", "revoked", "closed"]) }),
]);
const receiveSchema = z.union([
  z.object({ status: z.enum(["recorded", "held", "duplicate"]), id: z.string().uuid(), workspaceId: z.string().uuid() }),
  z.object({ status: z.literal("confirmation"), workspaceId: z.string().uuid() }),
  z.object({ status: z.literal("refused"), reason: z.enum(["unknown", "revoked", "closed"]) }),
]);

export function createForwardingStore(db?: ForwardingRpc): ForwardingStore {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = db ?? (getSupabase() as unknown as ForwardingRpc | null);
    if (!client) throw new WorkspaceStoreError("Inquiry forwarding is unavailable.");
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const message = error.message;
      if (message.includes("inquiry_forwarding_access_denied")) throw new WorkspaceAccessError();
      if (message.includes("inquiry_forwarding_not_found")) throw new WorkspaceConflictError("This forwarding address is no longer here. Reload and try again.");
      if (message.includes("inquiry_forwarding_conflict")) throw new WorkspaceConflictError("Someone changed the forwarding address at the same time. Reload and try again.");
      if (message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError("Work in this business has stopped.");
      if (message.includes("inquiry_forwarding_invalid")) throw new ForwardedMessageInvalidError();
      throw new WorkspaceStoreError("Inquiry forwarding could not be confirmed.");
    }
    return data;
  }
  return {
    async issue(actor, workspaceId, localPart, rotate) {
      return z.object({ status: z.enum(["issued", "existing", "rotated"]), address: forwardingAddressSchema })
        .parse(await rpc("issue_inquiry_forwarding_address", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor), p_local_part: localPart, p_rotate: rotate }));
    },
    async revoke(actor, workspaceId, addressId) {
      return z.object({ address: forwardingAddressSchema }).parse(await rpc("revoke_inquiry_forwarding_address", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor), p_address_id: uuid.parse(addressId) })).address;
    },
    async read(actor, workspaceId) {
      return forwardingStateSchema.parse(await rpc("read_inquiry_forwarding", { p_workspace_id: uuid.parse(workspaceId), ...identity(actor) }));
    },
    async resolve(localPart) {
      return resolvedSchema.parse(await rpc("resolve_inquiry_forwarding_address", { p_local_part: localPart }));
    },
    async receive(localPart, input) {
      return receiveSchema.parse(await rpc("receive_forwarded_inquiry", { p_local_part: localPart, p_input: input }));
    },
  };
}

let override: ForwardingStore | null = null;
/** Tests replace the store; production reads Supabase. */
export function setForwardingStoreForTests(store: ForwardingStore | null): void { override = store; }
export function forwardingStore(): ForwardingStore { return override ?? createForwardingStore(); }
