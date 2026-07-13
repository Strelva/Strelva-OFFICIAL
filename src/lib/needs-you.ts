import { getEvents, getQueueCount } from "./events";
import { getSectionTimestamps } from "./storage";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { detectStaleSections } from "./reports";
import type { ContentSection, UnifiedEvent } from "./types";

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
    getTemplateManifestForTenant(tenant).catch(() => null),
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

  return { pending, resolved, pendingCount, staleSectionCount };
}
