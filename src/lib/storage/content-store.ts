/**
 * Content storage - CRUD for typed content sections.
 * Source of truth for hero, services, story, testimonials, etc.
 */

import type { ContentSection, ContentMap } from "../types";
import { defaults } from "../defaults";
import { getSanityClient, getSanityReadClient, sanityImageUrl } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { getDraftContent } from "./draft-store";

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
