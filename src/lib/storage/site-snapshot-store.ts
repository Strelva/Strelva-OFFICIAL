/**
 * Full-site snapshots - capture all owner-editable content sections for backup and restore.
 *
 * When DATA_SOURCE=postgres, reads/writes the Postgres `site_snapshots` table;
 * otherwise the dev-file store is the source of truth. The Postgres repo helpers
 * are self-contained in this file and never throw.
 */

import type { ActorContext } from "@/platform/infra/auth";
import type { ContentMap, ContentSection } from "../types";
import { DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { getContent, setContent } from "./content-store";
import { dataSourceIsPostgres } from "@/platform/infra/db/source-flags";
import { getSupabase, type Row, type Insert } from "@/platform/infra/db/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SITE_SNAPSHOT_SECTIONS: ContentSection[] = [
  "hero",
  "services",
  "story",
  "testimonials",
  "events",
  "providers",
  "contact",
  "settings",
  "faq",
  "shop",
  "products",
  "theme",
  "rewardsConfig",
  "navigation",
  "footer",
];

export type SiteSnapshotReason = "manual" | "daily" | "pre_restore" | "self_serve_created" | "system";
export type SiteSnapshotAuthor = "user" | "ai" | "admin" | "system";

export interface SiteSnapshot {
  id: string;
  tenantId: string;
  label: string;
  reason: SiteSnapshotReason;
  author: SiteSnapshotAuthor;
  createdAt: string;
  sections: ContentSection[];
  data: Partial<ContentMap>;
  status: "available" | "restored";
  restoredAt?: string;
  actor?: Pick<ActorContext, "userId" | "email" | "type" | "isSuperAdmin">;
}

export type SiteSnapshotSummary = Omit<SiteSnapshot, "data" | "actor"> & { actorUserId?: string };

export interface CreateSiteSnapshotOptions {
  reason: SiteSnapshotReason;
  label?: string;
  author?: SiteSnapshotAuthor;
  actor?: Pick<ActorContext, "userId" | "email" | "type" | "isSuperAdmin">;
}

export class SiteSnapshotNotFoundError extends Error {
  name = "SiteSnapshotNotFoundError";
}

/** The safety backup before a restore could not be saved, so nothing changed. */
export class SiteSnapshotBackupFailedError extends Error {
  name = "SiteSnapshotBackupFailedError";
}

export class SiteSnapshotRestoreFailedError extends Error {
  name = "SiteSnapshotRestoreFailedError";
  constructor(
    message: string,
    readonly rolledBack: boolean,
    readonly sectionsNeedingAttention: ContentSection[],
  ) {
    super(message);
  }
}

function snapshotsKey(): string {
  return "__siteSnapshots";
}

function makeSnapshotId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultLabel(reason: SiteSnapshotReason): string {
  if (reason === "daily") return `Daily backup ${today()}`;
  if (reason === "pre_restore") return `Before restore ${today()}`;
  if (reason === "self_serve_created") return "Starter site backup";
  return `Site backup ${today()}`;
}

function parseSnapshot(raw: unknown): SiteSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const snapshot = raw as SiteSnapshot;
  if (!snapshot.id || !snapshot.tenantId || !snapshot.createdAt || !snapshot.data) return null;
  return snapshot;
}

function snapshotSummary(snapshot: SiteSnapshot): SiteSnapshotSummary {
  const { data: _data, actor: _actor, ...summary } = snapshot;
  return { ...summary, ...(snapshot.actor?.userId ? { actorUserId: snapshot.actor.userId } : {}) };
}

// --- Postgres repo helpers (self-contained; never throw) -------------------

/** Run a Supabase query and return a safe fallback if it throws or errors. */
async function safe<T>(fn: (db: NonNullable<ReturnType<typeof getSupabase>>) => Promise<T>, fallback: T): Promise<T> {
  const db = getSupabase();
  if (!db) return fallback;
  try {
    return await fn(db);
  } catch {
    return fallback;
  }
}

