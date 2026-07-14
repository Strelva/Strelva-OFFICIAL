/**
 * Newsletter subscriber storage.
 *
 * When DATA_SOURCE=postgres, reads/writes the Postgres `newsletter_subscribers`
 * table; otherwise uses the local dev-file store.
 */

import path from "path";
import { DEFAULT_TENANT, readDevFile, writeDevFile } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase, type Row, type Insert } from "../db/client";

export interface NewsletterSubscriber {
  email: string;
  name?: string;
  subscribedAt: string;
  status: "active" | "unsubscribed";
}

const DEV_NEWSLETTER_PATH = path.join(process.cwd(), "dev-newsletter.json");

async function readDevNewsletter(): Promise<Record<string, NewsletterSubscriber[]>> {
  return readDevFile(DEV_NEWSLETTER_PATH, {});
}

async function writeDevNewsletter(data: Record<string, NewsletterSubscriber[]>): Promise<void> {
  return writeDevFile(DEV_NEWSLETTER_PATH, data);
}

// ---------------------------------------------------------------------------
// Authoritative Postgres helpers.
//
// The store's "active"/"unsubscribed" maps directly to the table's free-form
// `status` text column. There is no id/PK column in the generated type — the
// row is keyed by (tenant_id, email), so writes upsert on that pair.
// ---------------------------------------------------------------------------

function newsletterDb(operation: string): NonNullable<ReturnType<typeof getSupabase>> {
  const db = getSupabase();
  if (!db) throw new Error(`[newsletter] ${operation} failed: Supabase is not configured`);
  return db;
}

function subscriberToInsert(
  s: NewsletterSubscriber,
  tenant: string
): Insert<"newsletter_subscribers"> {
  return {
    tenant_id: tenant,
    email: s.email,
    name: s.name ?? null,
    subscribed_at: s.subscribedAt,
    status: s.status,
  };
}

function mapPgSubscriberRow(row: Row<"newsletter_subscribers">): NewsletterSubscriber {
  return {
    email: row.email,
    name: row.name ?? undefined,
    subscribedAt: row.subscribed_at,
    status: (row.status as NewsletterSubscriber["status"]) ?? "active",
  };
}

/** Look up a single subscriber by tenant+email. */
async function pgGetSubscriber(
  tenant: string,
  email: string
): Promise<NewsletterSubscriber | null> {
  const db = newsletterDb(`read ${tenant}/${email}`);
  const { data, error } = await db
    .from("newsletter_subscribers")
    .select("email, name, subscribed_at, status")
    .eq("tenant_id", tenant)
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPgSubscriberRow(data as Row<"newsletter_subscribers">) : null;
}

/** Upsert a subscriber on (tenant_id, email). */
async function pgUpsertSubscriber(
  s: NewsletterSubscriber,
  tenant: string
): Promise<void> {
  const db = newsletterDb(`upsert ${tenant}/${s.email}`);
  const { error } = await db
    .from("newsletter_subscribers")
    .upsert(subscriberToInsert(s, tenant), { onConflict: "tenant_id,email" });
  if (error) throw error;
}

/** List active subscribers for a tenant, newest first. */
async function pgListSubscribers(tenant: string): Promise<NewsletterSubscriber[]> {
  const db = newsletterDb(`list ${tenant}`);
  const { data, error } = await db
    .from("newsletter_subscribers")
    .select("email, name, subscribed_at, status")
    .eq("tenant_id", tenant)
    .eq("status", "active")
    .order("subscribed_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row<"newsletter_subscribers">[]).map(mapPgSubscriberRow);
}

export async function addSubscriber(
  email: string,
  name?: string,
  tenant: string = DEFAULT_TENANT
): Promise<{ duplicate: boolean }> {
  if (dataSourceIsPostgres()) {
    const existing = await pgGetSubscriber(tenant, email);
    const subscriber: NewsletterSubscriber = existing
      ? { ...existing, name: name ?? existing.name, status: "active" }
      : {
          email,
          name: name || undefined,
          subscribedAt: new Date().toISOString(),
          status: "active",
        };
    await pgUpsertSubscriber(subscriber, tenant);

    return { duplicate: Boolean(existing) };
  }

  const store = await readDevNewsletter();
  const subscribers = store[tenant] || [];
  const existing = subscribers.find((s) => s.email === email);
  if (existing) {
    existing.status = "active";
    store[tenant] = subscribers;
    await writeDevNewsletter(store);
    return { duplicate: true };
  }
  subscribers.push({
    email,
    name: name || undefined,
    subscribedAt: new Date().toISOString(),
    status: "active",
  });
  store[tenant] = subscribers;
  await writeDevNewsletter(store);
  return { duplicate: false };
}

export async function getSubscribers(
  tenant: string = DEFAULT_TENANT
): Promise<NewsletterSubscriber[]> {
  if (dataSourceIsPostgres()) {
    const rows = await pgListSubscribers(tenant);
    return rows;
  }

  const store = await readDevNewsletter();
  return (store[tenant] || []).filter((s) => s.status === "active");
}
