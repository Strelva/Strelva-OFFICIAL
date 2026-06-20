/**
 * Collections CMS service — the shared write/read logic behind both the
 * authenticated API route (the basic client editor) and the AI agent tools.
 * Validates against the type registry, derives a slug, upserts to Postgres, and
 * logs activity. Keep route handlers and agent tools thin over this.
 */
import { listEntries, getEntryBySlug, upsertEntry, deleteEntry } from "../db/repositories";
import type { Row, Insert } from "../db/client";
import { COLLECTION_TYPES, validateEntryData, entryTitle, type CollectionType } from "./collection-types";
import { logActivity } from "../storage";

export type EntryStatus = "draft" | "published";
export type EntryActor = "user" | "ai" | "admin";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface SaveEntryInput {
  tenant: string;
  type: CollectionType;
  slug?: string;
  data: Record<string, unknown>;
  status?: EntryStatus;
  actor?: EntryActor;
}

export type SaveEntryResult =
  | { ok: true; entry: Row<"collection_entries"> }
  | { ok: false; error: string };

/** Create or update an entry. Validates `data` against the type schema. */
export async function saveEntry(input: SaveEntryInput): Promise<SaveEntryResult> {
  const parsed = validateEntryData(input.type, input.data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry data" };
  }
  const data = parsed.data as Record<string, unknown>;
  const titleField = COLLECTION_TYPES[input.type].titleField;
  const slug = (input.slug?.trim() || slugify(String(data[titleField] ?? ""))) as string;
  if (!slug) return { ok: false, error: "Could not derive a slug from the entry" };

  const row = await upsertEntry({
    tenant_id: input.tenant,
    type: input.type,
    slug,
    status: input.status ?? "draft",
    data: data as Insert<"collection_entries">["data"],
  });
  if (!row) return { ok: false, error: "Save failed (storage unavailable)" };

  const verb = (input.status ?? "draft") === "published" ? "published" : "saved";
  await logActivity(
    {
      text: `${verb} ${COLLECTION_TYPES[input.type].label} entry "${entryTitle(input.type, data, slug)}"`,
      time: new Date().toISOString(),
      type: "content",
      section: `${input.type}:${slug}`,
      actor: input.actor ?? "user",
    },
    input.tenant
  );
  return { ok: true, entry: row };
}

export async function listEntriesForType(
  tenant: string,
  type: CollectionType,
  opts?: { status?: EntryStatus; limit?: number }
): Promise<Row<"collection_entries">[]> {
  return listEntries(tenant, type, opts);
}

export async function getEntry(
  tenant: string,
  type: CollectionType,
  slug: string
): Promise<Row<"collection_entries"> | null> {
  return getEntryBySlug(tenant, type, slug);
}

export async function removeEntry(
  tenant: string,
  type: CollectionType,
  slug: string,
  actor: EntryActor = "user"
): Promise<void> {
  await deleteEntry(tenant, type, slug);
  await logActivity(
    {
      text: `deleted ${COLLECTION_TYPES[type].label} entry "${slug}"`,
      time: new Date().toISOString(),
      type: "content",
      section: `${type}:${slug}`,
      actor,
    },
    tenant
  );
}
