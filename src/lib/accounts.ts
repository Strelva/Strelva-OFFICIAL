/**
 * Operator ACCOUNT layer — groups multiple sites (tenants) under one customer /
 * payer so a multi-site owner (e.g. Andy Anderson: CoCard + Vermont Unlimited)
 * has one billing relationship + one place the operator manages the bundle.
 *
 * Redis-backed (Upstash), one JSON blob per account at `account:{id}`, matching
 * the operator CRM / leads / pay-links stores. This is the OPERATOR-facing layer
 * and needs NO DB migration, so it ships without waiting on the Postgres org
 * schema (`accounts`/`subscriptions` tables, migration
 * 20260729180000_org_layer_phase0_accounts.sql). When that schema is applied it
 * becomes the authoritative store for client-facing billing/auth and this layer
 * migrates onto it; today it is the operator source of truth for the account
 * grouping + the bundled-subscription snapshot shown in /admin.
 *
 * Everything degrades to empty/default when Redis is unconfigured (dev): reads
 * return an empty list / null, writes become a no-op that still returns the
 * computed record. Read-modify-write runs under a short per-account lock so a
 * webhook sync racing an operator edit can't last-write-wins one away.
 *
 * Design: vault 1-projects/scaffold-web/org-layer-architecture.md.
 */
import { getRedis } from "@/lib/redis";

export type AccountStatus = "active" | "paused" | "churned";

/** A line item on the account's bundled subscription, mapped to one site. */
export interface AccountSubscriptionItem {
  tenantId: string;
  label: string;
  amountCents: number;
  stripePriceId?: string;
  stripeItemId?: string;
}

/** Snapshot of the account's Stripe subscription (mirror; Stripe stays source of truth). */
export interface AccountSubscription {
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  status?: string; // active / trialing / past_due / canceled (mirrors Stripe)
  items: AccountSubscriptionItem[];
  amountCents?: number; // total across items
  currency?: string;
  currentPeriodEnd?: string;
}

