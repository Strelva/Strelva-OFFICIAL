import { executeAgentPrompt } from "./agent-executor";
import { getEvent, resolveEvent } from "./events";
import { updateSuggestion } from "./suggestions";
import {
  appendVersion,
  clearDraft,
  getContent,
  getDraftContent,
  recordSectionUpdate,
  setContent,
} from "./storage";
import { diffFields } from "./utils";
import type { ContentMap, ContentSection } from "./types";

export async function resolveEventAction(
  tenantId: string,
  eventId: string,
  action: "approved" | "dismissed"
): Promise<{ changed: boolean; reason?: string }> {
  const event = await getEvent(eventId);
  if (!event) return { changed: false, reason: "not_found" };
  if (event.tenantId !== tenantId) return { changed: false, reason: "wrong_tenant" };

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
        const draft = await getDraftContent(section, tenantId);
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
        revalidateClientSite(tenantId, ["/"]).catch(() => {});
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