/** Map a SiteSnapshot to the `site_snapshots` Insert shape (camelCase -> snake_case). */
function snapshotToInsert(snapshot: SiteSnapshot): Insert<"site_snapshots"> {
  const actor = snapshot.actor;
  return {
    id: snapshot.id,
    tenant_id: snapshot.tenantId,
    label: snapshot.label,
    reason: snapshot.reason,
    author: snapshot.author,
    created_at: snapshot.createdAt,
    sections: snapshot.sections as unknown as string[],
    data: snapshot.data as unknown as Insert<"site_snapshots">["data"],
    status: snapshot.status,
    restored_at: snapshot.restoredAt ?? null,
    // actor_user_id FKs users(id) (uuid); the Clerk-era id is not a uuid, so null it.
    actor_user_id: actor?.userId && UUID_RE.test(actor.userId) ? actor.userId : null,
    actor_email: actor?.email ?? null,
    actor_type: actor?.type ?? null,
    actor_is_super_admin: actor?.isSuperAdmin ?? null,
  };
}

/** Map a `site_snapshots` Row to a full SiteSnapshot (data included). */
function mapPgSnapshotRow(row: Row<"site_snapshots">): SiteSnapshot {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    label: row.label,
    reason: row.reason as SiteSnapshotReason,
    author: row.author as SiteSnapshotAuthor,
    createdAt: row.created_at,
    sections: (row.sections as unknown as ContentSection[]) ?? SITE_SNAPSHOT_SECTIONS,
    data: (row.data as unknown as Partial<ContentMap>) ?? {},
    status: (row.status as SiteSnapshot["status"]) || "available",
    restoredAt: row.restored_at ?? undefined,
    actor: row.actor_user_id || row.actor_email || row.actor_type || row.actor_is_super_admin
      ? {
          userId: row.actor_user_id,
          email: row.actor_email,
          type: (row.actor_type as ActorContext["type"]) || "system",
          isSuperAdmin: Boolean(row.actor_is_super_admin),
        }
      : undefined,
  };
}

/** Summary retains only the recorded principal ID, never content or email. */
function mapPgSnapshotSummaryRow(
  row: Pick<
    Row<"site_snapshots">,
    "id" | "tenant_id" | "label" | "reason" | "author" | "created_at" | "sections" | "status" | "restored_at" | "actor_user_id"
  >,
): SiteSnapshotSummary {
  return {
    actorUserId: row.actor_user_id ?? undefined,
    id: row.id,
    tenantId: row.tenant_id,
    label: row.label,
    reason: row.reason as SiteSnapshotReason,
    author: row.author as SiteSnapshotAuthor,
    createdAt: row.created_at,
    sections: (row.sections as unknown as ContentSection[]) ?? SITE_SNAPSHOT_SECTIONS,
    status: (row.status as SiteSnapshot["status"]) || "available",
    restoredAt: row.restored_at ?? undefined,
  };
}

async function pgInsertSnapshot(snapshot: SiteSnapshot): Promise<void> {
  await safe(async (db) => {
    await db.from("site_snapshots").insert(snapshotToInsert(snapshot));
    return null;
  }, null);
}

/** Unlike pgInsertSnapshot, a failed insert throws: a restore needs its backup. */
async function pgInsertSnapshotStrict(snapshot: SiteSnapshot): Promise<void> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase is not configured");
  const { error } = await db.from("site_snapshots").insert(snapshotToInsert(snapshot));
  if (error) throw error;
}

async function pgListSnapshotSummaries(
  tenantId: string,
  limit: number,
): Promise<SiteSnapshotSummary[]> {
  return safe<SiteSnapshotSummary[]>(async (db) => {
    const { data, error } = await db
      .from("site_snapshots")
      .select("id, tenant_id, label, reason, author, created_at, sections, status, restored_at, actor_user_id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(mapPgSnapshotSummaryRow);
  }, []);
}

/** Throws on an outage, so a database failure never reads as "not found". */
async function pgGetSnapshotStrict(
  tenantId: string,
  snapshotId: string,
): Promise<SiteSnapshot | null> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase is not configured");
  const { data, error } = await db
    .from("site_snapshots")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", snapshotId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPgSnapshotRow(data) : null;
}

async function pgUpdateSnapshotStatus(
  tenantId: string,
  snapshotId: string,
  updates: Pick<SiteSnapshot, "status" | "restoredAt">,
): Promise<void> {
  await safe(async (db) => {
    await db
      .from("site_snapshots")
      .update({ status: updates.status, restored_at: updates.restoredAt ?? null })
      .eq("tenant_id", tenantId)
      .eq("id", snapshotId);
    return null;
  }, null);
}

