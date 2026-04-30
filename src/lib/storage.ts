/**
 * =============================================================================
 * REB STORAGE ARCHITECTURE
 * =============================================================================
 *
 * OVERVIEW:
 * This file handles all content persistence for REB. There are three storage
 * backends with a clear hierarchy:
 *
 * 1. SANITY CMS (Production)
 *    - Source of truth for all tenant content in production
 *    - Used when: NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_TOKEN are set
 *    - Stores: content sections, versions, inbox, activity, chat, bookings,
 *              newsletter subscribers, social posts, search data, page config
 *
 * 2. REDIS (Cache Layer)
 *    - Read-through cache for hot paths (chat messages)
 *    - TTL: 1 hour for chat, varies for other uses
 *    - Write-through: on Sanity write, also writes to Redis
 *    - Backfill: on cache miss, fetches from Sanity and populates cache
 *    - Falls back gracefully if Redis unavailable (not fatal)
 *
 * 3. DEV FILES (Local Development)
 *    - Used when Sanity is NOT configured (no env vars)
 *    - Files: dev-content.json, dev-chat.json, dev-newsletter.json,
 *             dev-tenants.json, dev-social-{tenant}.json, dev-search-{tenant}.json
 *    - Also used as fallback if Sanity query returns null for a tenant
 *
 * FALLBACK ORDER:
 *   getContent():  Sanity → dev-content.json → defaults (from defaults.ts)
 *   loadChatMessages():  Redis cache → Sanity → [] (empty)
 *   For most other getters: Sanity → dev file → empty/default
 *
 * MULTI-TENANT:
 *   - All content is namespaced by tenant ID
 *   - Sanity: `tenant` field on every document, filtered in queries
 *   - Dev files: per-tenant `dev-content-{tenant}.json`
 *   - Default tenant is "demo" (see DEFAULT_TENANT) — used only when no tenant is in scope
 *
 * REDIS USAGE:
 *   - Chat messages only (read-through + write-through cache)
 *   - Tenant config is cached in tenants.ts (separate file)
 *   - Content sections are NOT cached in Redis (Sanity CDN handles this)
 *
 * NOTES:
 *   - Images from Sanity are transformed back to URL strings for frontend compatibility
 *   - Content versioning is separate from Sanity's built-in revisions (uses contentVersion type)
 *   - Click tracking uses a single document per tenant with counter fields
 *
 * =============================================================================
 */

import { promises as fs } from "fs";
import path from "path";
import type { ContentSection, ContentMap, BookingConfig, DateOverride, Booking, SearchData } from "./types";
import type { WeeklyReportData } from "./reports";
import { defaults } from "./defaults";
import { DEFAULT_BOOKING_CONFIG, generateBookingId, generateSlots } from "./booking";
import { getSanityClient, getSanityReadClient, sanityImageUrl } from "./sanity";
import { getRedis } from "./redis";

const hasSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;

/** Default tenant — used only when no tenant is in scope. Real tenants always pass an explicit tenant ID. */
export const DEFAULT_TENANT = "demo";

// --- Dev file fallback (no Sanity configured) ---

function devContentPath(tenant: string): string {
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
  theme: "theme",
  rewardsConfig: "rewardsConfig",
  navigation: "navigation",
  footer: "footer",
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
  tenant: string = DEFAULT_TENANT,
  options?: { preview?: boolean }
): Promise<ContentMap[K]> {
  // If preview mode is enabled, check for draft content first
  if (options?.preview) {
    const draft = await getDraftContent(section, tenant);
    if (draft) return draft;
  }

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

// --- Content Versioning ---

export interface ContentVersion {
  id: string;
  section: string;
  data: unknown;
  author: "user" | "ai";
  timestamp: string;
  status: "live" | "rolled-back";
  changes?: { field: string; before: string; after: string }[];
}

export async function appendVersion(
  section: ContentSection,
  data: unknown,
  author: "user" | "ai",
  tenant: string = DEFAULT_TENANT,
  changes?: { field: string; before: string; after: string }[]
): Promise<ContentVersion> {
  const version: ContentVersion = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    section,
    data,
    author,
    timestamp: new Date().toISOString(),
    status: "live",
    changes,
  };

  if (hasSanity) {
    await getSanityClient().create({
      _type: "contentVersion",
      tenant,
      versionId: version.id,
      section: version.section,
      data: JSON.stringify(version.data),
      author: version.author,
      time: version.timestamp,
      status: version.status,
      changes: version.changes,
    });
    return version;
  }

  const store = await readDevContent(tenant);
  const key = `__versions:${section}`;
  const versions = (store[key] as ContentVersion[]) ?? [];
  // Mark all previous live versions as rolled-back
  for (const v of versions) {
    if (v.status === "live") v.status = "rolled-back";
  }
  versions.unshift(version);
  store[key] = versions.slice(0, 50); // keep last 50 versions per section
  await writeDevContent(store, tenant);
  return version;
}

