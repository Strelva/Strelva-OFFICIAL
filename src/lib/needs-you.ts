import { getEvents, getQueueCount } from "./events";
import { getSectionTimestamps } from "./storage";
import { getTemplateForTenant } from "@/components/templates/registry";
import { detectStaleSections } from "./reports";
import { suggestionAudience } from "./suggestions";
import type { ContentSection, UnifiedEvent } from "./types";

/** A client should only ever see owner-facing asks in "Needs you". Operator
 *  suggestion cards (our craft) are filtered out here so pre-existing ones queued
 *  before the audience split disappear too — new ones no longer create an event. */
function isClientVisible(e: UnifiedEvent): boolean {
  return e.type !== "suggestion" || suggestionAudience(e.title) === "owner";
}

export interface NeedsYouData {
  pending: UnifiedEvent[];
  resolved: UnifiedEvent[];
  pendingCount: number;
  staleSectionCount: number;
}

/**
 * The "Needs You" approval-queue snapshot shared by the AI chat header badge and
 * the /review queue page (previously a verbatim copy in both). Every read
 * degrades to a safe default so a transient backend blip can never 500 either
 * surface — the chat especially, which is the product's core screen.
 */
export async function getNeedsYouData(tenant: string): Promise<NeedsYouData> {
  const [siteModel, pending, resolved, pendingCount, timestamps] = await Promise.all([
    getTemplateForTenant(tenant).catch(() => null),
    getEvents(tenant, { status: "pending", limit: 50 }).catch(() => [] as UnifiedEvent[]),
    getEvents(tenant, { limit: 30 })
      .then((events) =>
        events.filter((e) => e.status === "approved" || e.status === "dismissed" || e.status === "auto_approved"),
      )
      .catch(() => [] as UnifiedEvent[]),
    getQueueCount(tenant).catch(() => 0),
    getSectionTimestamps(tenant).catch(() => ({})),
  ]);

  const staleSectionCount = siteModel
    ? detectStaleSections(timestamps, siteModel.contentSections as ContentSection[]).length
    : 0;

  // Drop operator suggestion cards from both lists, and derive the count from the
  // client-visible pending set so the badge and the rendered queue never disagree
  // (a queue of only operator suggestions must read as empty, not "1 to review").
  const visiblePending = pending.filter(isClientVisible);
  const visibleResolved = resolved.filter(isClientVisible);
  const hiddenPending = pending.length - visiblePending.length;

  return {
    pending: visiblePending,
    resolved: visibleResolved,
    pendingCount: Math.max(0, pendingCount - hiddenPending),
    staleSectionCount,
  };
}
