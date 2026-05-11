export type AgentResultStatus =
  | "published"
  | "applied"
  | "drafted"
  | "queued"
  | "blocked"
  | "failed"
  | "no-op";

export interface AgentActionResult {
  status: AgentResultStatus;
  sectionIds?: string[];
  eventIds?: string[];
  message?: string;
  error?: string;
  sourceProof?: string;
}

export interface AgentResultContract {
  status: AgentResultStatus;
  sectionIds: string[];
  eventIds: string[];
  actions: AgentActionResult[];
  message?: string;
  receipt: AgentResultReceipt;
}

export interface AgentResultReceipt {
  title: string;
  detail: string;
  proof: string;
  nextAction: "view_site" | "review_queue" | "revise_request" | "none";
}

const STATUS_PRIORITY: Record<AgentResultStatus, number> = {
  published: 70,
  applied: 60,
  drafted: 50,
  queued: 40,
  blocked: 30,
  failed: 20,
  "no-op": 10,
};

export function isAgentResultStatus(value: unknown): value is AgentResultStatus {
  return (
    value === "published" ||
    value === "applied" ||
    value === "drafted" ||
    value === "queued" ||
    value === "blocked" ||
    value === "failed" ||
    value === "no-op"
  );
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function buildAgentResultContract(actions: AgentActionResult[]): AgentResultContract {
  const normalized = actions.length > 0 ? actions : [{ status: "no-op" as const }];
  const status = normalized.reduce<AgentResultStatus>((winner, action) => {
    return STATUS_PRIORITY[action.status] > STATUS_PRIORITY[winner] ? action.status : winner;
  }, "no-op");
  const sectionIds = unique(normalized.flatMap((action) => action.sectionIds || []));
  const eventIds = unique(normalized.flatMap((action) => action.eventIds || []));
  const message = normalized.find((action) => action.status === status)?.message;

  return {
    status,
    sectionIds,
    eventIds,
    actions: normalized,
    message,
    receipt: buildAgentResultReceipt(status, sectionIds, eventIds, normalized, message),
  };
}

function formatSections(sectionIds: string[]): string {
  if (sectionIds.length === 0) return "site";
  if (sectionIds.length === 1) return sectionIds[0];
  return `${sectionIds.slice(0, 2).join(", ")}${sectionIds.length > 2 ? ` +${sectionIds.length - 2}` : ""}`;
}

export function buildAgentResultReceipt(
  status: AgentResultStatus,
  sectionIds: string[],
  eventIds: string[],
  actions: AgentActionResult[],
  message?: string
): AgentResultReceipt {
  const sectionLabel = formatSections(sectionIds);
  const proof =
    actions.find((action) => action.sourceProof)?.sourceProof ||
    (sectionIds.length > 0
      ? `Source: Site content and ${sectionLabel} section data`
      : "Source: AI action log");

  if (status === "published" || status === "applied") {
    return {
      title: "Site updated",
      detail: message || `The AI applied the change to ${sectionLabel}. Open the live site to confirm what visitors see.`,
      proof,
      nextAction: "view_site",
    };
  }

  if (status === "drafted" || status === "queued") {
    return {
      title: "Ready for approval",
      detail:
        message ||
        `The AI saved ${sectionLabel} as a controlled change${eventIds.length ? " in the approval queue" : ""}.`,
      proof,
      nextAction: "review_queue",
    };
  }

  if (status === "blocked") {
    return {
      title: "Needs a closer look",
      detail: message || "The AI stopped before changing the site because this request needs a clearer approval boundary.",
      proof,
      nextAction: "revise_request",
    };
  }

  if (status === "failed") {
    return {
      title: "Update failed",
      detail: message || actions.find((action) => action.error)?.error || "The update did not go through.",
      proof,
      nextAction: "revise_request",
    };
  }

  return {
    title: "No site changes made",
    detail: message || "The AI answered without changing or queuing anything.",
    proof,
    nextAction: "none",
  };
}

export function agentResultFromToolOutput(output: unknown): AgentActionResult | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const rawStatus = record.agentResultStatus || record.status;

  if (isAgentResultStatus(rawStatus)) {
    return {
      status: rawStatus,
      sectionIds: Array.isArray(record.sectionIds)
        ? record.sectionIds.filter((value): value is string => typeof value === "string")
        : typeof record.section === "string"
          ? [record.section]
          : undefined,
      eventIds: Array.isArray(record.eventIds)
        ? record.eventIds.filter((value): value is string => typeof value === "string")
        : typeof record.eventId === "string"
          ? [record.eventId]
          : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
      sourceProof: typeof record.sourceProof === "string" ? record.sourceProof : undefined,
    };
  }

  if (record.success === false) {
    return {
      status: record.blocked === true ? "blocked" : "failed",
      sectionIds: typeof record.section === "string" ? [record.section] : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
      sourceProof: typeof record.sourceProof === "string" ? record.sourceProof : undefined,
    };
  }

  return null;
}
