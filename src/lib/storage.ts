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
