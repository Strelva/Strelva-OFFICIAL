import { promises as fs } from "fs";
import path from "path";
import type { ContentSection, ContentMap, BookingConfig, DateOverride, Booking, SearchData } from "./types";
import { defaults } from "./defaults";
import { DEFAULT_BOOKING_CONFIG, generateBookingId, generateSlots } from "./booking";
import { getSanityClient, getSanityReadClient, sanityImageUrl } from "./sanity";

const hasSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;
const DEV_CONTENT_PATH = path.join(process.cwd(), "dev-content.json");

/** Default tenant — used until multi-tenant routing is wired */
export const DEFAULT_TENANT = "rohlax";

// --- Dev file fallback (no Sanity configured) ---

function devContentPath(tenant: string): string {
  if (tenant === DEFAULT_TENANT) return DEV_CONTENT_PATH;
  return path.join(process.cwd(), `dev-content-${tenant}.json`);
}

async function readDevContent(tenant: string = DEFAULT_TENANT): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(devContentPath(tenant), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeDevContent(data: Record<string, unknown>, tenant: string = DEFAULT_TENANT): Promise<void> {
  await fs.writeFile(devContentPath(tenant), JSON.stringify(data, null, 2));
}

// --- Sanity document type mapping ---

const SECTION_TO_TYPE: Record<ContentSection, string> = {
  hero: "hero",
  services: "services",
  story: "story",
  testimonials: "testimonials",
  events: "events",
  providers: "providers",
  contact: "contact",
  settings: "siteSettings",
  faq: "faq",
  shop: "shop",
  products: "products",
};

/**
 * Transform Sanity image fields back to URL strings for the existing frontend.
 * This keeps the rest of the codebase unchanged — components still receive
 * `backgroundImageUrl: string`, `image_url: string`, etc.
 */
function transformSanityImages<K extends ContentSection>(
  section: K,
  doc: Record<string, unknown>
): ContentMap[K] {
  // Remove Sanity internal fields
  const { _id, _rev, _type, _createdAt, _updatedAt, tenant, ...data } = doc;

  if (section === "hero" && data.backgroundImage) {
    data.backgroundImageUrl = sanityImageUrl(data.backgroundImage);
    delete data.backgroundImage;
  }

  if (section === "story" && data.portraitImage) {
    data.imageUrl = sanityImageUrl(data.portraitImage);
    delete data.portraitImage;
  }

  // Array items with image fields
  const arrayFields: Record<string, { sanityField: string; urlField: string }> = {
    services: { sanityField: "image", urlField: "image_url" },
    events: { sanityField: "image", urlField: "image_url" },
    providers: { sanityField: "photo", urlField: "photo_url" },
    shop: { sanityField: "image", urlField: "image_url" },
    products: { sanityField: "image", urlField: "imageUrl" },
  };

  const mapping = arrayFields[section];
  if (mapping) {
    const arrayKey = section === "shop" ? "items" : section === "products" ? "products" : section;
    const items = data[arrayKey] as Array<Record<string, unknown>> | undefined;
    if (items) {
      data[arrayKey] = items.map((item) => {
        const { _key, [mapping.sanityField]: img, ...rest } = item;
        return {
          ...rest,
          id: rest.id || _key || "",
          [mapping.urlField]: img ? sanityImageUrl(img) : "",
        };
      });
    }
  }

  // Testimonials, FAQ — array items with _key → id
  if (section === "testimonials" && Array.isArray(data.testimonials)) {
    data.testimonials = (data.testimonials as Array<Record<string, unknown>>).map(
      ({ _key, ...rest }) => ({ ...rest, id: rest.id || _key || "" })
    );
  }
  if (section === "faq" && Array.isArray(data.faqs)) {
    data.faqs = (data.faqs as Array<Record<string, unknown>>).map(
      ({ _key, ...rest }) => ({ ...rest, id: rest.id || _key || "" })
    );
  }
  if (section === "story" && Array.isArray(data.stats)) {
    data.stats = (data.stats as Array<Record<string, unknown>>).map(
      ({ _key, ...rest }) => rest
    );
  }

  return data as unknown as ContentMap[K];
}

// --- Content ---

export async function getContent<K extends ContentSection>(
  section: K,
  tenant: string = DEFAULT_TENANT
): Promise<ContentMap[K]> {
  if (hasSanity) {
    const type = SECTION_TO_TYPE[section];
    const query = `*[_type == $type && tenant == $tenant][0]`;
    const doc = await getSanityReadClient().fetch(query, { type, tenant });
    if (doc) return transformSanityImages(section, doc);
    // Fall through to dev file if Sanity has no data for this tenant
  }

  const store = await readDevContent(tenant);
  return (store[section] as ContentMap[K]) ?? defaults[section];
}

export async function setContent<K extends ContentSection>(
  section: K,
  data: ContentMap[K],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const type = SECTION_TO_TYPE[section];
    const query = `*[_type == $type && tenant == $tenant][0]._id`;
    const existingId = await getSanityClient().fetch(query, { type, tenant });

    const doc = {
      _type: type,
      tenant,
      ...(data as unknown as Record<string, unknown>),
    };

    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await getSanityClient().create(doc as any);
    }
    return;
  }

  const store = await readDevContent(tenant);
  store[section] = data;
  await writeDevContent(store, tenant);
}