async function readCurrentSiteData(tenantId: string): Promise<Partial<ContentMap>> {
  const entries = await Promise.all(
    SITE_SNAPSHOT_SECTIONS.map(async (section) => {
      const content = await getContent(section, tenantId);
      return [section, content] as const;
    }),
  );

  return Object.fromEntries(entries) as Partial<ContentMap>;
}

async function writeDevSnapshot(snapshot: SiteSnapshot): Promise<void> {
  const store = await readDevContent(snapshot.tenantId);
  const existing = ((store[snapshotsKey()] as unknown[]) ?? [])
    .map(parseSnapshot)
    .filter((item): item is SiteSnapshot => !!item);
  store[snapshotsKey()] = [snapshot, ...existing.filter((item) => item.id !== snapshot.id)]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 60);
  await writeDevContent(store, snapshot.tenantId);
}

async function updateDevSnapshotStatus(
  tenantId: string,
  snapshotId: string,
  updates: Pick<SiteSnapshot, "status" | "restoredAt">,
): Promise<void> {
  const store = await readDevContent(tenantId);
  const existing = ((store[snapshotsKey()] as unknown[]) ?? [])
    .map(parseSnapshot)
    .filter((item): item is SiteSnapshot => !!item);
  store[snapshotsKey()] = existing.map((snapshot) =>
    snapshot.id === snapshotId ? { ...snapshot, ...updates } : snapshot,
  );
  await writeDevContent(store, tenantId);
}

export async function createSiteSnapshot(
  tenantId: string = DEFAULT_TENANT,
  options: CreateSiteSnapshotOptions,
  { required = false }: { required?: boolean } = {},
): Promise<SiteSnapshot> {
  const now = new Date().toISOString();
  const snapshot: SiteSnapshot = {
    id: makeSnapshotId(),
    tenantId,
    label: options.label || defaultLabel(options.reason),
    reason: options.reason,
    author: options.author || (options.actor?.isSuperAdmin ? "admin" : "user"),
    createdAt: now,
    sections: SITE_SNAPSHOT_SECTIONS,
    data: await readCurrentSiteData(tenantId),
    status: "available",
    actor: options.actor,
  };

  if (dataSourceIsPostgres()) {
    if (required) await pgInsertSnapshotStrict(snapshot);
    else await pgInsertSnapshot(snapshot);
  }

  if (!dataSourceIsPostgres()) {
    await writeDevSnapshot(snapshot);
  }
  return snapshot;
}

export async function getSiteSnapshots(
  tenantId: string = DEFAULT_TENANT,
  limit = 12,
): Promise<SiteSnapshotSummary[]> {
  const safeLimit = Math.max(1, Math.min(limit, 60));

  if (dataSourceIsPostgres()) {
    const rows = await pgListSnapshotSummaries(tenantId, safeLimit);
    return rows;
  }

  const store = await readDevContent(tenantId);
  const snapshots = ((store[snapshotsKey()] as unknown[]) ?? [])
    .map(parseSnapshot)
    .filter((item): item is SiteSnapshot => !!item)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return snapshots.slice(0, safeLimit).map(snapshotSummary);
}

async function getSnapshotForRestore(
  tenantId: string,
  snapshotId: string,
): Promise<SiteSnapshot | null> {
  if (dataSourceIsPostgres()) {
    // In Postgres mode, only look in Postgres — never fall through to the
    // dev-file. The dev-file is a local-only store keyed by DEFAULT_TENANT;
    // falling through in mixed mode (CONTENT_SOURCE=postgres but DATA_SOURCE
    // unset, or during the prod → dev-file fallback window) could return a
    // snapshot belonging to a different tenant whose id happens to match the
    // requested snapshotId (cross-tenant data leak via the shared dev-file).
    return pgGetSnapshotStrict(tenantId, snapshotId);
  }

  const store = await readDevContent(tenantId);
  return (((store[snapshotsKey()] as unknown[]) ?? [])
    .map(parseSnapshot)
    .filter((item): item is SiteSnapshot => !!item)
    .find((snapshot) => snapshot.id === snapshotId)) ?? null;
}

