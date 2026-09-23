/**
 * Thread persistence for conversation-primary interface.
 *
 * Uses Redis (Upstash) with fallback to dev file storage.
 * Key pattern: threads:{tenant}:{threadId}
 * Index key: threads:{tenant}:index (sorted set by updatedAt)
 */

import { promises as fs } from "fs";
import path from "path";
import { getRedis } from "./redis";
import type { Thread } from "./conversation-types";

export type { ChatMessage, Thread } from "./conversation-types";

// Chat threads expire after 90 days and the per-tenant index is capped, so they
// can't grow unbounded and LRU-evict hotter cache (rate limits, locks, content).
const THREAD_TTL_SECONDS = 90 * 24 * 60 * 60;
const THREAD_KEEP = 200;

// --- Helpers ---

function generateId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function threadKey(tenant: string, threadId: string): string {
  return `threads:${tenant}:${threadId}`;
}

function indexKey(tenant: string): string {
  return `threads:${tenant}:index`;
}

const DEV_THREADS_PATH = (tenant: string) =>
  path.join(process.cwd(), `dev-threads-${tenant}.json`);

async function readDevThreads(tenant: string): Promise<Record<string, Thread>> {
  try {
    const raw = await fs.readFile(DEV_THREADS_PATH(tenant), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeDevThreads(
  tenant: string,
  threads: Record<string, Thread>
): Promise<void> {
  await fs.writeFile(DEV_THREADS_PATH(tenant), JSON.stringify(threads, null, 2));
}

// --- CRUD Operations ---

/**
 * List all threads for a tenant, sorted by updatedAt desc.
 */
export async function listThreads(tenant: string): Promise<Thread[]> {
  const redis = getRedis();

  if (redis) {
    try {
      // Get thread IDs from index, sorted by score (updatedAt timestamp) desc
      const ids = await redis.zrange<string[]>(indexKey(tenant), 0, -1, {
        rev: true,
      });

      if (!ids || ids.length === 0) return [];

      // Batch fetch all threads
      const pipeline = redis.pipeline();
      for (const id of ids) {
        pipeline.get(threadKey(tenant, id));
      }
      const results = await pipeline.exec<(Thread | null)[]>();

      return results.filter((t): t is Thread => t !== null);
    } catch {
      // Redis failed, fall through to dev file
    }
  }

  // Dev file fallback
  const threads = await readDevThreads(tenant);
  return Object.values(threads).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Get a single thread by ID.
 */
export async function getThread(
  tenant: string,
  threadId: string
): Promise<Thread | null> {
  const redis = getRedis();

  if (redis) {
    try {
      const thread = await redis.get<Thread>(threadKey(tenant, threadId));
      return thread;
    } catch {
      // Redis failed, fall through to dev file
    }
  }

  // Dev file fallback
  const threads = await readDevThreads(tenant);
  return threads[threadId] || null;
}

/**
 * Create a new thread with an optional title.
 */
export async function createThread(
  tenant: string,
  title?: string
): Promise<Thread> {
  const now = new Date().toISOString();
  const thread: Thread = {
    id: generateId(),
    title: title || "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const redis = getRedis();

  if (redis) {
    try {
      await redis.set(threadKey(tenant, thread.id), thread, { ex: THREAD_TTL_SECONDS });
      await redis.zadd(indexKey(tenant), {
        score: Date.now(),
        member: thread.id,
      });
      await redis.zremrangebyrank(indexKey(tenant), 0, -(THREAD_KEEP + 1));
      return thread;
    } catch {
      // Redis failed, fall through to dev file
    }
  }

  // Dev file fallback
  const threads = await readDevThreads(tenant);
  threads[thread.id] = thread;
  await writeDevThreads(tenant, threads);
  return thread;
}

/**
 * Update a thread (messages, title, etc).
 * Automatically updates updatedAt.
 */
export async function updateThread(
  tenant: string,
  threadId: string,
  updates: Partial<Pick<Thread, "title" | "messages">>
): Promise<Thread | null> {
  const existing = await getThread(tenant, threadId);
  if (!existing) return null;

  const updated: Thread = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const redis = getRedis();

  if (redis) {
    try {
      await redis.set(threadKey(tenant, threadId), updated, { ex: THREAD_TTL_SECONDS });
      await redis.zadd(indexKey(tenant), {
        score: Date.now(),
        member: threadId,
      });
      await redis.zremrangebyrank(indexKey(tenant), 0, -(THREAD_KEEP + 1));
      return updated;
    } catch {
      // Redis failed, fall through to dev file
    }
  }

  // Dev file fallback
  const threads = await readDevThreads(tenant);
  threads[threadId] = updated;
  await writeDevThreads(tenant, threads);
  return updated;
}

/**
 * Delete a thread.
 */
export async function deleteThread(
  tenant: string,
  threadId: string
): Promise<void> {
  const redis = getRedis();

  if (redis) {
    try {
      await redis.del(threadKey(tenant, threadId));
      await redis.zrem(indexKey(tenant), threadId);
      return;
    } catch {
      // Redis failed, fall through to dev file
    }
  }

  // Dev file fallback
  const threads = await readDevThreads(tenant);
  delete threads[threadId];
  await writeDevThreads(tenant, threads);
}
