/**
 * Activity logging - audit trail of all content changes.
 */

import { getSanityClient } from "../sanity";
import { hasSanity, DEFAULT_TENANT, readDevContent, writeDevContent } from "./core";
import { addInboxItem } from "./inbox-store";
import { emitEventFromActivity } from "../events";
import { dataSourceIsPostgres } from "../db/source-flags";
import { insertActivity, listActivity } from "../db/repositories";
import type { Row, Insert } from "../db/client";

function activityToInsert(entry: ActivityEntry, tenant: string): Insert<"activity_log"> {
  return {
    tenant_id: tenant,
    text: entry.text,
    time: entry.time,
    type: entry.type,
    section: entry.section ?? null,
    actor: entry.actor ?? null,
    changes: (entry.changes ?? null) as Insert<"activity_log">["changes"],
    event_status: entry.eventStatus ?? null,
    governance_reason: entry.governanceReason ?? null,
    risk_level: entry.riskLevel ?? null,
    snapshot: (entry.snapshot ?? null) as Insert<"activity_log">["snapshot"],
  };
}

function mapPgActivityRow(row: Row<"activity_log">): ActivityEntry {
  return {
    text: row.text ?? "",
    time: row.time,
    type: row.type ?? "",
    section: row.section ?? undefined,
    actor: (row.actor as ActivityEntry["actor"]) ?? undefined,
    changes: (row.changes as ActivityEntry["changes"]) ?? undefined,
    eventStatus: (row.event_status as ActivityEntry["eventStatus"]) ?? undefined,
    governanceReason: row.governance_reason ?? undefined,
    riskLevel: row.risk_level ?? undefined,
    snapshot: row.snapshot ?? undefined,
  };
}

export interface ActivityEntry {
  text: string;
  time: string;
  type: string;
  section?: string;
  actor?: "user" | "ai" | "admin";
  changes?: { field: string; before: string; after: string }[];
  eventStatus?: "pending" | "approved" | "dismissed" | "auto_approved";
  governanceReason?: string;
  riskLevel?: string;
  suppressEvent?: boolean;
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
  if (dataSourceIsPostgres()) {
    await insertActivity(activityToInsert(entry, tenant));
  }
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
  } else if (!dataSourceIsPostgres()) {
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
  if (!entry.suppressEvent && (entry.actor === "ai" || entry.type === "ai")) {
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
  if (dataSourceIsPostgres()) {
    const rows = await listActivity(tenant, { section: filters?.section, actor: filters?.actor, limit: 50 });
    if (rows.length > 0 || !hasSanity) return rows.map(mapPgActivityRow);
    // fall through to Sanity only if Postgres is empty and Sanity still configured
  }

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