export async function getVersions(
  section: ContentSection,
  tenant: string = DEFAULT_TENANT
): Promise<ContentVersion[]> {
  if (hasSanity) {
    const raw = await getSanityReadClient().fetch<
      Array<{
        versionId: string;
        section: string;
        data: string;
        author: string;
        time: string;
        status: string;
        changes?: ContentVersion["changes"];
      }>
    >(
      `*[_type == "contentVersion" && tenant == $tenant && section == $section] | order(time desc)[0...50]{
        versionId, section, data, author, time, status, changes
      }`,
      { tenant, section }
    );
    return raw.map((v) => ({
      id: v.versionId,
      section: v.section,
      data: typeof v.data === "string" ? JSON.parse(v.data) : v.data,
      author: v.author as "user" | "ai",
      timestamp: v.time,
      status: v.status as "live" | "rolled-back",
      changes: v.changes,
    }));
  }

  const store = await readDevContent(tenant);
  const key = `__versions:${section}`;
  return (store[key] as ContentVersion[]) ?? [];
}

export async function restoreVersion(
  section: ContentSection,
  versionId: string,
  tenant: string = DEFAULT_TENANT
): Promise<ContentVersion | null> {
  const versions = await getVersions(section, tenant);
  const target = versions.find((v) => v.id === versionId);
  if (!target) return null;

  // Write the restored content as live
  await setContent(section, target.data as ContentMap[ContentSection], tenant);

  // Create a new version marking this as a restore
  const restored = await appendVersion(section, target.data, "user", tenant, [
    { field: "_restore", before: "", after: `Restored from ${versionId}` },
  ]);

  return restored;
}

// --- Inbox ---

export interface InboxItem {
  id: string;
  type: "ai-action" | "suggestion" | "review-alert" | "booking" | "subscriber" | "system";
  title: string;
  detail?: string;
  timestamp: string;
  read: boolean;
  section?: string;
  actions?: { label: string; href?: string; chatPrompt?: string }[];
}

