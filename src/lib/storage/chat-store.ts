/**
 * Chat message persistence - Redis-cached with Sanity backing store.
 */

import path from "path";
import { getSanityClient } from "../sanity";
import { getRedis } from "../redis";
import { hasSanity, DEFAULT_TENANT, readDevFile, writeDevFile } from "./core";

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

export async function saveChatMessages(
  clientId: string,
  messages: unknown[],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const trimmed = messages.slice(-100);

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

  const store = await readDevChat();
  store[`${tenant}:${clientId}`] = trimmed;
  await writeDevChat(store);
}

export async function loadChatMessages(
  clientId: string,
  tenant: string = DEFAULT_TENANT
): Promise<unknown[]> {
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
