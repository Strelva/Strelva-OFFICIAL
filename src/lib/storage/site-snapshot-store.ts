/**
 * Full-site snapshots - capture all owner-editable content sections for backup and restore.
 */

import type { ActorContext } from "../auth";
import type { ContentMap, ContentSection } from "../types";
import { getSanityClient, getSanityReadClient } from "../sanity";
import { DEFAULT_TENANT, hasSanity, readDevContent, writeDevContent } from "./core";
import { getContent, setContent } from "./content-store";

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

export type SiteSnapshotSummary = Omit<SiteSnapshot, "data" | "actor">;

export interface CreateSiteSnapshotOptions {
  reason: SiteSnapshotReason;
  label?: string;
  author?: SiteSnapshotAuthor;
  actor?: Pick<ActorContext, "userId" | "email" | "type" | "isSuperAdmin">;
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
  return summary;
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

  if (hasSanity) {
    await getSanityClient().create({
      _type: "siteSnapshot",
      tenant: tenantId,
      snapshotId: snapshot.id,
      label: snapshot.label,
      reason: snapshot.reason,
      author: snapshot.author,
      createdAt: snapshot.createdAt,
      sections: snapshot.sections,
      data: JSON.stringify(snapshot.data),
      status: snapshot.status,
      actorUserId: snapshot.actor?.userId,
      actorEmail: snapshot.actor?.email,
      actorType: snapshot.actor?.type,
      actorIsSuperAdmin: snapshot.actor?.isSuperAdmin,
    });
    return snapshot;
  }

  await writeDevSnapshot(snapshot);
  return snapshot;
}

export async function getSiteSnapshots(
  tenantId: string = DEFAULT_TENANT,
  limit = 12,
): Promise<SiteSnapshotSummary[]> {
  const safeLimit = Math.max(1, Math.min(limit, 60));
  if (hasSanity) {
    const raw = await getSanityReadClient().fetch<
      Array<{
        snapshotId: string;
        label: string;
        reason: SiteSnapshotReason;
        author: SiteSnapshotAuthor;
        createdAt: string;
        sections: ContentSection[];
        status: SiteSnapshot["status"];
        restoredAt?: string;
      }>
    >(
      `*[_type == "siteSnapshot" && tenant == $tenant] | order(createdAt desc)[0...${safeLimit}]{
        snapshotId, label, reason, author, createdAt, sections, status, restoredAt
      }`,
      { tenant: tenantId },
    );

    return raw.map((snapshot) => ({
      id: snapshot.snapshotId,
      tenantId,
      label: snapshot.label,
      reason: snapshot.reason,
      author: snapshot.author,
      createdAt: snapshot.createdAt,
      sections: snapshot.sections || SITE_SNAPSHOT_SECTIONS,
      status: snapshot.status || "available",
      restoredAt: snapshot.restoredAt,
    }));
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
  if (hasSanity) {
    const raw = await getSanityReadClient().fetch<{
      snapshotId: string;
      label: string;
      reason: SiteSnapshotReason;
      author: SiteSnapshotAuthor;
      createdAt: string;
      sections: ContentSection[];
      data?: string;
      status: SiteSnapshot["status"];
      restoredAt?: string;
    } | null>(
      `*[_type == "siteSnapshot" && tenant == $tenant && snapshotId == $snapshotId][0]{
        snapshotId, label, reason, author, createdAt, sections, data, status, restoredAt
      }`,
      { tenant: tenantId, snapshotId },
    );
    if (!raw?.data) return null;
    return {
      id: raw.snapshotId,
      tenantId,
      label: raw.label,
      reason: raw.reason,
      author: raw.author,
      createdAt: raw.createdAt,
      sections: raw.sections || SITE_SNAPSHOT_SECTIONS,
      data: JSON.parse(raw.data) as Partial<ContentMap>,
      status: raw.status || "available",
      restoredAt: raw.restoredAt,
    };
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
): Promise<{ restored: SiteSnapshotSummary; preRestore: SiteSnapshotSummary }> {
  const snapshot = await getSnapshotForRestore(tenantId, snapshotId);
  if (!snapshot) {
    throw new Error("Site snapshot not found.");
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

  const preRestore = await createSiteSnapshot(tenantId, {
    reason: "pre_restore",
    label: `Before restoring ${snapshot.label}`,
    author: options.actor?.isSuperAdmin ? "admin" : "user",
    actor: options.actor,
  });

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
    // Roll back the sections that already landed.
    for (const section of written) {
      const prev = previous.get(section);
      if (prev) {
        try {
          await setContent(section, prev as ContentMap[typeof section], tenantId);
        } catch {
          // best-effort rollback; the throw below surfaces the original failure
        }
      }
    }
    throw new Error(
      `Restore failed on a section write and was rolled back: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  const restoredAt = new Date().toISOString();
  if (hasSanity) {
    const docId = await getSanityReadClient().fetch<string | null>(
      `*[_type == "siteSnapshot" && tenant == $tenant && snapshotId == $snapshotId][0]._id`,
      { tenant: tenantId, snapshotId },
    );
    if (docId) {
      await getSanityClient().patch(docId).set({ status: "restored", restoredAt }).commit();
    }
  } else {
    await updateDevSnapshotStatus(tenantId, snapshotId, { status: "restored", restoredAt });
  }

  return {
    restored: { ...snapshotSummary(snapshot), status: "restored", restoredAt },
    preRestore: snapshotSummary(preRestore),
  };
}