// --- File upload ---

export async function uploadFile(file: File): Promise<{ url: string }> {
  if (hasSanity) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await getSanityClient().assets.upload("image", buffer, {
      filename: file.name,
      contentType: file.type,
    });
    return { url: sanityImageUrl(asset) };
  }

  // Vercel Blob fallback
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
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
  if (hasSanity) {
    const query = `*[_type == "chatSession" && tenant == $tenant && clientId == $clientId][0].messages`;
    const messages = await getSanityClient().fetch(query, { tenant, clientId });
    return messages || [];
  }

  const store = await readDevChat();
  return (store[`${tenant}:${clientId}`] as unknown[]) ?? [];
}

// --- Activity logging ---

export interface ActivityEntry {
  text: string;
  time: string;
  type: string;
  section?: string;
  actor?: "user" | "ai";
  changes?: { field: string; before: string; after: string }[];
}

export async function logActivity(
  entry: ActivityEntry,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    await getSanityClient().create({
      _type: "activityLog",
      tenant,
      text: entry.text,
      activityType: entry.type,
      time: entry.time,
      section: entry.section,
      actor: entry.actor,
      changes: entry.changes,
    });
    return;
  }

  const store = await readDevContent(tenant);
  const activity = (store.__activity as unknown[]) ?? [];
  activity.unshift(entry);
  store.__activity = activity.slice(0, 200);
  await writeDevContent(store, tenant);
}

export async function getActivity(
  tenant: string = DEFAULT_TENANT,
  filters?: { section?: string; actor?: string }
): Promise<ActivityEntry[]> {
  if (hasSanity) {
    let query = `*[_type == "activityLog" && tenant == $tenant`;
    const params: Record<string, string> = { tenant };
    if (filters?.section) {
      query += ` && section == $section`;
      params.section = filters.section;
    }
    if (filters?.actor) {
      query += ` && actor == $actor`;
      params.actor = filters.actor;
    }
    query += `] | order(time desc)[0...50]{ text, "type": activityType, time, section, actor, changes }`;
    return getSanityClient().fetch(query, params);
  }

  const store = await readDevContent(tenant);
  let activity = (store.__activity as ActivityEntry[]) ?? [];
  if (filters?.section) {
    activity = activity.filter((a) => a.section === filters.section);
  }
  if (filters?.actor) {
    activity = activity.filter((a) => a.actor === filters.actor);
  }
  return activity.slice(0, 50);
}

// --- Draft content ---

export async function getDraftContent<K extends ContentSection>(
  section: K,
  tenant: string = DEFAULT_TENANT
): Promise<ContentMap[K] | null> {
  if (hasSanity) {
    const query = `*[_type == "draftContent" && tenant == $tenant && section == $section][0].data`;
    const data = await getSanityClient().fetch(query, { tenant, section });
    return data || null;
  }

  const store = await readDevContent(tenant);
  const key = `__draft:${section}`;
  return (store[key] as ContentMap[K]) ?? null;
}

