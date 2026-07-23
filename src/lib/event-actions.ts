import { executeAgentPrompt } from "./agent-executor";
import { claimEventAction, finishEventAction, getEvent, resolveEvent, updateEvent } from "./events";
import { updateSuggestion } from "./suggestions";
import { isCustomChangeRequestMetadata } from "./custom-repos";
import {
  appendVersion,
  clearDraft,
  getContent,
  getDraftContent,
  logActivity,
  recordSectionUpdate,
  setContent,
} from "./storage";
import { clientRevalidationTargetForSections } from "./content-revalidation";
import { diffFields } from "./utils";
import { recordApproval, recordRejection } from "./ai-auto-approve";
import { GBP_OPERATIONS } from "./agent/gbp-operations";
import {
  shadowChangeRequestWorkflow,
  shadowFinishExecutionAttempt,
  shadowStartExecutionAttempt,
} from "./governed-work/shadow";
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

/**
 * Record a published Google Business action in the owner-facing activity feed.
 * A GBP post/hours/photo only reaches here after a SUCCESSFUL live write on the
 * owner's approval, so it is genuinely-done Strelva work (actor:"admin" — from
 * the client's side it's all "Strelva managed my listing"). Fail-soft: an
 * activity-log blip must never break the approval that already succeeded.
 */
async function logGbpActivity(
  tenantId: string,
  type: "gbp-post" | "gbp-hours" | "gbp-photo",
  text: string,
): Promise<void> {
  try {
    await logActivity(
      { type, text, time: new Date().toISOString(), actor: "admin", suppressEvent: true },
      tenantId,
    );
  } catch {
    // A feed-logging failure is never fatal to a completed publish.
  }
}

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

/**
 * Escalate a pending operator-approval draft to the client. Flips the draft's
 * `reviewAudience` to "owner" so it appears in the client's "Needs you" for THEIR
 * decision — used when the operator is unsure and wants the owner to make the call.
 * Stays pending (nothing publishes); tenant-scoped for safety.
 */
export async function escalateEventToOwner(
  tenantId: string,
  eventId: string,
): Promise<{ changed: boolean; reason?: string }> {
  const event = await getEvent(eventId);
  if (!event) return { changed: false, reason: "not_found" };
  if (event.tenantId !== tenantId) return { changed: false, reason: "wrong_tenant" };
  if (event.status !== "pending") return { changed: false, reason: "not_pending" };
  const updated = await updateEvent(eventId, (e) => ({
    ...e,
    metadata: { ...e.metadata, reviewAudience: "owner", escalatedByOperator: true },
  }));
  return { changed: Boolean(updated) };
}

export async function resolveEventAction(
  tenantId: string,
  eventId: string,
  action: EventWorkflowAction
): Promise<{ changed: boolean; reason?: string }> {
  const event = await getEvent(eventId);
  if (!event) return { changed: false, reason: "not_found" };
  if (event.tenantId !== tenantId) return { changed: false, reason: "wrong_tenant" };
  if (event.status !== "pending") return { changed: false, reason: "already_resolved" };

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
    // ONE timestamp for resolvedAt + shippedAt + workflowUpdatedAt so the Postgres
    // reconstruction can recover resolvedAt from workflowUpdatedAt exactly (gap #3).
    const now = new Date().toISOString();
    const result = await updateEvent(eventId, (existing) => ({
      ...existing,
      status: terminalStatus,
      resolvedAt: terminalStatus === "approved" || terminalStatus === "dismissed"
        ? now
        : existing.resolvedAt,
      metadata: {
        ...existing.metadata,
        workflowStatus,
        quoteRequired: workflowStatus === "quoted" ? true : existing.metadata?.quoteRequired,
        shippedAt: workflowStatus === "shipped" ? now : existing.metadata?.shippedAt,
        workflowUpdatedAt: now,
      },
    }));
    // Re-sync the governed-work shadow (gap #3): flag-gated + best-effort, never
    // affects the Redis-authoritative result above.
    if (result.changed && result.event) {
      await shadowChangeRequestWorkflow(result.event);
    }
    return { changed: result.changed };
  }

  if (action !== "approved" && action !== "dismissed") {
    return { changed: false, reason: "invalid_action" };
  }

  const claim = await claimEventAction(eventId, action, "user");
  if (!claim.acquired) return { changed: false, reason: claim.reason };

  // Governed-work execution shadow (SEPARATE flag, default OFF, best-effort). Only
  // an approval performs the external write, so only an approval opens an attempt;
  // the Redis attemptId is the idempotency key. This is the attempt-owning
  // chokepoint (it holds attemptId + the single success/fail result); it does not
  // touch executeResolvedEventAction's branches. See shadow.ts. #7 migration must be
  // applied before the flag is enabled.
  const shadowAttemptId =
    action === "approved" ? await shadowStartExecutionAttempt(eventId, claim.attemptId) : null;

  try {
    const result = await executeResolvedEventAction(tenantId, eventId, action, event);
    await finishEventAction(eventId, claim.attemptId, {
      state: result.changed ? "completed" : "failed",
      reason: result.reason,
    });
    await shadowFinishExecutionAttempt(shadowAttemptId, {
      success: result.changed,
      detail: result.reason,
    });
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : "action_failed";
    await finishEventAction(eventId, claim.attemptId, { state: "failed", reason });
    await shadowFinishExecutionAttempt(shadowAttemptId, { success: false, detail: reason });
    throw error;
  }
}