export interface Account {
  id: string;
  name: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  phone?: string;
  /** Site (tenant) ids this account owns. */
  tenantIds: string[];
  stripeCustomerId?: string;
  subscription?: AccountSubscription;
  notes?: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

const INDEX_KEY = "accounts:index"; // Redis set of account ids
const MAX_NAME_LEN = 120;
const MAX_FIELD_LEN = 160;
const MAX_TENANTS = 100;
const MAX_NOTE_LEN = 4000;
const STATUSES: AccountStatus[] = ["active", "paused", "churned"];

function key(id: string): string {
  return `account:${id}`;
}
function tenantLinkKey(tenantId: string): string {
  return `account-of:${tenantId}`; // reverse lookup: tenant -> account id
}

function clean(v: unknown, max = MAX_FIELD_LEN): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

/** kebab-case slug from a name, with a short random suffix for uniqueness. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "account";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

function normalize(raw: unknown): Account | null {
  if (!raw) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = obj as Partial<Account>;
  if (typeof r.id !== "string" || !r.id) return null;
  const sub = r.subscription;
  return {
    id: r.id,
    name: typeof r.name === "string" ? r.name : r.id,
    primaryContactName: clean(r.primaryContactName),
    primaryContactEmail: clean(r.primaryContactEmail),
    phone: clean(r.phone),
    tenantIds: Array.isArray(r.tenantIds)
      ? Array.from(new Set(r.tenantIds.filter((t): t is string => typeof t === "string"))).slice(0, MAX_TENANTS)
      : [],
    stripeCustomerId: clean(r.stripeCustomerId),
    subscription:
      sub && typeof sub === "object"
        ? {
            stripeSubscriptionId: clean(sub.stripeSubscriptionId),
            stripeCustomerId: clean(sub.stripeCustomerId),
            status: clean(sub.status),
            items: Array.isArray(sub.items)
              ? sub.items
                  .filter((i): i is AccountSubscriptionItem => !!i && typeof i.tenantId === "string")
                  .map((i) => ({
                    tenantId: i.tenantId,
                    label: typeof i.label === "string" ? i.label : i.tenantId,
                    amountCents: Number.isFinite(i.amountCents) ? i.amountCents : 0,
                    stripePriceId: clean(i.stripePriceId),
                    stripeItemId: clean(i.stripeItemId),
                  }))
              : [],
            amountCents: Number.isFinite(sub.amountCents) ? sub.amountCents : undefined,
            currency: clean(sub.currency),
            currentPeriodEnd: clean(sub.currentPeriodEnd),
          }
        : undefined,
    notes: clean(r.notes, MAX_NOTE_LEN),
    status: STATUSES.includes(r.status as AccountStatus) ? (r.status as AccountStatus) : "active",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

export async function getAccount(id: string): Promise<Account | null> {
  const redis = getRedis();
  if (!redis) return null;
  return normalize(await redis.get(key(id)));
}

export async function getAllAccounts(): Promise<Account[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = (await redis.smembers(INDEX_KEY).catch(() => [])) as string[];
  if (!ids || ids.length === 0) return [];
  const raws = await redis.mget<unknown[]>(...ids.map(key));
  const accounts = ids
    .map((_, i) => normalize(raws?.[i]))
    .filter((a): a is Account => a !== null);
  // newest first
  return accounts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Which account owns this site, if any. */
export async function getAccountForTenant(tenantId: string): Promise<Account | null> {
  const redis = getRedis();
  if (!redis) return null;
  const accountId = (await redis.get(tenantLinkKey(tenantId))) as string | null;
  if (!accountId) return null;
  return getAccount(accountId);
}

async function persist(account: Account): Promise<Account> {
  const redis = getRedis();
  if (redis) {
    await redis.set(key(account.id), account);
    await redis.sadd(INDEX_KEY, account.id);
  }
  return account;
}

const LOCK_TTL_SECONDS = 5;
const LOCK_MAX_ATTEMPTS = 5;
const LOCK_RETRY_MS = 40;

/** Read-modify-write under a short per-account lock (mirrors the CRM idiom). */
async function withAccountLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return fn();
  const lockKey = `reb:account-lock:${id}`;
  let acquired = false;
  for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt++) {
    const got: unknown = await redis
      .set(lockKey, "1", { nx: true, ex: LOCK_TTL_SECONDS })
      .catch(() => null);
    if (got !== null && got !== undefined && got !== false) {
      acquired = true;
      break;
    }
    await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
  }
  // If the lock could not be acquired after all attempts, reject the operation
  // rather than proceeding unlocked (silent last-write-wins on concurrent webhook
  // hits). Throwing here lets Stripe retry the webhook when Redis is momentarily
  // contended, rather than silently overwriting a concurrent update.
  if (!acquired) {
    throw new Error(`[accounts] Could not acquire lock for account ${id} after ${LOCK_MAX_ATTEMPTS} attempts`);
  }
  try {
    return await fn();
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

export async function createAccount(input: {
  name: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  phone?: string;
  tenantIds?: string[];
  notes?: string;
}): Promise<Account> {
  const now = new Date().toISOString();
  const account: Account = {
    id: slugify(input.name || "account"),
    name: clean(input.name, MAX_NAME_LEN) ?? "Untitled account",
    primaryContactName: clean(input.primaryContactName),
    primaryContactEmail: clean(input.primaryContactEmail),
    phone: clean(input.phone),
    tenantIds: [],
    notes: clean(input.notes, MAX_NOTE_LEN),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await persist(account);
  for (const tenantId of input.tenantIds ?? []) {
    await linkTenantToAccount(account.id, tenantId);
  }
  return (await getAccount(account.id)) ?? account;
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<Account, "name" | "primaryContactName" | "primaryContactEmail" | "phone" | "notes" | "status" | "stripeCustomerId">>,
): Promise<Account | null> {
  return withAccountLock(id, async () => {
    const current = await getAccount(id);
    if (!current) return null;
    return persist({
      ...current,
      ...(patch.name !== undefined ? { name: clean(patch.name, MAX_NAME_LEN) ?? current.name } : {}),
      ...(patch.primaryContactName !== undefined ? { primaryContactName: clean(patch.primaryContactName) } : {}),
      ...(patch.primaryContactEmail !== undefined ? { primaryContactEmail: clean(patch.primaryContactEmail) } : {}),
      ...(patch.phone !== undefined ? { phone: clean(patch.phone) } : {}),
      ...(patch.notes !== undefined ? { notes: clean(patch.notes, MAX_NOTE_LEN) } : {}),
      ...(patch.status !== undefined && STATUSES.includes(patch.status) ? { status: patch.status } : {}),
      ...(patch.stripeCustomerId !== undefined ? { stripeCustomerId: clean(patch.stripeCustomerId) } : {}),
      updatedAt: new Date().toISOString(),
    });
  });
}

/** Attach a site to an account (idempotent). A site belongs to at most one
 *  account — the reverse link is repointed if it was on another account. */
export async function linkTenantToAccount(accountId: string, tenantId: string): Promise<Account | null> {
  const clean_tid = clean(tenantId);
  if (!clean_tid) return getAccount(accountId);
  return withAccountLock(accountId, async () => {
    const account = await getAccount(accountId);
    if (!account) return null;
    const redis = getRedis();
    // repoint: drop the site from any previous account
    if (redis) {
      const prev = (await redis.get(tenantLinkKey(clean_tid))) as string | null;
      if (prev && prev !== accountId) {
        const prevAcct = await getAccount(prev);
        if (prevAcct) {
          await persist({
            ...prevAcct,
            tenantIds: prevAcct.tenantIds.filter((t) => t !== clean_tid),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      await redis.set(tenantLinkKey(clean_tid), accountId);
    }
    if (account.tenantIds.includes(clean_tid)) return account;
    return persist({
      ...account,
      tenantIds: [...account.tenantIds, clean_tid].slice(0, MAX_TENANTS),
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function unlinkTenant(accountId: string, tenantId: string): Promise<Account | null> {
  return withAccountLock(accountId, async () => {
    const account = await getAccount(accountId);
    if (!account) return null;
    const redis = getRedis();
    if (redis) {
      const cur = (await redis.get(tenantLinkKey(tenantId))) as string | null;
      if (cur === accountId) await redis.del(tenantLinkKey(tenantId));
    }
    return persist({
      ...account,
      tenantIds: account.tenantIds.filter((t) => t !== tenantId),
      updatedAt: new Date().toISOString(),
    });
  });
}

/** Overwrite the account's bundled-subscription snapshot (called by the billing
 *  webhook sync + by operator setup). Total is recomputed from the items. */
export async function setAccountSubscription(
  accountId: string,
  sub: AccountSubscription,
): Promise<Account | null> {
  return withAccountLock(accountId, async () => {
    const account = await getAccount(accountId);
    if (!account) return null;
    const items = sub.items ?? [];
    const amountCents = items.reduce((sum, i) => sum + (Number.isFinite(i.amountCents) ? i.amountCents : 0), 0);
    return persist({
      ...account,
      stripeCustomerId: clean(sub.stripeCustomerId) ?? account.stripeCustomerId,
      subscription: { ...sub, items, amountCents },
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function deleteAccount(id: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const account = await getAccount(id);
  if (account) {
    for (const tenantId of account.tenantIds) {
      const cur = (await redis.get(tenantLinkKey(tenantId))) as string | null;
      if (cur === id) await redis.del(tenantLinkKey(tenantId));
    }
  }
  await redis.del(key(id));
  await redis.srem(INDEX_KEY, id);
  return true;
}

/** Monthly recurring total across all active accounts, in cents. */
export function accountMrrCents(account: Account): number {
  if (account.subscription?.status && account.subscription.status !== "active" && account.subscription.status !== "trialing") {
    return 0;
  }
  return account.subscription?.amountCents ?? 0;
}