export async function setDraftContent<K extends ContentSection>(
  section: K,
  data: ContentMap[K],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const query = `*[_type == "draftContent" && tenant == $tenant && section == $section][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant, section });
    const doc = { _type: "draftContent" as const, tenant, section, data };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  const store = await readDevContent(tenant);
  store[`__draft:${section}`] = data;
  await writeDevContent(store, tenant);
}

export async function clearDraft(
  section: ContentSection,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const query = `*[_type == "draftContent" && tenant == $tenant && section == $section][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant, section });
    if (existingId) {
      await getSanityClient().delete(existingId);
    }
    return;
  }

  const store = await readDevContent(tenant);
  delete store[`__draft:${section}`];
  await writeDevContent(store, tenant);
}

export async function listDrafts(
  tenant: string = DEFAULT_TENANT
): Promise<Record<string, boolean>> {
  if (hasSanity) {
    const query = `*[_type == "draftContent" && tenant == $tenant].section`;
    const sections: string[] = await getSanityClient().fetch(query, { tenant });
    const result: Record<string, boolean> = {};
    for (const s of sections) result[s] = true;
    return result;
  }

  const store = await readDevContent(tenant);
  const result: Record<string, boolean> = {};
  for (const key of Object.keys(store)) {
    if (key.startsWith("__draft:")) {
      result[key.replace("__draft:", "")] = true;
    }
  }
  return result;
}

// --- Page Config ---

import type { SitePageConfig } from "./types";
import { DEFAULT_PAGE_CONFIG } from "./pageConfigDefaults";

export async function getPageConfig(
  tenant: string = DEFAULT_TENANT
): Promise<SitePageConfig> {
  if (hasSanity) {
    const doc = await getSanityReadClient().fetch(
      `*[_type == "pageConfig" && tenant == $tenant][0]`,
      { tenant }
    );
    if (doc) {
      const { _id, _rev, _type, _createdAt, _updatedAt, tenant: _, ...config } = doc;
      return config.pages as SitePageConfig;
    }
    return DEFAULT_PAGE_CONFIG;
  }

  const store = await readDevContent(tenant);
  return (store.__pageConfig as SitePageConfig) ?? DEFAULT_PAGE_CONFIG;
}

