import type { UnifiedEvent, CustomChangeRequestStatus } from "./types";

export interface WebsiteRequestHistoryStage {
  status: string;
  actor: string;
  at: string;
}

export interface WebsiteRequestHistoryItem {
  requestId: string;
  title: string;
  body: string;
  kind: "custom_request" | "content_update";
  section?: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
  stages: WebsiteRequestHistoryStage[];
}

const CUSTOM_STATUSES = new Set<CustomChangeRequestStatus>([
  "requested",
  "triaged",
  "quoted",
  "accepted",
  "in_progress",
  "shipped",
  "declined",
]);

function workflowStages(event: UnifiedEvent): WebsiteRequestHistoryStage[] {
  const raw = event.metadata?.workflowHistory;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is WebsiteRequestHistoryStage => Boolean(entry)
    && typeof entry === "object"
    && typeof (entry as Record<string, unknown>).status === "string"
    && typeof (entry as Record<string, unknown>).actor === "string"
    && typeof (entry as Record<string, unknown>).at === "string")
    .slice(-20);
}

function customRequestStatus(event: UnifiedEvent): string {
  const workflow = event.metadata?.workflowStatus;
  if (typeof workflow === "string" && CUSTOM_STATUSES.has(workflow as CustomChangeRequestStatus)) return workflow;
  return event.status === "approved" ? "shipped" : event.status === "dismissed" ? "declined" : "requested";
}

function contentUpdateStatus(event: UnifiedEvent): string {
  if (event.status === "approved" || event.status === "auto_approved") return "published";
  if (event.status === "dismissed") return "skipped";
  return "review";
}

/**
 * Select the website changes that can be reopened from the Website history
 * surface. The event id is the durable identity shared by the request,
 * governed proposal and approval result. This reads the existing event queue;
 * it does not create a second request or history store.
 */
export function selectWebsiteRequestHistory(events: UnifiedEvent[]): WebsiteRequestHistoryItem[] {
  return events
    .filter((event) => {
      if (event.type === "change_request") return event.metadata?.kind === "custom_code_or_design_request";
      return event.type === "content_update" && typeof event.metadata?.section === "string";
    })
    .map((event): WebsiteRequestHistoryItem => {
      const custom = event.type === "change_request";
      const stages = custom ? workflowStages(event) : [{
        status: "proposed",
        actor: event.source,
        at: event.createdAt,
      }, ...(event.resolvedAt ? [{
        status: contentUpdateStatus(event),
        actor: "review",
        at: event.resolvedAt,
      }] : [])];
      return {
        requestId: event.id,
        title: event.title,
        body: event.body,
        kind: custom ? "custom_request" : "content_update",
        ...(typeof event.metadata?.section === "string" ? { section: event.metadata.section } : {}),
        status: custom ? customRequestStatus(event) : contentUpdateStatus(event),
        createdAt: event.createdAt,
        ...(event.resolvedAt ? { resolvedAt: event.resolvedAt } : {}),
        stages,
      };
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 30);
}
