/**
 * Collections CMS service — the shared write/read logic behind both the
 * authenticated API route (the basic client editor) and the AI agent tools.
 * Validates against the type registry, derives a slug, upserts to Postgres, and
 * logs activity. Keep route handlers and agent tools thin over this.
 */
import { listEntries, getEntryBySlug, upsertEntry, deleteEntry } from "@/platform/infra/db/repositories";
import type { Row, Insert } from "@/platform/infra/db/client";
import { COLLECTION_TYPES, validateEntryData, entryTitle, type CollectionType } from "./collection-types";
import { logActivity } from "../storage";
import { clientRevalidationTargetForCollection } from "../content-revalidation";
import { refreshLiveSite, type LiveSiteRefresh } from "../live-site-refresh";

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
  | { ok: true; entry: Row<"collection_entries">; liveSite?: LiveSiteRefresh }
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

  // Best-effort read: null on failure or when the entry is new.
  const prior = await getEntryBySlug(input.tenant, input.type, slug);

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
  // Only a change the live site could show needs a refresh: publishing, or
  // pulling something that was published. Draft-only saves stay quiet.
  let liveSite: LiveSiteRefresh | undefined;
  if ((input.status ?? "draft") === "published" || prior?.status === "published") {
    const target = clientRevalidationTargetForCollection(input.type, slug);
    liveSite = await refreshLiveSite(input.tenant, target.paths, { tags: target.tags });
  }
  return { ok: true, entry: row, ...(liveSite ? { liveSite } : {}) };
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
): Promise<{ liveSite?: LiveSiteRefresh }> {
  const prior = await getEntryBySlug(tenant, type, slug);
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
  // An entry whose state is unknown is treated as possibly live.
  if (prior !== null && prior.status !== "published") return {};
  const target = clientRevalidationTargetForCollection(type, slug);
  return { liveSite: await refreshLiveSite(tenant, target.paths, { tags: target.tags }) };
}
