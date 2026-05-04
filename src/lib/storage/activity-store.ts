/**
 * Activity logging - audit trail of all content changes.
 */

import { getSanityClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { addInboxItem } from "./inbox-store";
import { emitEventFromActivity } from "../events";

export interface ActivityEntry {
  text: string;
  time: string;
  type: string;
  section?: string;
  actor?: "user" | "ai";
  changes?: { field: string; before: string; after: string }[];
  eventStatus?: "pending" | "approved" | "dismissed" | "auto_approved";
  governanceReason?: string;
  riskLevel?: string;
  /**
   * Full previous content blob captured at the time of the save.
   * Used by Phase 14 version history to restore earlier versions.
   * Stored as a JSON string in Sanity to avoid schema constraints.
   */
  snapshot?: unknown;
}

export async function logActivity(
  entry: ActivityEntry,
  tenant: string = DEFAULT_TENANT
): Promise<void> {
  if (hasSanity) {
    await getSanityClient().create({
      _type: "activityLog",
      tenant,
      text: entry.text,
      activityType: entry.type,
      time: entry.time,
      section: entry.section,
      actor: entry.actor,
      changes: entry.changes,
      snapshot:
        entry.snapshot === undefined ? undefined : JSON.stringify(entry.snapshot),
    });
  } else {
    const store = await readDevContent(tenant);
    const activity = (store.__activity as unknown[]) ?? [];
    activity.unshift(entry);
    store.__activity = activity.slice(0, 200);
    await writeDevContent(store, tenant);
  }

  // Auto-create inbox item for AI actions and notable events
  if (entry.actor === "ai" || entry.type === "ai" || entry.type === "review-reply" || entry.type === "newsletter") {
    const inboxType =
      entry.type === "review-reply" ? "review-alert" as const :
      entry.type === "newsletter" ? "system" as const :
      "ai-action" as const;
    try {
      await addInboxItem({
        type: inboxType,
        title: entry.text,
        section: entry.section,
        detail: entry.changes?.slice(0, 2).map((c) => `${c.field}: ${c.after}`).join(", "),
      }, tenant);
    } catch {
      // Inbox write failure should never block activity logging
    }
  }

  // Emit UnifiedEvent for AI content changes
  if (entry.actor === "ai" || entry.type === "ai") {
    try {
      await emitEventFromActivity(entry, tenant);
    } catch {
      // Event emission failure should never block activity logging
    }
  }
}

export async function getActivity(
  tenant: string = DEFAULT_TENANT,
  filters?: { section?: string; actor?: string }
): Promise<ActivityEntry[]> {
  if (hasSanity) {
    let query = `*[_type == "activityLog" && tenant == $tenant`;
    const params: Record<string, string> = { tenant };
    if (filters?.section) {
      query += ` && section == $section`;
      params.section = filters.section;
    }
    if (filters?.actor) {
      query += ` && actor == $actor`;
      params.actor = filters.actor;
    }
    query += `] | order(time desc)[0...50]{ text, "type": activityType, time, section, actor, changes, snapshot }`;
    const raw = await getSanityClient().fetch<Array<ActivityEntry & { snapshot?: string | unknown }>>(query, params);
    return raw.map((entry) => {
      if (typeof entry.snapshot === "string") {
        try {
          return { ...entry, snapshot: JSON.parse(entry.snapshot) };
        } catch {
          return { ...entry, snapshot: undefined };
        }
      }
      return entry;
    });
  }

  const store = await readDevContent(tenant);
  let activity = (store.__activity as ActivityEntry[]) ?? [];
  if (filters?.section) {
    activity = activity.filter((a) => a.section === filters.section);
  }
  if (filters?.actor) {
    activity = activity.filter((a) => a.actor === filters.actor);
  }
  return activity.slice(0, 50);
}
