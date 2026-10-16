/**
 * Undo after "Make it live" on the website dashboard's Needs you (October 16).
 *
 * Approving a section change publishes it through publishTenantSections with
 * the event id as the content version's requestId. Undo puts the section back
 * to the version just before that one, through the same publish service (so
 * versions, activity, audit and client-site revalidation run as for any
 * change). The approval itself stays on the record; the site goes back.
 *
 * Refuses, and changes nothing, when: the event is not an approved section
 * change of this tenant, the Undo window has passed, or anything else touched
 * the section after it went live (Undo would erase that newer change too).
 */
import { getEventRaw } from "@/lib/events";
import { getContent, getVersions } from "@/lib/storage";
import { publishTenantSections } from "@/lib/publish-tenant-sections";
import type { ContentMap, ContentSection } from "@/lib/types";

/** Generous next to the 5 s client window, so a slow network still lands. */
export const QUEUE_UNDO_GRACE_MS = 2 * 60_000;

export type QueueUndoResult =
  | { undone: true; section: ContentSection }
  | { undone: false; reason: "not_found" | "not_undoable" | "expired" | "superseded" | "no_prior" };

export async function undoApprovedSectionEvent(input: { tenantId: string; eventId: string; author: "user" | "admin"; now?: number }): Promise<QueueUndoResult> {
  const event = await getEventRaw(input.eventId);
  if (!event || event.tenantId !== input.tenantId) return { undone: false, reason: "not_found" };
  const section = typeof event.metadata?.section === "string" ? event.metadata.section as ContentSection : null;
  if (event.status !== "approved" || !section) return { undone: false, reason: "not_undoable" };
  const resolvedAt = event.resolvedAt ? Date.parse(event.resolvedAt) : NaN;
  if (!Number.isFinite(resolvedAt) || (input.now ?? Date.now()) - resolvedAt > QUEUE_UNDO_GRACE_MS) return { undone: false, reason: "expired" };

  const versions = await getVersions(section, input.tenantId);
  if (versions[0]?.requestId !== input.eventId) return { undone: false, reason: "superseded" };
  const prior = versions[1];
  if (!prior) return { undone: false, reason: "no_prior" };

  const current = (await getContent(section, input.tenantId)) as unknown as Record<string, unknown>;
  await publishTenantSections({
    tenantId: input.tenantId,
    writes: [{ section, data: prior.data as ContentMap[ContentSection], prior: current }],
    author: input.author,
    requestId: `undo:${input.eventId}`,
    versions: "strict",
    activity: { mode: "best_effort", text: () => "Undid a change you had just made live" },
    clearDrafts: "none",
  });
  return { undone: true, section };
}

/** What the owner reads when Undo could not run. Each says nothing changed. */
export function queueUndoRefusal(reason: Exclude<QueueUndoResult, { undone: true }>["reason"]): { status: number; error: string } {
  if (reason === "not_found") return { status: 404, error: "That change could not be found. Nothing changed." };
  if (reason === "expired") return { status: 409, error: "The time to undo this has passed. Go back to a saved version from What changed. Nothing changed." };
  if (reason === "superseded") return { status: 409, error: "Something else changed that part of your site since, so Undo would erase it too. Nothing changed." };
  if (reason === "no_prior") return { status: 409, error: "There is no earlier version of that part of your site to go back to. Nothing changed." };
  return { status: 409, error: "This one can't be undone here. Nothing changed." };
}
