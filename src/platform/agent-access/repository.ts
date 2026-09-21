import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { AgentAccessRecord, AgentAccessStore } from "./types";

interface FilterBuilder {
  eq(column: string, value: unknown): FilterBuilder;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
  order(column: string, options: { ascending: boolean }): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
}
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  from(name: string): {
    select(columns: string): FilterBuilder;
    upsert(value: Record<string, unknown>, options: { onConflict: string }): Promise<{ error: { message: string } | null }>;
  };
}
function db(): RpcClient {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Integration token storage is unavailable.");
  return client as unknown as RpcClient;
}
function identity(actor: WorkspaceActor) {
  return { p_user_id: z.string().uuid().parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.toLowerCase()) };
}
function failed(error: { message: string } | null) {
  if (!error) return;
  if (/agent_access_denied|workspace_access_denied|work_grant_denied/.test(error.message)) throw new WorkspaceAccessError("The integration token is unavailable.");
  if (/work_auxiliary_conflict|work_source_changed|agent_access_conflict/.test(error.message)) throw new WorkspaceConflictError("The work or integration changed. Reload before continuing.");
  throw new WorkspaceStoreError("The integration token operation could not be confirmed.");
}
const rowSchema = z.object({
  id: z.string().uuid(), work_id: z.string().uuid(), grant_id: z.string().uuid(), token_hash: z.string().length(64), token_prefix: z.string(),
  issuer_user_id: z.string().uuid(), issuer_email: z.string().email(), agent_label: z.string(), scopes: z.array(z.enum(["read", "propose"])),
  expires_at: z.string(), created_at: z.string(), revoked_at: z.string().nullable(),
});
function map(raw: unknown): AgentAccessRecord {
  const row = rowSchema.parse(raw);
  return { id: row.id, workId: row.work_id, grantId: row.grant_id, tokenHash: row.token_hash, tokenPrefix: row.token_prefix, issuer: { userId: row.issuer_user_id, verifiedEmail: row.issuer_email }, agentLabel: row.agent_label, scopes: row.scopes, expiresAt: row.expires_at, createdAt: row.created_at, revokedAt: row.revoked_at };
}

export const postgresAgentAccessStore: AgentAccessStore = {
  async issue({ actor, record, native }) {
    const { error } = await db().rpc("issue_agent_access_token", { ...identity(actor), p_work_id: record.workId, p_expected_revision: native.expectedRevision, p_payload: native.payload, p_expected_work_revision: native.expectedWorkRevision, p_token_id: record.id, p_grant_id: record.grantId, p_token_hash: record.tokenHash, p_token_prefix: record.tokenPrefix, p_agent_label: record.agentLabel, p_scopes: record.scopes, p_expires_at: record.expiresAt });
    failed(error);
  },
  async revoke({ actor, record, native, revokedAt }) {
    const { error } = await db().rpc("revoke_agent_access_token", { ...identity(actor), p_work_id: record.workId, p_expected_revision: native.expectedRevision, p_payload: native.payload, p_expected_work_revision: native.expectedWorkRevision, p_token_id: record.id, p_revoked_at: revokedAt });
    failed(error);
  },
  async managed(actor, workId, tokenId) {
    const { data, error } = await db().from("workspace_agent_access_tokens").select("*").eq("id", tokenId).eq("work_id", workId).eq("issuer_user_id", actor.userId).maybeSingle();
    if (error) throw new WorkspaceStoreError("Integration token storage is unavailable.");
    return data ? map(data) : null;
  },
  async list(actor, workId) {
    const { data, error } = await db().from("workspace_agent_access_tokens").select("*").eq("work_id", workId).eq("issuer_user_id", actor.userId).order("created_at", { ascending: false });
    if (error) throw new WorkspaceStoreError("Integration token storage is unavailable.");
    return (data ?? []).map(map);
  },
  async resolve(tokenHash, workId) {
    const { data, error } = await db().from("workspace_agent_access_tokens").select("*").eq("token_hash", tokenHash).eq("work_id", workId).maybeSingle();
    if (error) throw new WorkspaceStoreError("Integration token storage is unavailable.");
    return data ? map(data) : null;
  },
  async recordEvent(input) {
    const eventKey = input.idempotencyKey ? `${input.tokenId}:${input.action}:${input.idempotencyKey}` : randomUUID();
    const { error } = await db().from("workspace_agent_access_events").upsert({ event_key: eventKey, token_id: input.tokenId, issuer_user_id: input.issuerUserId, work_id: input.workId, grant_id: input.grantId, action: input.action, contribution_id: input.contributionId ?? null, idempotency_key: input.idempotencyKey ?? null, occurred_at: input.at }, { onConflict: "event_key" });
    if (error) throw new WorkspaceStoreError("The integration access record could not be confirmed.");
  },
};
