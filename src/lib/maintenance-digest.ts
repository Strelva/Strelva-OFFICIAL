import { getRedis } from "./redis";
import { getSectionTimestamps } from "./storage";
import { detectStaleSections } from "./reports";
import { getScanSummary } from "./scan-store";
import { addSuggestion } from "./suggestions";

/**
 * Autonomous maintenance digest — the "done-with-you management" loop.
 * Weekly, the system proposes the upkeep each client's site needs (stale
 * sections to refresh, weak health categories to fix). An operator reviews the
 * batch in one place and approves it; on approval each item becomes a proactive
 * suggestion that flows to the owner's dashboard and the AI acts on. Deterministic
 * (no AI call to build), so the digest is reliable and free to generate.
 */

export type MaintenanceItemType = "content" | "health";

export interface MaintenanceDigestItem {
  id: string;
  type: MaintenanceItemType;
  title: string;
  detail: string;
  /** A chat prompt the AI can run to do the work, once approved. */
  action: string;
}

export type DigestStatus = "pending" | "approved" | "dismissed";

export interface MaintenanceDigest {
  tenant: string;
  siteName: string;
  weekOf: string;
  items: MaintenanceDigestItem[];
  status: DigestStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

const SECTIONS = ["hero", "services", "story", "testimonials", "events", "providers", "contact", "faq"];
const WEAK_CATEGORY_SCORE = 70;

function digestKey(tenant: string): string {
  return `maint-digest:${tenant}`;
}
const PENDING_SET = "maint-digest:pending";

/** Build (but don't store) the proposed upkeep for one tenant. */
export async function buildMaintenanceDigest(tenant: string, siteName: string): Promise<MaintenanceDigest> {
  const [timestamps, scan] = await Promise.all([
    getSectionTimestamps(tenant).catch(() => ({})),
    getScanSummary(tenant).catch(() => null),
  ]);

  const items: MaintenanceDigestItem[] = [];

  // Stale content → refresh the oldest couple of sections.
  for (const stale of detectStaleSections(timestamps, SECTIONS).slice(0, 2)) {
    items.push({
      id: `content-${stale.section}`,
      type: "content",
      title: `Refresh the ${stale.section} section`,
      detail: `Last updated ${stale.daysSinceUpdate} days ago — a fresh pass keeps it current for customers and search.`,
      action: `prompt:Suggest one small, useful refresh for my ${stale.section} section and make it after I approve.`,
    });
  }

  // Weak health categories → fix the lowest one or two.
  if (scan) {
    const weak = [...scan.categories]
      .filter((c) => c.score < WEAK_CATEGORY_SCORE)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2);
    for (const c of weak) {
      items.push({
        id: `health-${c.slug}`,
        type: "health",
        title: `Improve ${c.name}`,
        detail: `Scoring ${c.score}/100 — below where it should be. Fixing it lifts your overall site health.`,
        action: `prompt:Fix the biggest ${c.name} issue on my site and show me before it goes live.`,
      });
    }
  }

  return {
    tenant,
    siteName,
    weekOf: new Date().toISOString().split("T")[0],
    items,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export async function saveMaintenanceDigest(digest: MaintenanceDigest): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(digestKey(digest.tenant), JSON.stringify(digest));
  if (digest.status === "pending") {
    await redis.sadd(PENDING_SET, digest.tenant);
  } else {
    await redis.srem(PENDING_SET, digest.tenant);
  }
}

export async function getMaintenanceDigest(tenant: string): Promise<MaintenanceDigest | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(digestKey(tenant));
    if (!raw) return null;
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as MaintenanceDigest;
  } catch {
    return null;
  }
}

/** All tenants with a pending digest, newest first. */
export async function listPendingDigests(): Promise<MaintenanceDigest[]> {
  const redis = getRedis();
  if (!redis) return [];
  const tenants = (await redis.smembers(PENDING_SET).catch(() => [])) as string[];
  const digests = await Promise.all(tenants.map((t) => getMaintenanceDigest(t)));
  return digests
    .filter((d): d is MaintenanceDigest => d !== null && d.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Operator decision on a digest. Approving seeds each item as a proactive
 * suggestion → it surfaces on the owner's dashboard and the AI can act on it.
 */
export async function decideMaintenanceDigest(
  tenant: string,
  decision: "approved" | "dismissed",
  decidedBy: string,
): Promise<MaintenanceDigest | null> {
  const digest = await getMaintenanceDigest(tenant);
  if (!digest || digest.status !== "pending") return null;

  digest.status = decision;
  digest.decidedAt = new Date().toISOString();
  digest.decidedBy = decidedBy;
  await saveMaintenanceDigest(digest);

  if (decision === "approved") {
    await Promise.allSettled(
      digest.items.map((item) =>
        addSuggestion({
          tenantId: tenant,
          type: item.type === "health" ? "stale" : "growth",
          title: item.title,
          description: item.detail,
          action: item.action,
        }),
      ),
    );
  }

  return digest;
}
