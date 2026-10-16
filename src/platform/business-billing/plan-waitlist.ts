import { getRedis } from "@/platform/infra/redis";
import {
  businessAiCapUsd,
  type BusinessAiBudget,
} from "@/platform/infra/business-ai-budget";
import { selfServeBillingConfig } from "./workspace-checkout";

/**
 * The plans list for a business that has no plan yet (October 16
 * money decision: no price anywhere, no Stripe switch-on). It follows the
 * strelva.com waitlist's Redis shape (`waitlist:{email}` + `waitlist:all` on
 * feat/waitlist-intake), keyed by business so an owner's choice never touches
 * a marketing entry:
 * `waitlist:plans:{workspaceId}` holds the entry and `waitlist:plans` is a
 * zset by first join time. Nothing here emails anyone; the team writes when
 * plans open.
 */
export interface PlanWaitlistEntry {
  workspaceId: string;
  businessName: string | null;
  email: string;
  joinedAt: string;
  updatedAt: string;
}

type Env = Record<string, string | undefined>;
type Store = NonNullable<ReturnType<typeof getRedis>>;
const key = (workspaceId: string) => `waitlist:plans:${workspaceId}`;
const INDEX = "waitlist:plans";

/** Plans are open only when self-serve checkout is configured and switched on. */
export function plansOpen(environment: Env = process.env): boolean {
  return selfServeBillingConfig(environment).enabled;
}

/**
 * True when this business has no plan and no included Strelva work, so every
 * owner ask would pause: the "$0 cap" moment that becomes the waitlist path.
 */
export function waitsForPlans(
  budget: Pick<BusinessAiBudget, "capCents" | "subscribed"> | null,
  environment: Env = process.env,
): boolean {
  if (!budget || budget.subscribed) return false;
  if (environment.STRELVA_BUSINESS_AI_BUDGET !== "1") return false;
  if (plansOpen(environment)) return false;
  try {
    return businessAiCapUsd(budget, environment) === 0;
  } catch {
    return false;
  }
}

function parse(value: unknown): PlanWaitlistEntry | null {
  if (!value) return null;
  try {
    const entry = (
      typeof value === "string" ? JSON.parse(value) : value
    ) as PlanWaitlistEntry;
    return typeof entry?.email === "string" ? entry : null;
  } catch {
    return null;
  }
}

/** The business's entry, or null. Unreadable storage reads as not joined. */
export async function readPlanWaitlist(
  workspaceId: string,
  store: Store | null = getRedis(),
): Promise<PlanWaitlistEntry | null> {
  if (!store) return null;
  try {
    return parse(await store.get(key(workspaceId)));
  } catch {
    return null;
  }
}

/** Returns null when Redis is not configured, so the caller can say so. */
export async function joinPlanWaitlist(
  input: { workspaceId: string; businessName: string | null; email: string },
  now = new Date(),
  store: Store | null = getRedis(),
): Promise<{ entry: PlanWaitlistEntry; repeat: boolean } | null> {
  if (!store) return null;
  const prior = parse(await store.get(key(input.workspaceId)));
  const stamp = now.toISOString();
  const entry: PlanWaitlistEntry = {
    ...input,
    joinedAt: prior?.joinedAt ?? stamp,
    updatedAt: stamp,
  };
  await store.set(key(input.workspaceId), JSON.stringify(entry));
  if (!prior)
    await store.zadd(INDEX, {
      score: now.getTime(),
      member: key(input.workspaceId),
    });
  return { entry, repeat: Boolean(prior) };
}

/** Takes the business off the list. Returns false when storage is missing. */
export async function leavePlanWaitlist(
  workspaceId: string,
  store: Store | null = getRedis(),
): Promise<boolean> {
  if (!store) return false;
  await store.del(key(workspaceId));
  await store.zrem(INDEX, key(workspaceId));
  return true;
}
