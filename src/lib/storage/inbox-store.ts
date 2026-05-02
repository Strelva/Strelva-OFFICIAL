/**
 * Inbox storage - notifications and action items for dashboard.
 */

import { getSanityClient, getSanityReadClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";

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

  if (hasSanity) {
    await getSanityClient().create({
      _type: "inboxItem",
      tenant,
      itemId: full.id,
      itemType: full.type,
      title: full.title,
      detail: full.detail,
      time: full.timestamp,
      read: false,
      section: full.section,
      actions: full.actions,
    });
    return full;
  }

  const store = await readDevContent(tenant);
  const items = (store.__inbox as InboxItem[]) ?? [];
  items.unshift(full);
  store.__inbox = items.slice(0, 200);
  await writeDevContent(store, tenant);
  return full;
}

export async function getInboxItems(
  tenant: string = DEFAULT_TENANT,
  filters?: { type?: string; unreadOnly?: boolean }
): Promise<InboxItem[]> {
  if (hasSanity) {
    let query = `*[_type == "inboxItem" && tenant == $tenant`;
    const params: Record<string, string | boolean> = { tenant };
    if (filters?.type) {
      query += ` && itemType == $itemType`;
      params.itemType = filters.type;
    }
    if (filters?.unreadOnly) {
      query += ` && read == false`;
    }
    query += `] | order(time desc)[0...50]{
      "id": itemId, "type": itemType, title, detail, "timestamp": time, read, section, actions
    }`;
    return getSanityReadClient().fetch(query, params);
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
  if (hasSanity) {
    const docId = await getSanityClient().fetch(
      `*[_type == "inboxItem" && tenant == $tenant && itemId == $itemId][0]._id`,
      { tenant, itemId }
    );
    if (!docId) return false;
    await getSanityClient().patch(docId).set({ read: true }).commit();
    return true;
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
  if (hasSanity) {
    const docs = await getSanityClient().fetch<Array<{ _id: string }>>(
      `*[_type == "inboxItem" && tenant == $tenant && read == false]{_id}`,
      { tenant }
    );
    const tx = getSanityClient().transaction();
    for (const doc of docs) {
      tx.patch(doc._id, (p) => p.set({ read: true }));
    }
    await tx.commit();
    return;
  }

  const store = await readDevContent(tenant);
  const items = (store.__inbox as InboxItem[]) ?? [];
  for (const item of items) item.read = true;
  store.__inbox = items;
  await writeDevContent(store, tenant);
}
