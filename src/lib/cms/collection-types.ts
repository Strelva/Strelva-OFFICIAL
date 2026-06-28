/**
 * Collections CMS — the code-side content-type registry (see
 * docs/strelva-cms-scope.md). Each collection type = a field schema (Zod) + the
 * capability flag that gates it + which field is the display title. Entries are
 * stored in the `collection_entries` Postgres table; `data` holds the type's
 * fields, validated here on write.
 *
 * Registry lives in code (versioned in git, no admin UI to define types) per the
 * scope doc's "type schema home" decision. Add a type by adding an entry here +
 * a rendering theme in the client repo. Reviews are NOT a collection (they sync
 * from Google/Yelp; see src/lib/reviews.ts).
 */

import { z } from "zod";
import type { TenantFeature } from "../types";

export type CollectionType = "blog" | "video" | "product";

const tags = z.array(z.string().min(1)).default([]);
const optionalUrl = z.string().url().optional();

// A storefront image reference: an absolute URL OR a root-relative path. Client
// repos serve product images from their own /public (e.g. "/images/bag.png"), so
// requiring a fully-qualified URL would make real catalogs unrepresentable.
const imageRef = z
  .string()
  .min(1)
  .refine((s) => /^https?:\/\//i.test(s) || s.startsWith("/"), {
    message: "image must be an absolute URL or a root-relative path (/...)",
  });

const blogSchema = z.object({
  title: z.string().min(1),
  excerpt: z.string().default(""),
  body: z.string().default(""),
  author: z.string().default(""),
  tags,
  coverImage: optionalUrl,
});

const videoSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  videoUrl: z.string().url(),
  thumbnail: optionalUrl,
  tags,
});

// Catalog-as-content (scope decision): product CONTENT lives here; checkout
// stays in the client repo (Stripe), reached via checkoutUrl. No cart/orders.
const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().default("USD"),
  images: z.array(imageRef).default([]),
  inStock: z.boolean().default(true),
  checkoutUrl: optionalUrl,
});

export interface CollectionTypeDef {
  type: CollectionType;
  label: string;
  /** The capability flag a tenant opts into to enable this type. */
  feature: TenantFeature;
  schema: z.ZodTypeAny;
  /** Which `data` field is the human-readable title (for lists/editors). */
  titleField: string;
}

export const COLLECTION_TYPES: Record<CollectionType, CollectionTypeDef> = {
  blog: { type: "blog", label: "Blog", feature: "blog", schema: blogSchema, titleField: "title" },
  video: { type: "video", label: "Video", feature: "video", schema: videoSchema, titleField: "title" },
  product: { type: "product", label: "Products", feature: "products", schema: productSchema, titleField: "name" },
};

export function isCollectionType(value: string): value is CollectionType {
  return Object.prototype.hasOwnProperty.call(COLLECTION_TYPES, value);
}

/** Validate an entry's `data` against its type schema. */
export function validateEntryData(type: CollectionType, data: unknown) {
  return COLLECTION_TYPES[type].schema.safeParse(data);
}

/** The display title for an entry, falling back to the slug. */
export function entryTitle(type: CollectionType, data: Record<string, unknown>, slug: string): string {
  const field = COLLECTION_TYPES[type].titleField;
  const value = data[field];
  return typeof value === "string" && value.trim() ? value : slug;
}
