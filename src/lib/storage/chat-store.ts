/**
 * Chat message persistence.
 *
 * When DATA_SOURCE=postgres, reads/writes the Postgres `chat_sessions` table;
 * otherwise uses the local dev-file store.
 *
 * NOTE on the target table: this store keys an opaque `messages: unknown[]` blob
 * by (tenant, clientId). The `chat_sessions` table (tenant_id, client_id, messages
 * Json) is the exact shape and is what we map to here. The assignment named the
 * normalized `chat_threads`/`chat_messages` pair, but those do NOT fit this store
 * (no client_id key column; messages are NOT-NULL-`role` typed rows, not the opaque
 * array this store persists). Mapping to them would be lossy/forced, so per the
 * column-mismatch rule we map to `chat_sessions` and flag the mismatch.
 */

import path from "path";
import { DEFAULT_TENANT, readDevFile, writeDevFile } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase, type Row } from "../db/client";

const DEV_CHAT_PATH = path.join(process.cwd(), "dev-chat.json");

async function readDevChat(): Promise<Record<string, unknown[]>> {
  return readDevFile(DEV_CHAT_PATH, {});
}

async function writeDevChat(data: Record<string, unknown[]>): Promise<void> {
  return writeDevFile(DEV_CHAT_PATH, data);
}

// --- Authoritative Postgres (chat_sessions) helpers ------------------------
// `messages` is the Json column holding the opaque message array.

function chatDb(operation: string): NonNullable<ReturnType<typeof getSupabase>> {
  const db = getSupabase();
  if (!db) throw new Error(`[chat] ${operation} failed: Supabase is not configured`);
  return db;
}

/** Read the persisted messages blob for (tenant, clientId). */
async function getChatMessagesPg(
  tenant: string,
  clientId: string
): Promise<unknown[] | null> {
  const db = chatDb(`read ${tenant}/${clientId}`);
  const { data, error } = await db
    .from("chat_sessions")
    .select("messages")
    .eq("tenant_id", tenant)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const messages = (data as Row<"chat_sessions">).messages;
  return Array.isArray(messages) ? (messages as unknown[]) : [];
}

/** Upsert the messages blob for (tenant, clientId). */
async function saveChatMessagesPg(
  tenant: string,
  clientId: string,
  messages: unknown[]
): Promise<void> {
  const db = chatDb(`save ${tenant}/${clientId}`);
  const { error } = await db.from("chat_sessions").upsert(
    {
      tenant_id: tenant,
      client_id: clientId,
      messages: messages as unknown as Row<"chat_sessions">["messages"],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,client_id" }
  );
  if (error) throw error;
}

export async function saveChatMessages(
  clientId: string,
  messages: unknown[],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const trimmed = messages.slice(-100);

  if (dataSourceIsPostgres()) {
    await saveChatMessagesPg(tenant, clientId, trimmed);
  }

  if (!dataSourceIsPostgres()) {
    const store = await readDevChat();
    store[`${tenant}:${clientId}`] = trimmed;
    await writeDevChat(store);
  }
}

export async function loadChatMessages(
  clientId: string,
  tenant: string = DEFAULT_TENANT
): Promise<unknown[]> {
  if (dataSourceIsPostgres()) {
    return (await getChatMessagesPg(tenant, clientId)) ?? [];
  }

  const store = await readDevChat();
  return (store[`${tenant}:${clientId}`] as unknown[]) ?? [];
}
