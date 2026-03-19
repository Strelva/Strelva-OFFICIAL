import { promises as fs } from "fs";
import path from "path";
import { createClient } from "redis";
import type { ContentSection, ContentMap } from "./types";
import { defaults } from "./defaults";

const hasRedis = !!process.env.REDIS_URL;
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const DEV_CONTENT_PATH = path.join(process.cwd(), "dev-content.json");

/** Default tenant — used until multi-tenant routing is wired */
export const DEFAULT_TENANT = "rohlax";

async function withRedis<T>(fn: (redis: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.quit();
  }
}

async function readDevContent(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(DEV_CONTENT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeDevContent(data: Record<string, unknown>): Promise<void> {
  await fs.writeFile(DEV_CONTENT_PATH, JSON.stringify(data, null, 2));
}

// --- Content ---

export async function getContent<K extends ContentSection>(
  section: K,
  tenant: string = DEFAULT_TENANT
): Promise<ContentMap[K]> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.get(`${tenant}:content:${section}`);
      if (raw) return JSON.parse(raw) as ContentMap[K];
      return defaults[section];
    });
  }

  const store = await readDevContent();
  return (store[section] as ContentMap[K]) ?? defaults[section];
}

export async function setContent<K extends ContentSection>(
  section: K,
  data: ContentMap[K],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.set(`${tenant}:content:${section}`, JSON.stringify(data));
    });
  }

  const store = await readDevContent();
  store[section] = data;
  await writeDevContent(store);
}

// --- File upload ---

export async function uploadFile(
  file: File
): Promise<{ url: string }> {
  if (hasBlob) {
    const { put } = await import("@vercel/blob");
    const blob = await put(file.name, file, { access: "public" });
    return { url: blob.url };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${Date.now()}-${file.name}`;
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, buffer);

  return { url: `/uploads/${filename}` };
}

// --- Chat persistence ---

const DEV_CHAT_PATH = path.join(process.cwd(), "dev-chat.json");

async function readDevChat(): Promise<Record<string, unknown[]>> {
  try {
    const raw = await fs.readFile(DEV_CHAT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeDevChat(data: Record<string, unknown[]>): Promise<void> {
  await fs.writeFile(DEV_CHAT_PATH, JSON.stringify(data, null, 2));
}

export async function saveChatMessages(
  clientId: string,
  messages: unknown[],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const trimmed = messages.slice(-100);

  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.set(`${tenant}:chat:${clientId}`, JSON.stringify(trimmed));
    });
  }

  const store = await readDevChat();
  store[`${tenant}:${clientId}`] = trimmed;
  await writeDevChat(store);
}

export async function loadChatMessages(
  clientId: string,
  tenant: string = DEFAULT_TENANT
): Promise<unknown[]> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.get(`${tenant}:chat:${clientId}`);
      if (raw) return JSON.parse(raw) as unknown[];
      return [];
    });
  }

  const store = await readDevChat();
  return (store[`${tenant}:${clientId}`] as unknown[]) ?? [];
}

// --- Activity logging ---

export async function logActivity(
  entry: { text: string; time: string; type: string },
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.lPush(`${tenant}:activity`, JSON.stringify(entry));
      await redis.lTrim(`${tenant}:activity`, 0, 49);
    });
  }
  const store = await readDevContent();
  const activity = (store.__activity as unknown[] ?? []);
  activity.unshift(entry);
  store.__activity = activity.slice(0, 50);
  await writeDevContent(store);
}

export async function getActivity(
  tenant: string = DEFAULT_TENANT
): Promise<Array<{ text: string; time: string; type: string }>> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.lRange(`${tenant}:activity`, 0, 19);
      return raw.map(r => JSON.parse(r));
    });
  }
  const store = await readDevContent();
  return (store.__activity as Array<{ text: string; time: string; type: string }>) ?? [];
}

// --- Click tracking ---

export async function trackClick(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.hIncrBy(`${tenant}:clicks`, `${event}:${today}`, 1);
      await redis.hIncrBy(`${tenant}:clicks`, `${event}:total`, 1);
    });
  }
  const store = await readDevContent();
  const clicks = (store.__clicks as Record<string, number>) ?? {};
  clicks[`${event}:${today}`] = (clicks[`${event}:${today}`] || 0) + 1;
  clicks[`${event}:total`] = (clicks[`${event}:total`] || 0) + 1;
  store.__clicks = clicks;
  await writeDevContent(store);
}

export async function getClickCounts(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<{ total: number; today: number; thisWeek: number }> {
  const today = new Date().toISOString().slice(0, 10);

  if (hasRedis) {
    return withRedis(async (redis) => {
      const total = parseInt(await redis.hGet(`${tenant}:clicks`, `${event}:total`) || "0");
      const todayCount = parseInt(await redis.hGet(`${tenant}:clicks`, `${event}:${today}`) || "0");
      let weekCount = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        weekCount += parseInt(await redis.hGet(`${tenant}:clicks`, `${event}:${key}`) || "0");
      }
      return { total, today: todayCount, thisWeek: weekCount };
    });
  }

  const store = await readDevContent();
  const clicks = (store.__clicks as Record<string, number>) ?? {};
  const total = clicks[`${event}:total`] || 0;
  const todayCount = clicks[`${event}:${today}`] || 0;
  let weekCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    weekCount += clicks[`${event}:${key}`] || 0;
  }
  return { total, today: todayCount, thisWeek: weekCount };
}

// --- Content freshness ---

export async function recordSectionUpdate(
  section: string,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const now = new Date().toISOString();
  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.hSet(`${tenant}:section-timestamps`, section, now);
    });
  }
  const store = await readDevContent();
  const timestamps = (store.__sectionTimestamps as Record<string, string>) ?? {};
  timestamps[section] = now;
  store.__sectionTimestamps = timestamps;
  await writeDevContent(store);
}

export async function getSectionTimestamps(
  tenant: string = DEFAULT_TENANT
): Promise<Record<string, string>> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      return await redis.hGetAll(`${tenant}:section-timestamps`) as Record<string, string>;
    });
  }
  const store = await readDevContent();
  return (store.__sectionTimestamps as Record<string, string>) ?? {};
}
