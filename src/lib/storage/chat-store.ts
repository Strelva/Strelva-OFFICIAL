/**
 * Chat message persistence - Redis-cached with Sanity backing store.
 *
 * Migration: when DATA_SOURCE=postgres, reads/writes the Postgres `chat_sessions`
 * table (Sanity fallback on read). Writes go to Postgres AND Sanity while both are
 * configured so the transition is reversible; once Sanity is removed, `hasSanity`
 * is false and only Postgres is written. Default off (Sanity path).
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
import { getSanityClient } from "../sanity";
import { getRedis } from "../redis";
import { hasSanity, DEFAULT_TENANT, readDevFile, writeDevFile } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase, type Row } from "../db/client";

const DEV_CHAT_PATH = path.join(process.cwd(), "dev-chat.json");
const CHAT_CACHE_TTL_SECONDS = 3600; // 1 hour

function chatCacheKey(tenant: string, clientId: string): string {
  return `reb:chat:${tenant}:${clientId}`;
}

async function readDevChat(): Promise<Record<string, unknown[]>> {
  return readDevFile(DEV_CHAT_PATH, {});
}

async function writeDevChat(data: Record<string, unknown[]>): Promise<void> {
  return writeDevFile(DEV_CHAT_PATH, data);
}

// --- Postgres (chat_sessions) repo helpers (self-contained, never throw) ---
//
// Each wraps a single query and returns a safe fallback on any error, so the
// Postgres path can never break the store; the Sanity/dev paths remain the
// backstop. `messages` is the Json column holding the opaque message array.

/** Read the persisted messages blob for (tenant, clientId). Returns null on miss/error. */
async function getChatMessagesPg(
  tenant: string,
  clientId: string
): Promise<unknown[] | null> {
  const db = getSupabase();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("chat_sessions")
      .select("messages")
      .eq("tenant_id", tenant)
      .eq("client_id", clientId)
      .maybeSingle();
    if (error || !data) return null;
    const messages = (data as Row<"chat_sessions">).messages;
    return Array.isArray(messages) ? (messages as unknown[]) : null;
  } catch {
    return null;
  }
}

/** Upsert the messages blob for (tenant, clientId). Best-effort; swallows errors. */
async function saveChatMessagesPg(
  tenant: string,
  clientId: string,
  messages: unknown[]
): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  try {
    await db.from("chat_sessions").upsert(
      {
        tenant_id: tenant,
        client_id: clientId,
        messages: messages as unknown as Row<"chat_sessions">["messages"],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,client_id" }
    );
  } catch {
    // Postgres write failed - Sanity/dev remains the backstop while dual-writing.
  }
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

  if (hasSanity) {
    const query = `*[_type == "chatSession" && tenant == $tenant && clientId == $clientId][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant, clientId });

    if (existingId) {
      await getSanityClient().patch(existingId).set({ messages: trimmed }).commit();
    } else {
      await getSanityClient().create({
        _type: "chatSession",
        tenant,
        clientId,
        messages: trimmed,
      });
    }

    // Write-through to Redis cache
    const redis = getRedis();
    if (redis) {
      try {
        await redis.set(chatCacheKey(tenant, clientId), trimmed, {
          ex: CHAT_CACHE_TTL_SECONDS,
        });
      } catch {
        // Redis write failed - Sanity is the source of truth, so this is fine
      }
    }
    return;
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
    const pg = await getChatMessagesPg(tenant, clientId);
    if (pg && pg.length > 0) return pg;
    // empty/miss falls through to Sanity (if configured) then dev
  }

  // Try Redis cache first (only when Sanity is the backing store)
  if (hasSanity) {
    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get<unknown[]>(chatCacheKey(tenant, clientId));
        if (cached) return cached;
      } catch {
        // Redis read failed - fall through to Sanity
      }
    }

    const query = `*[_type == "chatSession" && tenant == $tenant && clientId == $clientId][0].messages`;
    const messages = await getSanityClient().fetch(query, { tenant, clientId });
    const result = messages || [];

    // Backfill Redis cache on miss
    if (redis && result.length > 0) {
      try {
        await redis.set(chatCacheKey(tenant, clientId), result, {
          ex: CHAT_CACHE_TTL_SECONDS,
        });
      } catch {
        // Redis write failed - not fatal
      }
    }

    return result;
  }

  const store = await readDevChat();
  return (store[`${tenant}:${clientId}`] as unknown[]) ?? [];
}
