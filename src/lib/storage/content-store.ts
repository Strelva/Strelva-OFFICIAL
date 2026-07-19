/**
 * Content storage - CRUD for typed content sections.
 * Source of truth for hero, services, story, testimonials, etc.
 */

import type { ContentSection, ContentMap } from "../types";
import { defaults } from "../defaults";
import { sanityImageUrl } from "../sanity";
import { DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { getDraftContent } from "./draft-store";
import {
  getCachedContent,
  invalidateCachedContent,
  setCachedContent,
} from "./content-cache";
import { addSentryBreadcrumb } from "../sentry-context";
import { getContentData, upsertContentData } from "../db/repositories";
import { contentSourceIsPostgres } from "../db/source-flags";
import { getTenantContentDefault } from "../tenant-content-defaults";

export { DEFAULT_TENANT };

// --- Sanity document type mapping ---

export const SECTION_TO_TYPE: Record<ContentSection, string> = {
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
 * This keeps the rest of the codebase unchanged - components still receive
 * `backgroundImageUrl: string`, `image_url: string`, etc.
 */
export function transformSanityImages<K extends ContentSection>(
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
        const existingUrl = typeof rest[mapping.urlField] === "string" ? rest[mapping.urlField] : "";
        return {
          ...rest,
          id: rest.id || _key || "",
          [mapping.urlField]: img ? sanityImageUrl(img) : existingUrl,
        };
      });
    }
  }

  // Testimonials, FAQ - array items with _key -> id
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

export async function getContent<K extends ContentSection>(
  section: K,
  tenant: string = DEFAULT_TENANT,
  options?: { preview?: boolean }
): Promise<ContentMap[K]> {
  // Preview reads bypass the public cache — they intentionally surface
  // unpublished drafts. Go straight to the draft store and fall through to
  // the published source on miss without populating Redis.
  if (options?.preview) {
    const draft = await getDraftContent(section, tenant);
    if (draft) return draft;
  } else {
    // Hot path: Redis-backed cache in front of the source of truth.
    const cached = await getCachedContent(section, tenant);
    if (cached !== null) return cached;
  }

  let data: ContentMap[K];
  // Postgres is the source of truth when CONTENT_SOURCE=postgres. A stored row's
  // data mirrors the legacy Sanity doc shape (image fields may still be Sanity
  // asset refs until the content-URL rewrite ops step runs), so transformSanityImages
  // keeps image-field parity. A miss falls through to the dev file (local only).
  const pgRaw = contentSourceIsPostgres()
    ? await getContentData(tenant, SECTION_TO_TYPE[section])
    : null;
  if (pgRaw) {
    data = transformSanityImages(section, pgRaw);
  } else {
    // No stored row: prefer a tenant-specific default (real brand content)
    // over the generic template default, so a missing/cleared row never
    // regresses to the "Your Business" placeholder.
    const store = await readDevContent(tenant);
    data =
      (store[section] as ContentMap[K]) ??
      getTenantContentDefault(tenant, section) ??
      defaults[section];
  }

  // Populate cache on miss (skip in preview — drafts never enter the public
  // cache).
  if (!options?.preview) {
    await setCachedContent(section, tenant, data);
  }
  return data;
}

export async function setContent<K extends ContentSection>(
  section: K,
  data: ContentMap[K],
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  addSentryBreadcrumb("content", `setContent: ${section}`, { tenant, section });
  try {
    if (contentSourceIsPostgres()) {
      // Postgres is the source of truth. Store the frontend data shape as-is;
      // transformSanityImages on read is a no-op for already-URL'd image fields.
      await upsertContentData(
        tenant,
        SECTION_TO_TYPE[section],
        data as unknown as Record<string, unknown>
      );
    } else {
      const store = await readDevContent(tenant);
      store[section] = data;
      await writeDevContent(store, tenant);
    }
  } catch (err) {
    // Source-of-truth write failed — drop any stale cache entry so the next
    // read repopulates from whatever wins (dev file or defaults).
    await invalidateCachedContent(section, tenant);
    throw err;
  }

  // Source of truth updated successfully — write-through to the cache so the
  // next public read is fast and consistent without an invalidate-then-
  // thundering-herd window.
  await setCachedContent(section, tenant, data);
}
