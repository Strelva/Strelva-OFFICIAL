import { executeAgentPrompt } from "./agent-executor";
import { getEvent, resolveEvent } from "./events";
import { updateSuggestion } from "./suggestions";

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