export async function getLatestSiteSnapshot(
  tenantId: string = DEFAULT_TENANT,
): Promise<SiteSnapshotSummary | null> {
  return (await getSiteSnapshots(tenantId, 1))[0] ?? null;
}

export async function createDailySiteSnapshot(
  tenantId: string = DEFAULT_TENANT,
): Promise<{ snapshot: SiteSnapshotSummary; created: boolean }> {
  const latest = await getSiteSnapshots(tenantId, 10);
  const todaysDaily = latest.find(
    (snapshot) => snapshot.reason === "daily" && snapshot.createdAt.slice(0, 10) === today(),
  );
  if (todaysDaily) return { snapshot: todaysDaily, created: false };

  const snapshot = await createSiteSnapshot(tenantId, {
    reason: "daily",
    label: defaultLabel("daily"),
    author: "system",
  });
  return { snapshot: snapshotSummary(snapshot), created: true };
}

export async function restoreSiteSnapshot(
  tenantId: string,
  snapshotId: string,
  options: { actor?: Pick<ActorContext, "userId" | "email" | "type" | "isSuperAdmin"> } = {},
): Promise<{ restored: SiteSnapshotSummary; preRestore: SiteSnapshotSummary; restoredSections: ContentSection[] }> {
  const snapshot = await getSnapshotForRestore(tenantId, snapshotId);
  if (!snapshot) {
    throw new SiteSnapshotNotFoundError("Site snapshot not found.");
  }

  // The sections we will write. Snapshots can legitimately hold partial
  // content (a section never filled in), so we restore whatever is present —
  // same truthiness gate the non-atomic version used.
  const toWrite: { section: ContentSection; data: ContentMap[ContentSection] }[] = [];
  for (const section of snapshot.sections) {
    const data = snapshot.data[section];
    if (!data) continue;
    toWrite.push({ section, data: data as ContentMap[ContentSection] });
  }

  let preRestore: SiteSnapshot;
  try {
    preRestore = await createSiteSnapshot(tenantId, {
      reason: "pre_restore",
      label: `Before restoring ${snapshot.label}`,
      author: options.actor?.isSuperAdmin ? "admin" : "user",
      actor: options.actor,
    }, { required: true });
  } catch (err) {
    console.error("[site-snapshots] pre-restore backup failed", err);
    throw new SiteSnapshotBackupFailedError(
      "Could not save a backup before restoring, so nothing was changed. Try again.",
    );
  }

  // Capture current content for each section we are about to overwrite, so a
  // mid-write failure can roll the site back to its pre-restore state rather
  // than leaving it partially restored.
  const previous = new Map<ContentSection, ContentMap[ContentSection] | null>();
  for (const { section } of toWrite) {
    previous.set(section, await getContent(section, tenantId).catch(() => null));
  }

  const written: ContentSection[] = [];
  try {
    for (const { section, data } of toWrite) {
      await setContent(section, data as ContentMap[typeof section], tenantId);
      written.push(section);
    }
  } catch (err) {
    console.error("[site-snapshots] restore write failed; rolling back", err);
    // Roll back the sections that already landed, and say honestly which
    // ones could not be put back.
    const needsAttention: ContentSection[] = [];
    for (const section of written) {
      const prev = previous.get(section);
      if (!prev) {
        needsAttention.push(section);
        continue;
      }
      try {
        await setContent(section, prev as ContentMap[typeof section], tenantId);
      } catch {
        needsAttention.push(section);
      }
    }
    throw new SiteSnapshotRestoreFailedError(
      needsAttention.length
        ? `Restore failed and these sections could not be put back: ${needsAttention.join(", ")}.`
        : "Restore failed and your site was put back the way it was.",
      needsAttention.length === 0,
      needsAttention,
    );
  }

  const restoredAt = new Date().toISOString();
  if (dataSourceIsPostgres()) {
    await pgUpdateSnapshotStatus(tenantId, snapshotId, { status: "restored", restoredAt });
  }

  if (!dataSourceIsPostgres()) {
    await updateDevSnapshotStatus(tenantId, snapshotId, { status: "restored", restoredAt });
  }

  return {
    restored: { ...snapshotSummary(snapshot), status: "restored", restoredAt },
    preRestore: snapshotSummary(preRestore),
    restoredSections: toWrite.map((item) => item.section),
  };
}