export async function addInboxItem(
  item: Omit<InboxItem, "id" | "timestamp" | "read">,
  tenant: string = DEFAULT_TENANT
): Promise<InboxItem> {
  const full: InboxItem = {
    ...item,
    id: `inbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };

  if (hasSanity) {
    await getSanityClient().create({
      _type: "inboxItem",
      tenant,
      itemId: full.id,
      itemType: full.type,
      title: full.title,
      detail: full.detail,
      time: full.timestamp,
      read: false,
      section: full.section,
      actions: full.actions,
    });
    return full;
  }

  const store = await readDevContent(tenant);
  const items = (store.__inbox as InboxItem[]) ?? [];
  items.unshift(full);
  store.__inbox = items.slice(0, 200);
  await writeDevContent(store, tenant);
  return full;
}

export async function getInboxItems(
  tenant: string = DEFAULT_TENANT,
  filters?: { type?: string; unreadOnly?: boolean }
): Promise<InboxItem[]> {
  if (hasSanity) {
    let query = `*[_type == "inboxItem" && tenant == $tenant`;
    const params: Record<string, string | boolean> = { tenant };
    if (filters?.type) {
      query += ` && itemType == $itemType`;
      params.itemType = filters.type;
    }
    if (filters?.unreadOnly) {
      query += ` && read == false`;
    }
    query += `] | order(time desc)[0...50]{
      "id": itemId, "type": itemType, title, detail, "timestamp": time, read, section, actions
    }`;
    return getSanityReadClient().fetch(query, params);
  }

  const store = await readDevContent(tenant);
  let items = (store.__inbox as InboxItem[]) ?? [];
  if (filters?.type) {
    items = items.filter((i) => i.type === filters.type);
  }
  if (filters?.unreadOnly) {
    items = items.filter((i) => !i.read);
  }
  return items.slice(0, 50);
}

export async function markInboxRead(
  itemId: string,
  tenant: string = DEFAULT_TENANT
): Promise<boolean> {
  if (hasSanity) {
    const docId = await getSanityClient().fetch(
      `*[_type == "inboxItem" && tenant == $tenant && itemId == $itemId][0]._id`,
      { tenant, itemId }
    );
    if (!docId) return false;
    await getSanityClient().patch(docId).set({ read: true }).commit();
    return true;
  }

  const store = await readDevContent(tenant);
  const items = (store.__inbox as InboxItem[]) ?? [];
  const item = items.find((i) => i.id === itemId);
  if (!item) return false;
  item.read = true;
  store.__inbox = items;
  await writeDevContent(store, tenant);
  return true;
}

export async function markAllInboxRead(
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    const docs = await getSanityClient().fetch<Array<{ _id: string }>>(
      `*[_type == "inboxItem" && tenant == $tenant && read == false]{_id}`,
      { tenant }
    );
    const tx = getSanityClient().transaction();
    for (const doc of docs) {
      tx.patch(doc._id, (p) => p.set({ read: true }));
    }
    await tx.commit();
    return;
  }

  const store = await readDevContent(tenant);
  const items = (store.__inbox as InboxItem[]) ?? [];
  for (const item of items) item.read = true;
  store.__inbox = items;
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

const CHAT_CACHE_TTL_SECONDS = 3600; // 1 hour

function chatCacheKey(tenant: string, clientId: string): string {
  return `reb:chat:${tenant}:${clientId}`;
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
        // Redis write failed — Sanity is the source of truth, so this is fine
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
        // Redis read failed — fall through to Sanity
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
        // Redis write failed — not fatal
      }
    }

    return result;
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
  /**
   * Full previous content blob captured at the time of the save.
   * Used by Phase 14 version history to restore earlier versions.
   * Stored as a JSON string in Sanity to avoid schema constraints.
   */
  snapshot?: unknown;
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
      snapshot:
        entry.snapshot === undefined ? undefined : JSON.stringify(entry.snapshot),
    });
  } else {
    const store = await readDevContent(tenant);
    const activity = (store.__activity as unknown[]) ?? [];
    activity.unshift(entry);
    store.__activity = activity.slice(0, 200);
    await writeDevContent(store, tenant);
  }

  // Auto-create inbox item for AI actions and notable events
  if (entry.actor === "ai" || entry.type === "ai" || entry.type === "review-reply" || entry.type === "newsletter") {
    const inboxType =
      entry.type === "review-reply" ? "review-alert" as const :
      entry.type === "newsletter" ? "system" as const :
      "ai-action" as const;
    try {
      await addInboxItem({
        type: inboxType,
        title: entry.text,
        section: entry.section,
        detail: entry.changes?.slice(0, 2).map((c) => `${c.field}: ${c.after}`).join(", "),
      }, tenant);
    } catch {
      // Inbox write failure should never block activity logging
    }
  }
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
    query += `] | order(time desc)[0...50]{ text, "type": activityType, time, section, actor, changes, snapshot }`;
    const raw = await getSanityClient().fetch<Array<ActivityEntry & { snapshot?: string | unknown }>>(query, params);
    return raw.map((entry) => {
      if (typeof entry.snapshot === "string") {
        try {
          return { ...entry, snapshot: JSON.parse(entry.snapshot) };
        } catch {
          return { ...entry, snapshot: undefined };
        }
      }
      return entry;
    });
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

export async function getPageConfig(
  tenant: string = DEFAULT_TENANT
): Promise<SitePageConfig | null> {
  if (hasSanity) {
    const doc = await getSanityReadClient().fetch(
      `*[_type == "pageConfig" && tenant == $tenant][0]`,
      { tenant }
    );
    if (doc) {
      const { _id, _rev, _type, _createdAt, _updatedAt, tenant: _, ...config } = doc;
      return config.pages as SitePageConfig;
    }
    return null;
  }

  const store = await readDevContent(tenant);
  return (store.__pageConfig as SitePageConfig) ?? null;
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

export interface DailyMetric {
  date: string;
  pageViews: number;
  bookingClicks: number;
}

export async function getDailyMetrics(
  tenant: string = DEFAULT_TENANT,
  days: number = 30
): Promise<DailyMetric[]> {
  const result: DailyMetric[] = [];

  if (hasSanity) {
    const docId = `clicks-${tenant}`;
    const doc = await getSanityClient().fetch(`*[_id == $docId][0].clicks`, { docId });
    const clicks = (doc || {}) as Record<string, number>;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push({
        date: key,
        pageViews: clicks[`page-view_${key}`] || 0,
        bookingClicks: clicks[`booking-click_${key}`] || 0,
      });
    }
    return result;
  }

  const store = await readDevContent(tenant);
  const clicks = (store.__clicks as Record<string, number>) ?? {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({
      date: key,
      pageViews: clicks[`page-view:${key}`] || 0,
      bookingClicks: clicks[`booking-click:${key}`] || 0,
    });
  }
  return result;
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

// --- Social posts ---

import type { SocialPost } from "./types";

const DEV_SOCIAL_PATH = (tenant: string) =>
  path.join(process.cwd(), `dev-social-${tenant}.json`);

async function readDevSocial(tenant: string): Promise<SocialPost[]> {
  try {
    const raw = await fs.readFile(DEV_SOCIAL_PATH(tenant), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeDevSocial(tenant: string, posts: SocialPost[]): Promise<void> {
  await fs.writeFile(DEV_SOCIAL_PATH(tenant), JSON.stringify(posts, null, 2));
}

export async function getSocialPosts(tenant: string): Promise<SocialPost[]> {
  if (hasSanity) {
    const results = await getSanityReadClient().fetch(
      `*[_type == "socialPost" && tenant == $tenant] | order(createdAt desc) {
        "id": _id, platform, content, imageUrl, status, scheduledFor, publishedAt, createdAt
      }`,
      { tenant }
    );
    return results || [];
  }

  return readDevSocial(tenant);
}

export async function setSocialPosts(tenant: string, posts: SocialPost[]): Promise<void> {
  // For Sanity, individual CRUD is handled at the API layer.
  // This bulk setter is the dev-file fallback and a convenience for the agent tools.
  if (hasSanity) {
    // Sanity: delete all existing, recreate. Brute but correct for local-first MVP.
    const existing = await getSanityClient().fetch(
      `*[_type == "socialPost" && tenant == $tenant]._id`,
      { tenant }
    );
    for (const id of (existing || [])) {
      await getSanityClient().delete(id);
    }
    for (const post of posts) {
      await getSanityClient().create({
        _type: "socialPost",
        tenant,
        ...post,
      });
    }
    return;
  }

  await writeDevSocial(tenant, posts);
}

// --- Weekly Reports ---

export interface StoredWeeklyReport {
  id: string;
  weekStart: string; // ISO date of the Monday
  createdAt: string;
  pageViews: { total: number; thisWeek: number };
  bookingClicks: { total: number; thisWeek: number };
  topServices: Array<{ serviceId: string; total: number; thisWeek: number }>;
  staleSections: Array<{ section: string; daysSinceUpdate: number }>;
  summary: string;
}

const DEV_REPORTS_PATH = (tenant: string) =>
  path.join(process.cwd(), `dev-reports-${tenant}.json`);

async function readDevReports(tenant: string): Promise<StoredWeeklyReport[]> {
  try {
    const raw = await fs.readFile(DEV_REPORTS_PATH(tenant), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeDevReports(tenant: string, reports: StoredWeeklyReport[]): Promise<void> {
  await fs.writeFile(DEV_REPORTS_PATH(tenant), JSON.stringify(reports, null, 2));
}

function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

export async function saveWeeklyReport(
  tenant: string,
  report: WeeklyReportData
): Promise<StoredWeeklyReport> {
  const weekStart = getWeekStart();
  const stored: StoredWeeklyReport = {
    id: `report_${weekStart}_${tenant}`,
    weekStart,
    createdAt: new Date().toISOString(),
    pageViews: report.pageViews,
    bookingClicks: report.bookingClicks,
    topServices: report.topServices,
    staleSections: report.staleSections,
    summary: report.summary,
  };

  if (hasSanity) {
    // Upsert: check if report for this week exists
    const existing = await getSanityClient().fetch(
      `*[_type == "weeklyReport" && tenant == $tenant && weekStart == $weekStart][0]._id`,
      { tenant, weekStart }
    );
    if (existing) {
      await getSanityClient().patch(existing).set({
        pageViews: stored.pageViews,
        bookingClicks: stored.bookingClicks,
        topServices: stored.topServices,
        staleSections: stored.staleSections,
        summary: stored.summary,
        createdAt: stored.createdAt,
      }).commit();
    } else {
      await getSanityClient().create({
        _type: "weeklyReport",
        tenant,
        reportId: stored.id,
        weekStart: stored.weekStart,
        createdAt: stored.createdAt,
        pageViews: stored.pageViews,
        bookingClicks: stored.bookingClicks,
        topServices: stored.topServices,
        staleSections: stored.staleSections,
        summary: stored.summary,
      });
    }
    return stored;
  }

  // Dev file: upsert by weekStart
  const reports = await readDevReports(tenant);
  const idx = reports.findIndex((r) => r.weekStart === weekStart);
  if (idx >= 0) {
    reports[idx] = stored;
  } else {
    reports.unshift(stored);
  }
  // Keep last 52 weeks
  await writeDevReports(tenant, reports.slice(0, 52));
  return stored;
}

export async function getWeeklyReports(
  tenant: string,
  limit: number = 12
): Promise<StoredWeeklyReport[]> {
  if (hasSanity) {
    const results = await getSanityReadClient().fetch(
      `*[_type == "weeklyReport" && tenant == $tenant] | order(weekStart desc)[0...$limit] {
        "id": reportId, weekStart, createdAt, pageViews, bookingClicks, topServices, staleSections, summary
      }`,
      { tenant, limit }
    );
    return results || [];
  }

  const reports = await readDevReports(tenant);
  return reports.slice(0, limit);
}

