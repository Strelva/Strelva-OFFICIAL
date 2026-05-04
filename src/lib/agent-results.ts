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
}

export interface AgentResultContract {
  status: AgentResultStatus;
  sectionIds: string[];
  eventIds: string[];
  actions: AgentActionResult[];
  message?: string;
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

  return {
    status,
    sectionIds: unique(normalized.flatMap((action) => action.sectionIds || [])),
    eventIds: unique(normalized.flatMap((action) => action.eventIds || [])),
    actions: normalized,
    message: normalized.find((action) => action.status === status)?.message,
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
    };
  }

  if (record.success === false) {
    return {
      status: record.blocked === true ? "blocked" : "failed",
      sectionIds: typeof record.section === "string" ? [record.section] : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
    };
  }

  return null;
}
