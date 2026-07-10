/**
 * Inbox storage - notifications and action items for dashboard.
 *
 * When DATA_SOURCE=postgres, reads/writes the Postgres `inbox_items` table;
 * otherwise uses the local dev-file store.
 */

import { DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { dataSourceIsPostgres } from "../db/source-flags";
import { getSupabase, type Row, type Insert } from "../db/client";

export interface InboxItem {
  id: string;
  type: "ai-action" | "suggestion" | "review-alert" | "booking" | "subscriber" | "system";
  title: string;
  detail?: string;
  timestamp: string;
  read: boolean;
  section?: string;
  actions?: { label: string; href?: string; chatPrompt?: string }[];
}

// ---------------------------------------------------------------------------
// Postgres repo helpers (self-contained; never throw). Map camelCase store
// fields to the snake_case `inbox_items` columns exactly per database.types.ts.
// ---------------------------------------------------------------------------

function inboxToInsert(item: InboxItem, tenant: string): Insert<"inbox_items"> {
  return {
    id: item.id,
    tenant_id: tenant,
    type: item.type,
    title: item.title,
    detail: item.detail ?? null,
    time: item.timestamp,
    read: item.read,
    section: item.section ?? null,
    actions: (item.actions ?? null) as Insert<"inbox_items">["actions"],
  };
}

function mapPgInboxRow(row: Row<"inbox_items">): InboxItem {
  return {
    id: row.id,
    type: row.type as InboxItem["type"],
    title: row.title,
    detail: row.detail ?? undefined,
    timestamp: row.time,
    read: row.read,
    section: row.section ?? undefined,
    actions: (row.actions as InboxItem["actions"]) ?? undefined,
  };
}

async function insertInboxItem(item: InboxItem, tenant: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  try {
    await db.from("inbox_items").insert(inboxToInsert(item, tenant));
  } catch {
    // Postgres write failure must not break the store.
  }
}

async function listInboxItems(
  tenant: string,
  filters?: { type?: string; unreadOnly?: boolean }
): Promise<InboxItem[]> {
  const db = getSupabase();
  if (!db) return [];
  try {
    let query = db
      .from("inbox_items")
      .select("*")
      .eq("tenant_id", tenant)
      .order("time", { ascending: false })
      .limit(50);
    if (filters?.type) query = query.eq("type", filters.type);
    if (filters?.unreadOnly) query = query.eq("read", false);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(mapPgInboxRow);
  } catch {
    return [];
  }
}

async function markInboxItemRead(itemId: string, tenant: string): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  try {
    const { data, error } = await db
      .from("inbox_items")
      .update({ read: true })
      .eq("tenant_id", tenant)
      .eq("id", itemId)
      .select("id");
    if (error) return false;
    return Boolean(data && data.length > 0);
  } catch {
    return false;
  }
}

async function markAllInboxItemsRead(tenant: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  try {
    await db
      .from("inbox_items")
      .update({ read: true })
      .eq("tenant_id", tenant)
      .eq("read", false);
  } catch {
    // best effort
  }
}

export async function addInboxItem(
  item: Omit<InboxItem, "id" | "timestamp" | "read">,
  tenant: string = DEFAULT_TENANT
): Promise<InboxItem> {
  const full: InboxItem = {
    ...item,
    id: `inbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };

  if (dataSourceIsPostgres()) {
    await insertInboxItem(full, tenant);
  }

  if (!dataSourceIsPostgres()) {
    const store = await readDevContent(tenant);
    const items = (store.__inbox as InboxItem[]) ?? [];
    items.unshift(full);
    store.__inbox = items.slice(0, 200);
    await writeDevContent(store, tenant);
  }
  return full;
}

export async function getInboxItems(
  tenant: string = DEFAULT_TENANT,
  filters?: { type?: string; unreadOnly?: boolean }
): Promise<InboxItem[]> {
  if (dataSourceIsPostgres()) {
    const rows = await listInboxItems(tenant, filters);
    return rows;
  }

  const store = await readDevContent(tenant);
  let items = (store.__inbox as InboxItem[]) ?? [];
  if (filters?.type) {
    items = items.filter((i) => i.type === filters.type);
  }
  if (filters?.unreadOnly) {
    items = items.filter((i) => !i.read);
  }
  return items.slice(0, 50);
}

export async function markInboxRead(
  itemId: string,
  tenant: string = DEFAULT_TENANT
): Promise<boolean> {
  let pgUpdated = false;
  if (dataSourceIsPostgres()) {
    pgUpdated = await markInboxItemRead(itemId, tenant);
  }

  if (dataSourceIsPostgres()) {
    return pgUpdated;
  }

  const store = await readDevContent(tenant);
  const items = (store.__inbox as InboxItem[]) ?? [];
  const item = items.find((i) => i.id === itemId);
  if (!item) return false;
  item.read = true;
  store.__inbox = items;
  await writeDevContent(store, tenant);
  return true;
}

export async function markAllInboxRead(
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (dataSourceIsPostgres()) {
    await markAllInboxItemsRead(tenant);
  }

  if (!dataSourceIsPostgres()) {
    const store = await readDevContent(tenant);
    const items = (store.__inbox as InboxItem[]) ?? [];
    for (const item of items) item.read = true;
    store.__inbox = items;
    await writeDevContent(store, tenant);
  }
}
