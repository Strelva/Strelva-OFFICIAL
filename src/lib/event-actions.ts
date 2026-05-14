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

  const resolved = await resolveEvent(eventId, action, { actor: "user" });
  if (!resolved.changed) {
    return { changed: false, reason: "already_resolved" };
  }

  if (event.type === "content_update") {
    const section = typeof event.metadata?.section === "string"
      ? event.metadata.section as ContentSection
      : null;

    if (section && event.metadata?.kind !== "manual_structural_change") {
      if (action === "approved") {
        const metadataDraft =
          event.metadata?.kind === "agent_preview" &&
          event.metadata.proposedData &&
          typeof event.metadata.proposedData === "object" &&
          !Array.isArray(event.metadata.proposedData)
            ? event.metadata.proposedData
            : null;
        const draft = await getDraftContent(section, tenantId) || metadataDraft;
        if (!draft) return { changed: true, reason: "draft_not_found" };

        const current = await getContent(section, tenantId) as unknown as Record<string, unknown>;
        await setContent(section, draft as ContentMap[typeof section], tenantId);
        await appendVersion(
          section,
          draft,
          "user",
          tenantId,
          diffFields(current, draft as unknown as Record<string, unknown>)
        );
        await recordSectionUpdate(section, tenantId);
        const { revalidatePath } = await import("next/cache");
        revalidatePath("/");
        const { revalidateClientSite } = await import("./revalidate-client");
        revalidateClientSite(tenantId, clientRevalidationTargetForSections([section])).catch(() => {});
      }

      await clearDraft(section, tenantId);
    }

    return { changed: true };
  }

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