async function executeResolvedEventAction(
  tenantId: string,
  eventId: string,
  action: "approved" | "dismissed",
  event: NonNullable<Awaited<ReturnType<typeof getEvent>>>,
): Promise<{ changed: boolean; reason?: string }> {

  // For approvals that actually do something external (post to Google, send an
  // email, publish content), validate + perform the effect BEFORE flipping the
  // event to resolved. A failed or stale action must leave the item pending —
  // never resolve it and have the UI falsely say "Made live".

  if (event.type === "content_update") {
    const kind = event.metadata?.kind;

    // GBP writes (post / hours / photo) dispatch through the operation registry
    // (`GBP_OPERATIONS`), which owns the per-kind validate + external-write. The
    // governance spine stays HERE and is identical across all three:
    //
    // We gate resolution on `success` (Google accepted the write), NOT on
    // `verified` (the read-back confirmation). A GBP write is NON-IDEMPOTENT —
    // once `success` is true the change already exists on Google, so keeping the
    // event pending would let a re-approval create a DUPLICATE. When the
    // read-back can't confirm (success=true, verified=false), the write function
    // already emits a separate `change_verify_failed` event to surface the gap;
    // that's the right signal, not a stuck approval. The external write happens
    // ONLY on `approved` (a dismiss just resolves), and the `gbp-*` activity is
    // logged ONLY after the event actually resolves.
    const gbpOp = GBP_OPERATIONS.find((o) => o.kind === kind);
    if (gbpOp?.execute) {
      let activity: { type: "gbp-post" | "gbp-hours" | "gbp-photo"; detail: string } | undefined;
      if (action === "approved") {
        const r = await gbpOp.execute({ tenantId, event });
        if (!r.ok) return { changed: false, reason: r.reason };
        activity = r.activity;
      }
      const resolved = await resolveEvent(eventId, action, { actor: "user" });
      if (resolved.changed && action === "approved" && activity) {
        await logGbpActivity(tenantId, activity.type, activity.detail);
      }
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
      // The live write is the authoritative effect. Resolve only after it
      // succeeds so a storage failure cannot produce a false "Made live" state.
      await setContent(section, draft as ContentMap[typeof section], tenantId);
      const resolved = await resolveEvent(eventId, action, { actor: "user" });
      if (!resolved.changed) return { changed: false, reason: "already_resolved" };
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
    const metaReviewId = typeof event.metadata?.reviewId === "string" ? event.metadata.reviewId : "";
    if (action === "approved") {
      const reviewId = metaReviewId;
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
      // Mirror the published reply onto the review row (keyed by the Google
      // external id) so the auto-post backlog no longer treats the review as
      // unreplied and re-drafts + re-posts it in an endless loop.
      const { replyToReviewByExternalId } = await import("./reviews");
      await replyToReviewByExternalId(tenantId, reviewId, replyText).catch(() => {});
    }
    const resolved = await resolveEvent(eventId, action, { actor: "user" });
    if (resolved.changed && action === "dismissed" && metaReviewId) {
      // A dismissal is a per-review veto: mark it durably so the backlog never
      // re-drafts (and eventually auto-posts) a reply the owner rejected.
      const { markReviewReplyDeclined } = await import("./review-replies");
      await markReviewReplyDeclined(tenantId, metaReviewId).catch(() => {});
    }
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
