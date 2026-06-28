import { executeAgentPrompt } from "./agent-executor";
import { getEvent, resolveEvent, updateEvent } from "./events";
import { updateSuggestion } from "./suggestions";
import { isCustomChangeRequestMetadata } from "./custom-repos";
import {
  appendVersion,
  clearDraft,
  getContent,
  getDraftContent,
  recordSectionUpdate,
  setContent,
} from "./storage";
import { clientRevalidationTargetForSections } from "./content-revalidation";
import { diffFields } from "./utils";
import { recordApproval, recordRejection } from "./ai-auto-approve";
import type { ContentMap, ContentSection } from "./types";
import type { CustomChangeRequestStatus } from "./types";

export type EventWorkflowAction =
  | "approved"
  | "dismissed"
  | "triaged"
  | "quoted"
  | "accepted"
  | "in_progress"
  | "shipped"
  | "declined";

const CUSTOM_WORKFLOW_ACTIONS = new Set<EventWorkflowAction>([
  "triaged",
  "quoted",
  "accepted",
  "in_progress",
  "shipped",
  "declined",
]);

function workflowStatusFromAction(action: EventWorkflowAction): CustomChangeRequestStatus | null {
  if (action === "approved" || action === "dismissed") return null;
  return action;
}

/** Parse "HH:MM" into the GBP TimeOfDay shape, or null if malformed. */
function parseHHMM(v: unknown): { hours: number; minutes: number } | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export async function resolveEventAction(
  tenantId: string,
  eventId: string,
  action: EventWorkflowAction
): Promise<{ changed: boolean; reason?: string }> {
  const event = await getEvent(eventId);
  if (!event) return { changed: false, reason: "not_found" };
  if (event.tenantId !== tenantId) return { changed: false, reason: "wrong_tenant" };

  if (event.type === "change_request" && CUSTOM_WORKFLOW_ACTIONS.has(action)) {
    if (!isCustomChangeRequestMetadata(event.metadata)) {
      return { changed: false, reason: "not_custom_change_request" };
    }

    const workflowStatus = workflowStatusFromAction(action);
    if (!workflowStatus) return { changed: false, reason: "invalid_action" };

    const terminalStatus = workflowStatus === "shipped"
      ? "approved"
      : workflowStatus === "declined"
        ? "dismissed"
        : event.status;
    const result = await updateEvent(eventId, (existing) => ({
      ...existing,
      status: terminalStatus,
      resolvedAt: terminalStatus === "approved" || terminalStatus === "dismissed"
        ? new Date().toISOString()
        : existing.resolvedAt,
      metadata: {
        ...existing.metadata,
        workflowStatus,
        quoteRequired: workflowStatus === "quoted" ? true : existing.metadata?.quoteRequired,
        shippedAt: workflowStatus === "shipped" ? new Date().toISOString() : existing.metadata?.shippedAt,
        workflowUpdatedAt: new Date().toISOString(),
      },
    }));
    return { changed: result.changed };
  }

  if (action !== "approved" && action !== "dismissed") {
    return { changed: false, reason: "invalid_action" };
  }

  // For approvals that actually do something external (post to Google, send an
  // email, publish content), validate + perform the effect BEFORE flipping the
  // event to resolved. A failed or stale action must leave the item pending —
  // never resolve it and have the UI falsely say "Made live".

  if (event.type === "content_update") {
    const kind = event.metadata?.kind;

    // GBP post draft (B1): on approve, actually post to the Google listing.
    if (kind === "gbp_post_draft") {
      if (action === "approved") {
        const summary = typeof event.metadata?.summary === "string" ? event.metadata.summary : "";
        if (!summary) return { changed: false, reason: "gbp_post_invalid" };
        const { createGbpPost } = await import("./gbp-management");
        const result = await createGbpPost(tenantId, {
          summary,
          ctaUrl: typeof event.metadata?.ctaUrl === "string" ? event.metadata.ctaUrl : undefined,
          photoUrl: typeof event.metadata?.photoUrl === "string" ? event.metadata.photoUrl : undefined,
        });
        if (!result.success) return { changed: false, reason: "gbp_post_failed" };
      }
      const resolved = await resolveEvent(eventId, action, { actor: "user" });
      return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
    }

    // GBP hours draft: on approve, push hours to the Google listing. Governed —
    // routed through this approval queue, NEVER auto-published (the audit core-M3
    // fix: the website-hours edit is reviewed the same way).
    if (kind === "gbp_hours_draft") {
      if (action === "approved") {
        const raw = Array.isArray(event.metadata?.hours) ? event.metadata.hours : [];
        const periods = raw.flatMap((p: unknown) => {
          const row = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
          const day = typeof row.day === "string" ? row.day.toUpperCase() : null;
          const open = parseHHMM(row.open);
          const close = parseHHMM(row.close);
          if (!day || !open || !close) return [];
          return [{ openDay: day, openTime: open, closeDay: day, closeTime: close }];
        });
        if (!periods.length) return { changed: false, reason: "gbp_hours_invalid" };
        const { updateBusinessHours } = await import("./gbp-management");
        const result = await updateBusinessHours(tenantId, {
          regularHours: { periods } as Parameters<typeof updateBusinessHours>[1]["regularHours"],
        });
        if (!result.success) return { changed: false, reason: "gbp_hours_failed" };
      }
      const resolved = await resolveEvent(eventId, action, { actor: "user" });
      return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
    }

    // Structural change (H6): never auto-applied — it's queued manual work for
    // the builder. Resolve it, but signal the handoff so the UI doesn't claim
    // "Made live" for a change that hasn't shipped.
    if (kind === "manual_structural_change") {
      const resolved = await resolveEvent(eventId, action, { actor: "user" });
      return resolved.changed
        ? { changed: true, reason: "structural_handoff" }
        : { changed: false, reason: "already_resolved" };
    }

    // Section content (H4): confirm a draft exists and isn't stale BEFORE
    // resolving, then resolve (claim) and only apply if we won the claim.
    const section = typeof event.metadata?.section === "string"
      ? event.metadata.section as ContentSection
      : null;

    if (section && action === "approved") {
      const metadataDraft =
        kind === "agent_preview" &&
        event.metadata?.proposedData &&
        typeof event.metadata.proposedData === "object" &&
        !Array.isArray(event.metadata.proposedData)
          ? event.metadata.proposedData
          : null;
      const draft = (await getDraftContent(section, tenantId)) || metadataDraft;
      if (!draft) return { changed: false, reason: "draft_not_found" };

      // Stale-overwrite guard: if the section was edited after this change was
      // proposed, the queued AI change is stale — refuse rather than silently
      // revert the owner's newer edit.
      const { getSectionTimestamps } = await import("./storage");
      const timestamps = await getSectionTimestamps(tenantId).catch(
        () => ({}) as Record<string, string>,
      );
      const sectionUpdatedAt = timestamps[section] ? new Date(timestamps[section]).getTime() : 0;
      const proposedAt = event.createdAt ? new Date(event.createdAt).getTime() : 0;
      if (sectionUpdatedAt && proposedAt && sectionUpdatedAt > proposedAt) {
        return { changed: false, reason: "stale_superseded" };
      }

      const current = (await getContent(section, tenantId)) as unknown as Record<string, unknown>;
      const resolved = await resolveEvent(eventId, action, { actor: "user" });
      if (!resolved.changed) return { changed: false, reason: "already_resolved" };

      await setContent(section, draft as ContentMap[typeof section], tenantId);
      await appendVersion(
        section,
        draft,
        "user",
        tenantId,
        diffFields(current, draft as unknown as Record<string, unknown>),
      );
      await recordSectionUpdate(section, tenantId);
      const { revalidatePath } = await import("next/cache");
      revalidatePath("/");
      const { revalidateClientSite } = await import("./revalidate-client");
      revalidateClientSite(tenantId, clientRevalidationTargetForSections([section])).catch(() => {});
      await clearDraft(section, tenantId);
      if (event.source === "ai") recordApproval(tenantId).catch(() => {});
      return { changed: true };
    }

    // Dismissed, or a content_update with no section: resolve + clean up.
    const resolved = await resolveEvent(eventId, action, { actor: "user" });
    if (!resolved.changed) return { changed: false, reason: "already_resolved" };
    if (section) await clearDraft(section, tenantId);
    if (event.source === "ai") {
      (action === "approved" ? recordApproval : recordRejection)(tenantId).catch(() => {});
    }
    return { changed: true };
  }

  // Newsletter draft (B2): on approve, actually send to subscribers.
  if (event.type === "newsletter_draft") {
    if (action === "approved") {
      const subject = typeof event.metadata?.subject === "string" ? event.metadata.subject : "";
      const body = typeof event.metadata?.body === "string" ? event.metadata.body : "";
      if (!subject || !body) return { changed: false, reason: "newsletter_invalid" };
      const { sendNewsletter } = await import("./newsletter");
      const result = await sendNewsletter(tenantId, { subject, body });
      if (!result.success) return { changed: false, reason: result.reason || "newsletter_failed" };
    }
    const resolved = await resolveEvent(eventId, action, { actor: "user" });
    return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
  }

  // Review reply draft: on approve, publish the reply to the Google listing.
  // Governed like the other external writes — the reply only reaches Google
  // through this approval (owner-facing, via the queue route's auth), and a
  // failed publish leaves the draft pending so the queue can't falsely show it
  // as handled.
  if (event.type === "review" && event.metadata?.kind === "review_reply_draft") {
    if (action === "approved") {
      const reviewId = typeof event.metadata?.reviewId === "string" ? event.metadata.reviewId : "";
      const replyText =
        typeof event.metadata?.draftedReply === "string"
          ? event.metadata.draftedReply
          : typeof event.body === "string"
            ? event.body
            : "";
      if (!reviewId || !replyText) return { changed: false, reason: "review_reply_invalid" };
      const { publishReviewReply } = await import("./gbp-replies");
      const result = await publishReviewReply(tenantId, reviewId, replyText);
      if (!result.published) return { changed: false, reason: "review_reply_failed" };
    }
    const resolved = await resolveEvent(eventId, action, { actor: "user" });
    return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
  }

  // Remaining simple cases (suggestion, etc.) — resolve then handle.
  const resolved = await resolveEvent(eventId, action, { actor: "user" });
  if (!resolved.changed) return { changed: false, reason: "already_resolved" };

  if (event.type !== "suggestion") return { changed: true };

  const suggestionId = typeof event.metadata?.suggestionId === "string"
    ? event.metadata.suggestionId
    : null;
  if (suggestionId) {
    await updateSuggestion(
      tenantId,
      suggestionId,
      action === "approved" ? "accepted" : "dismissed"
    );
  }

  const actionPrompt = typeof event.metadata?.actionPrompt === "string"
    ? event.metadata.actionPrompt
    : null;
  if (action === "approved" && actionPrompt) {
    await executeAgentPrompt(tenantId, actionPrompt);
  }

  return { changed: true };
}