export async function setPageConfig(
  config: SitePageConfig,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const query = `*[_type == "pageConfig" && tenant == $tenant][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant });
    const doc = { _type: "pageConfig" as const, tenant, pages: config };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  const store = await readDevContent(tenant);
  store.__pageConfig = config;
  await writeDevContent(store, tenant);
}

// --- Click tracking (stays simple — use Sanity counter documents) ---

export async function trackClick(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  if (hasSanity) {
    // Use a single tracking document per tenant, increment counters
    const docId = `clicks-${tenant}`;
    try {
      await getSanityClient()
        .patch(docId)
        .setIfMissing({ _type: "activityLog", tenant, text: "click-tracking", activityType: "system", time: new Date().toISOString(), clicks: {} })
        .inc({ [`clicks.${event}_${today}`]: 1, [`clicks.${event}_total`]: 1 })
        .commit({ autoGenerateArrayKeys: true });
    } catch {
      // Document doesn't exist yet
      await getSanityClient().createIfNotExists({
        _id: docId,
        _type: "activityLog",
        tenant,
        text: "click-tracking",
        activityType: "system",
        time: new Date().toISOString(),
      });
      await getSanityClient()
        .patch(docId)
        .setIfMissing({ clicks: {} })
        .inc({ [`clicks.${event}_${today}`]: 1, [`clicks.${event}_total`]: 1 })
        .commit({ autoGenerateArrayKeys: true });
    }
    return;
  }

  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};
  clicks[`${event}:${today}`] = (clicks[`${event}:${today}`] || 0) + 1;
  clicks[`${event}:total`] = (clicks[`${event}:total`] || 0) + 1;
  store.__clicks = clicks;
  await writeDevContent(store, tenant);
}

export async function getClickCounts(
  event: string,
  tenant: string = DEFAULT_TENANT
): Promise<{ total: number; today: number; thisWeek: number }> {
  const today = new Date().toISOString().slice(0, 10);

  if (hasSanity) {
    const docId = `clicks-${tenant}`;
    const doc = await getSanityClient().fetch(`*[_id == $docId][0].clicks`, { docId });
    const clicks = (doc || {}) as Record<string, number>;

    const total = clicks[`${event}_total`] || 0;
    const todayCount = clicks[`${event}_${today}`] || 0;
    let weekCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      weekCount += clicks[`${event}_${key}`] || 0;
    }
    return { total, today: todayCount, thisWeek: weekCount };
  }

  const store = await readDevContent(tenant);
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

export async function getClickCountsByPrefix(
  prefix: string,
  tenant: string = DEFAULT_TENANT
): Promise<Record<string, { total: number; thisWeek: number }>> {
  const result: Record<string, { total: number; thisWeek: number }> = {};

  if (hasSanity) {
    const docId = `clicks-${tenant}`;
    const doc = await getSanityClient().fetch(`*[_id == $docId][0].clicks`, { docId });
    const clicks = (doc || {}) as Record<string, number>;

    // Collect unique event names matching prefix (from _total keys)
    for (const key of Object.keys(clicks)) {
      if (key.startsWith(prefix) && key.endsWith("_total")) {
        const event = key.slice(0, -"_total".length);
        let weekCount = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          weekCount += clicks[`${event}_${d.toISOString().slice(0, 10)}`] || 0;
        }
        result[event] = { total: clicks[key] || 0, thisWeek: weekCount };
      }
    }
    return result;
  }

  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};

  for (const key of Object.keys(clicks)) {
    if (key.startsWith(prefix) && key.endsWith(":total")) {
      const event = key.slice(0, -":total".length);
      let weekCount = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        weekCount += clicks[`${event}:${d.toISOString().slice(0, 10)}`] || 0;
      }
      result[event] = { total: clicks[key] || 0, thisWeek: weekCount };
    }
  }
  return result;
}

// --- Booking ---

export async function getBookingConfig(
  tenant: string = DEFAULT_TENANT
): Promise<BookingConfig> {
  if (hasSanity) {
    const doc = await getSanityClient().fetch(
      `*[_type == "bookingConfig" && tenant == $tenant][0]`,
      { tenant }
    );
    if (doc) {
      const { _id, _rev, _type, _createdAt, _updatedAt, tenant: _, ...config } = doc;
      // Clean _key from weeklySchedule items
      if (config.weeklySchedule) {
        config.weeklySchedule = config.weeklySchedule.map(
          ({ _key, ...rest }: { _key?: string } & Record<string, unknown>) => rest
        );
      }
      return config as BookingConfig;
    }
    return DEFAULT_BOOKING_CONFIG;
  }

  const store = await readDevContent(tenant);
  return (store[`__bookingConfig_${tenant}`] as BookingConfig) ?? DEFAULT_BOOKING_CONFIG;
}

export async function setBookingConfig(
  config: BookingConfig,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const existingId = await getSanityClient().fetch(
      `*[_type == "bookingConfig" && tenant == $tenant][0]._id`,
      { tenant }
    );
    const doc = { _type: "bookingConfig" as const, tenant, ...config };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  const store = await readDevContent(tenant);
  store[`__bookingConfig_${tenant}`] = config;
  await writeDevContent(store, tenant);
}

export async function getDateOverrides(
  tenant: string = DEFAULT_TENANT
): Promise<DateOverride[]> {
  if (hasSanity) {
    // Store date overrides as part of booking config
    const doc = await getSanityClient().fetch(
      `*[_type == "bookingConfig" && tenant == $tenant][0].dateOverrides`,
      { tenant }
    );
    return doc || [];
  }

  const store = await readDevContent(tenant);
  return (store[`__dateOverrides_${tenant}`] as DateOverride[]) ?? [];
}

export async function setDateOverrides(
  overrides: DateOverride[],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const existingId = await getSanityClient().fetch(
      `*[_type == "bookingConfig" && tenant == $tenant][0]._id`,
      { tenant }
    );
    if (existingId) {
      await getSanityClient().patch(existingId).set({ dateOverrides: overrides }).commit();
    }
    return;
  }

  const store = await readDevContent(tenant);
  store[`__dateOverrides_${tenant}`] = overrides;
  await writeDevContent(store, tenant);
}

export async function getBookings(
  tenant: string = DEFAULT_TENANT,
  dateRange?: { from: string; to: string }
): Promise<Booking[]> {
  if (hasSanity) {
    let query = `*[_type == "booking" && tenant == $tenant`;
    const params: Record<string, string> = { tenant };

    if (dateRange) {
      query += ` && date >= $from && date <= $to`;
      params.from = dateRange.from;
      params.to = dateRange.to;
    }
    query += `] | order(date asc){ "id": bookingId, serviceId, serviceName, date, startTime, endTime, clientName, clientEmail, clientPhone, notes, status, "createdAt": _createdAt, cancelledAt }`;

    return getSanityClient().fetch(query, params);
  }

  const store = await readDevContent(tenant);
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
  const bookingId = generateBookingId();

  if (hasSanity) {
    const doc = await getSanityClient().create({
      _type: "booking",
      tenant,
      bookingId,
      ...booking,
      status: "confirmed",
    });

    return {
      ...booking,
      id: bookingId,
      status: "confirmed",
      createdAt: doc._createdAt!,
    };
  }

  const newBooking: Booking = {
    ...booking,
    id: bookingId,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  const store = await readDevContent(tenant);
  const bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  bookings.push(newBooking);
  store[`__bookings_${tenant}`] = bookings;
  await writeDevContent(store, tenant);
  return newBooking;
}

export async function updateBooking(
  id: string,
  updates: Partial<Pick<Booking, "status" | "notes" | "cancelledAt">>,
  tenant: string = DEFAULT_TENANT
): Promise<Booking | null> {
  if (hasSanity) {
    const query = `*[_type == "booking" && tenant == $tenant && bookingId == $id][0]`;
    const doc = await getSanityClient().fetch(query, { tenant, id });
    if (!doc) return null;

    await getSanityClient().patch(doc._id).set(updates).commit();
    return {
      id,
      serviceId: doc.serviceId,
      serviceName: doc.serviceName,
      date: doc.date,
      startTime: doc.startTime,
      endTime: doc.endTime,
      clientName: doc.clientName,
      clientEmail: doc.clientEmail,
      clientPhone: doc.clientPhone,
      notes: doc.notes,
      status: doc.status,
      createdAt: doc._createdAt,
      cancelledAt: doc.cancelledAt,
      ...updates,
    };
  }

  const store = await readDevContent(tenant);
  const bookings = (store[`__bookings_${tenant}`] as Booking[]) ?? [];
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  bookings[idx] = { ...bookings[idx], ...updates };
  store[`__bookings_${tenant}`] = bookings;
  await writeDevContent(store, tenant);
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

// --- Newsletter subscribers ---

export interface NewsletterSubscriber {
  email: string;
  name?: string;
  subscribedAt: string;
  status: "active" | "unsubscribed";
}

const DEV_NEWSLETTER_PATH = path.join(process.cwd(), "dev-newsletter.json");

async function readDevNewsletter(): Promise<Record<string, NewsletterSubscriber[]>> {
  try {
    const raw = await fs.readFile(DEV_NEWSLETTER_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeDevNewsletter(data: Record<string, NewsletterSubscriber[]>): Promise<void> {
  await fs.writeFile(DEV_NEWSLETTER_PATH, JSON.stringify(data, null, 2));
}

export async function addSubscriber(
  email: string,
  name?: string,
  tenant: string = DEFAULT_TENANT
): Promise<{ duplicate: boolean }> {
  if (hasSanity) {
    const existing = await getSanityClient().fetch(
      `*[_type == "newsletterSubscriber" && tenant == $tenant && email == $email][0]._id`,
      { tenant, email }
    );
    if (existing) {
      // Re-activate if previously unsubscribed
      await getSanityClient().patch(existing).set({ status: "active" }).commit();
      return { duplicate: true };
    }
    await getSanityClient().create({
      _type: "newsletterSubscriber",
      tenant,
      email,
      name: name || undefined,
      subscribedAt: new Date().toISOString(),
      status: "active",
    });
    return { duplicate: false };
  }

  const store = await readDevNewsletter();
  const subscribers = store[tenant] || [];
  const existing = subscribers.find((s) => s.email === email);
  if (existing) {
    existing.status = "active";
    store[tenant] = subscribers;
    await writeDevNewsletter(store);
    return { duplicate: true };
  }
  subscribers.push({
    email,
    name: name || undefined,
    subscribedAt: new Date().toISOString(),
    status: "active",
  });
  store[tenant] = subscribers;
  await writeDevNewsletter(store);
  return { duplicate: false };
}

export async function getSubscribers(
  tenant: string = DEFAULT_TENANT
): Promise<NewsletterSubscriber[]> {
  if (hasSanity) {
    return getSanityClient().fetch(
      `*[_type == "newsletterSubscriber" && tenant == $tenant] | order(subscribedAt desc) { email, name, subscribedAt, status }`,
      { tenant }
    );
  }

  const store = await readDevNewsletter();
  return (store[tenant] || []).filter((s) => s.status === "active");
}

export async function removeSubscriber(
  email: string,
  tenant: string = DEFAULT_TENANT
): Promise<boolean> {
  if (hasSanity) {
    const existing = await getSanityClient().fetch(
      `*[_type == "newsletterSubscriber" && tenant == $tenant && email == $email][0]._id`,
      { tenant, email }
    );
    if (!existing) return false;
    await getSanityClient().patch(existing).set({ status: "unsubscribed" }).commit();
    return true;
  }

  const store = await readDevNewsletter();
  const subscribers = store[tenant] || [];
  const sub = subscribers.find((s) => s.email === email);
  if (!sub) return false;
  sub.status = "unsubscribed";
  store[tenant] = subscribers;
  await writeDevNewsletter(store);
  return true;
}

// --- Search Console data ---

export async function getSearchData(tenant: string): Promise<SearchData | null> {
  if (hasSanity) {
    const doc = await getSanityReadClient().fetch(
      `*[_type == "searchData" && tenant == $tenant][0]`,
      { tenant },
    );
    if (!doc) return null;
    const { _id, _rev, _type, _createdAt, _updatedAt, tenant: _, ...data } = doc;
    return data as SearchData;
  }

  try {
    const raw = await fs.readFile(path.join(process.cwd(), `dev-search-${tenant}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setSearchData(tenant: string, data: SearchData): Promise<void> {
  if (hasSanity) {
    const query = `*[_type == "searchData" && tenant == $tenant][0]._id`;
    const existingId = await getSanityClient().fetch(query, { tenant });
    const doc = { _type: "searchData" as const, tenant, ...data };
    if (existingId) {
      await getSanityClient().patch(existingId).set(doc).commit();
    } else {
      await getSanityClient().create(doc);
    }
    return;
  }

  await fs.writeFile(
    path.join(process.cwd(), `dev-search-${tenant}.json`),
    JSON.stringify(data, null, 2),
  );
}

// --- Content freshness ---

export async function recordSectionUpdate(
  section: string,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  // With Sanity, _updatedAt is automatic — no manual tracking needed
  if (hasSanity) return;

  const now = new Date().toISOString();
  const store = await readDevContent(tenant);
  const timestamps = (store.__sectionTimestamps as Record<string, string>) ?? {};
  timestamps[section] = now;
  store.__sectionTimestamps = timestamps;
  await writeDevContent(store, tenant);
}

export async function getSectionTimestamps(
  tenant: string = DEFAULT_TENANT
): Promise<Record<string, string>> {
  if (hasSanity) {
    // Query _updatedAt from all content documents for this tenant
    const sections = Object.entries(SECTION_TO_TYPE);
    const timestamps: Record<string, string> = {};

    for (const [section, type] of sections) {
      const doc = await getSanityClient().fetch(
        `*[_type == $type && tenant == $tenant][0]._updatedAt`,
        { type, tenant }
      );
      if (doc) timestamps[section] = doc;
    }
    return timestamps;
  }

  const store = await readDevContent(tenant);
  return (store.__sectionTimestamps as Record<string, string>) ?? {};
}

export async function getSubscriptionOverride(
  tenant: string
): Promise<string | null> {
  const store = await readDevContent(tenant);
  return (store.__subscriptionStatus as string) ?? null;
}

export async function setSubscriptionOverride(
  tenant: string,
  status: string
): Promise<void> {
  const store = await readDevContent(tenant);
  store.__subscriptionStatus = status;
  await writeDevContent(store, tenant);
}
