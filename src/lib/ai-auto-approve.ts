/**
 * Auto-approval for trusted tenants.
 *
 * Tracks consecutive approvals per tenant in Redis. When a tenant reaches
 * their autoApproveThreshold, low-risk AI changes (factual-only updates to
 * contact, settings, events, providers) bypass the review queue and publish
 * directly.
 *
 * A single rejection resets the counter to zero.
 */

import { getRedis } from "./redis";
import type { TenantConfig, ContentSection } from "./types";
import type { AiGovernanceDecision } from "./ai-governance";
import { logger } from "./logger";

const APPROVAL_COUNT_PREFIX = "reb:auto-approve:streak:";

// Sections and governance reasons considered "low-risk" for auto-approval
const LOW_RISK_SECTIONS = new Set<ContentSection>([
  "contact",
  "settings",
  "events",
  "providers",
]);

/**
 * Check if a governance "review" decision should be upgraded to "publish"
 * because the tenant has earned trusted status.
 */
export async function maybeAutoApprove(
  tenantConfig: TenantConfig | undefined,
  section: ContentSection,
  governance: AiGovernanceDecision
): Promise<AiGovernanceDecision> {
  // Only upgrade "review" decisions; "block" stays blocked, "publish" is already good
  if (governance.action !== "review") return governance;

  const threshold = tenantConfig?.autoApproveThreshold;
  if (!threshold || threshold <= 0) return governance;

  // Only auto-approve low-risk sections
  if (!LOW_RISK_SECTIONS.has(section)) return governance;

  const streak = await getApprovalStreak(tenantConfig.id);
  if (streak < threshold) return governance;

  logger.info("[auto-approve] Promoting review to publish for trusted tenant", {
    tenantId: tenantConfig.id,
    section,
    streak,
    threshold,
  });

  return {
    action: "publish",
    reason: `Auto-approved: tenant has ${streak} consecutive approvals (threshold: ${threshold}). Original: ${governance.reason}`,
  };
}

/**
 * Record an approval. Increments the consecutive streak.
 */
export async function recordApproval(tenantId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  try {
    const key = `${APPROVAL_COUNT_PREFIX}${tenantId}`;
    const newCount = await redis.incr(key);
    await redis.expire(key, 90 * 24 * 60 * 60); // 90-day TTL, refreshed on each approval
    return newCount;
  } catch {
    return 0;
  }
}

/**
 * Record a rejection. Resets the consecutive streak to zero.
 */
export async function recordRejection(tenantId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(`${APPROVAL_COUNT_PREFIX}${tenantId}`, 0);
  } catch {
    // Non-fatal
  }
}

/**
 * Get the current consecutive approval streak for a tenant.
 */
export async function getApprovalStreak(tenantId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  try {
    const count = await redis.get<number>(`${APPROVAL_COUNT_PREFIX}${tenantId}`);
    return count ?? 0;
  } catch {
    return 0;
  }
}
