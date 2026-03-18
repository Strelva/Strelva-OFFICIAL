import { promises as fs } from "fs";
import path from "path";
import { createClient } from "redis";
import type { ContentSection, ContentMap } from "./types";
import { defaults } from "./defaults";

const hasRedis = !!process.env.REDIS_URL;
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const DEV_CONTENT_PATH = path.join(process.cwd(), "dev-content.json");

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

export async function getContent<K extends ContentSection>(
  section: K
): Promise<ContentMap[K]> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.get(`rohlax:content:${section}`);
      if (raw) return JSON.parse(raw) as ContentMap[K];
      return defaults[section];
    });
  }

  const store = await readDevContent();
  return (store[section] as ContentMap[K]) ?? defaults[section];
}

export async function setContent<K extends ContentSection>(
  section: K,
  data: ContentMap[K]
): Promise<void> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.set(`rohlax:content:${section}`, JSON.stringify(data));
    });
  }

  const store = await readDevContent();
  store[section] = data;
  await writeDevContent(store);
}

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

// Chat persistence

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

export async function saveChatMessages(clientId: string, messages: unknown[]): Promise<void> {
  const trimmed = messages.slice(-100);

  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.set(`reb:chat:${clientId}`, JSON.stringify(trimmed));
    });
  }

  const store = await readDevChat();
  store[clientId] = trimmed;
  await writeDevChat(store);
}

export async function loadChatMessages(clientId: string): Promise<unknown[]> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.get(`reb:chat:${clientId}`);
      if (raw) return JSON.parse(raw) as unknown[];
      return [];
    });
  }

  const store = await readDevChat();
  return (store[clientId] as unknown[]) ?? [];
}

// Activity logging

export async function logActivity(entry: { text: string; time: string; type: string }): Promise<void> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.lPush("reb:activity", JSON.stringify(entry));
      await redis.lTrim("reb:activity", 0, 49);
    });
  }
  const store = await readDevContent();
  const activity = (store.__activity as unknown[] ?? []);
  activity.unshift(entry);
  store.__activity = activity.slice(0, 50);
  await writeDevContent(store);
}

export async function getActivity(): Promise<Array<{ text: string; time: string; type: string }>> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.lRange("reb:activity", 0, 19);
      return raw.map(r => JSON.parse(r));
    });
  }
  const store = await readDevContent();
  return (store.__activity as Array<{ text: string; time: string; type: string }>) ?? [];
}
