import { promises as fs } from "fs";
import path from "path";
import { createClient } from "redis";
import type { ContentSection, ContentMap, BookingConfig, DateOverride, Booking } from "./types";
import { defaults } from "./defaults";
import { DEFAULT_BOOKING_CONFIG, generateBookingId, generateSlots } from "./booking";

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

// --- Booking ---

export async function getBookingConfig(
  tenant: string = DEFAULT_TENANT
): Promise<BookingConfig> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.get(`${tenant}:booking-config`);
      if (raw) return JSON.parse(raw) as BookingConfig;
      return DEFAULT_BOOKING_CONFIG;
    });
  }
  const store = await readDevContent();
  return (store[`__bookingConfig_${tenant}`] as BookingConfig) ?? DEFAULT_BOOKING_CONFIG;
}

export async function setBookingConfig(
  config: BookingConfig,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.set(`${tenant}:booking-config`, JSON.stringify(config));
    });
  }
  const store = await readDevContent();
  store[`__bookingConfig_${tenant}`] = config;
  await writeDevContent(store);
}

export async function getDateOverrides(
  tenant: string = DEFAULT_TENANT
): Promise<DateOverride[]> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.get(`${tenant}:date-overrides`);
      if (raw) return JSON.parse(raw) as DateOverride[];
      return [];
    });
  }
  const store = await readDevContent();
  return (store[`__dateOverrides_${tenant}`] as DateOverride[]) ?? [];
}

export async function setDateOverrides(
  overrides: DateOverride[],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      await redis.set(`${tenant}:date-overrides`, JSON.stringify(overrides));
    });
  }
  const store = await readDevContent();
  store[`__dateOverrides_${tenant}`] = overrides;
  await writeDevContent(store);
}

export async function getBookings(
  tenant: string = DEFAULT_TENANT,
  dateRange?: { from: string; to: string }
): Promise<Booking[]> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.get(`${tenant}:bookings`);
      if (!raw) return [];
      let bookings = JSON.parse(raw) as Booking[];
      if (dateRange) {
        bookings = bookings.filter(
          (b) => b.date >= dateRange.from && b.date <= dateRange.to
        );
      }
      return bookings;
    });
  }
  const store = await readDevContent();
  let bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  if (dateRange) {
    bookings = bookings.filter(
      (b) => b.date >= dateRange.from && b.date <= dateRange.to
    );
  }
  return bookings;
}

export async function createBooking(
  booking: Omit<Booking, "id" | "createdAt" | "status">,
  tenant: string = DEFAULT_TENANT
): Promise<Booking> {
  const newBooking: Booking = {
    ...booking,
    id: generateBookingId(),
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.get(`${tenant}:bookings`);
      const bookings = raw ? (JSON.parse(raw) as Booking[]) : [];
      bookings.push(newBooking);
      await redis.set(`${tenant}:bookings`, JSON.stringify(bookings));
      return newBooking;
    });
  }

  const store = await readDevContent();
  const bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  bookings.push(newBooking);
  store[`__bookings_${tenant}`] = bookings;
  await writeDevContent(store);
  return newBooking;
}

export async function updateBooking(
  id: string,
  updates: Partial<Pick<Booking, "status" | "notes" | "cancelledAt">>,
  tenant: string = DEFAULT_TENANT
): Promise<Booking | null> {
  if (hasRedis) {
    return withRedis(async (redis) => {
      const raw = await redis.get(`${tenant}:bookings`);
      if (!raw) return null;
      const bookings = JSON.parse(raw) as Booking[];
      const idx = bookings.findIndex((b) => b.id === id);
      if (idx === -1) return null;
      bookings[idx] = { ...bookings[idx], ...updates };
      await redis.set(`${tenant}:bookings`, JSON.stringify(bookings));
      return bookings[idx];
    });
  }

  const store = await readDevContent();
  const bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  bookings[idx] = { ...bookings[idx], ...updates };
  store[`__bookings_${tenant}`] = bookings;
  await writeDevContent(store);
  return bookings[idx];
}

export async function getAvailableSlots(
  date: string,
  serviceId: string,
  tenant: string = DEFAULT_TENANT
): Promise<string[]> {
  const [config, bookings, overrides, services] = await Promise.all([
    getBookingConfig(tenant),
    getBookings(tenant, { from: date, to: date }),
    getDateOverrides(tenant),
    getContent("services", tenant),
  ]);

  const service = services.services.find((s) => s.id === serviceId);
  const duration = service ? parseInt(service.duration) || config.slotDuration : config.slotDuration;

  return generateSlots(config, date, duration, bookings, overrides);
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
