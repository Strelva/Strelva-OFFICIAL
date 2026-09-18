import { getSupabase } from "@/lib/db/client";
import { responsibilitySchema, type Responsibility } from "@/platform/work-execution/engine";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

type Row = Record<string, unknown>;
type Failure = { message?: unknown; code?: unknown } | null;
type QueryResult = { data: unknown; error: Failure };
type Query = {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(value: number): Query;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};
type InternalDb = { from(table: string): Query };

const MAX_ROWS = 500;

export type EffectCertainty = "none" | "accepted" | "unknown";

export interface OperationalExceptionProjection {
  id: string;
  source: "responsibility" | "standing_run";
  workspaceId: string;
  workspaceName: string;
  workId: string;
  title: string;
  status: string;
  stepId?: string;
  stepStatus?: string;
  effect: EffectCertainty;
  reason?: string;
  ageAt: string;
  owner: { userId: string; email?: string };
  responsible?: { userId: string; email?: string; kind?: string; assignmentId?: string };
  safeAction: "retry" | "reconcile" | "inspect";
  deepLink: string;
}

export interface OperationalAssignmentInboxItem {
  assignmentId: string;
  workspaceId: string;
  workspaceName: string;
  workId: string;
  title: string;
  status: "offered" | "accepted";
  assigneeKind: string;
  sponsorEmail: string;
  expiresAt: string;
  providerRequest?: {
    deliveryId: string;
    status: "requested";
    installationId: string;
    expiresAt: string;
  };
  deepLink: string;
}

export interface OperationalInbox {
  assignments: OperationalAssignmentInboxItem[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  const result = text(value);
  return result ? result : undefined;
}

function row(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(row).filter((item): item is Row => item !== null) : [];
}

function db(): InternalDb {
  const value = getSupabase();
  if (!value) throw new WorkspaceStoreError("Operational work storage is unavailable.");
  return value as unknown as InternalDb;
}

async function selectRows(table: string, columns: string, limit = MAX_ROWS): Promise<Row[]> {
  const result = await db().from(table).select(columns).limit(limit);
  if (result.error) throw new WorkspaceStoreError(`Operational ${table} records are unavailable.`);
  return rows(result.data);
}

function parseResponsibility(value: unknown): Responsibility | null {
  const parsed = responsibilitySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function userMap(records: Row[]): Map<string, string> {
  const entries: Array<[string, string]> = [];
  for (const item of records) {
    const id = text(item.id);
    if (id) entries.push([id, text(item.email).trim().toLowerCase()]);
  }
  return new Map(entries);
}

function workspaceMap(records: Row[]): Map<string, string> {
  const entries: Array<[string, string]> = [];
  for (const item of records) {
    const id = text(item.id);
    if (id) entries.push([id, text(item.name) || "Unnamed workspace"]);
  }
  return new Map(entries);
}

function assignmentScope(payload: Responsibility): Record<string, unknown> {
  return {
    ownerId: payload.ownerId,
    approvedBy: payload.approvedBy,
    approvedAt: payload.approvedAt,
    budgetId: payload.budgetId ?? null,
    steps: payload.steps.map((step) => ({
      id: step.id,
      operation: step.operation,
      workId: step.workId,
      input: step.input,
      dependsOn: step.dependsOn,
      maximumCents: step.maximumCents,
      capabilityVersion: step.capabilityVersion,
      expectedUpdatedAt: step.expectedUpdatedAt ?? null,
    })),
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function effectCertainty(step: Responsibility["steps"][number]): EffectCertainty {
  if (step.effect === "unknown" || step.status === "unknown") return "unknown";
  if (step.effect === "accepted" || step.status === "accepted") return "accepted";
  return "none";
}

export function safeExceptionAction(
  step: Pick<Responsibility["steps"][number], "status" | "effect">,
  work: Pick<Responsibility, "steps">,
): OperationalExceptionProjection["safeAction"] {
  if (step.effect === "none" && step.status === "failed"
    && !work.steps.some((candidate) => candidate.effect === "unknown" || candidate.effect === "accepted"
      || candidate.status === "unknown" || candidate.status === "accepted")) return "retry";
  if (step.effect === "unknown" || step.effect === "accepted"
    || step.status === "unknown" || step.status === "accepted" || step.status === "running") return "reconcile";
  return "inspect";
}

function assignmentForWork(assignments: Row[], workId: string, now: number): Row | undefined {
  return assignments
    .filter((item) => text(item.work_id) === workId)
    .sort((a, b) => Date.parse(text(b.offered_at)) - Date.parse(text(a.offered_at)))
    .find((item) => ["offered", "accepted"].includes(text(item.status)) && Date.parse(text(item.expires_at)) > now)
    ?? assignments.find((item) => text(item.work_id) === workId);
}

function exceptionLink(workspaceId: string, workId: string, stepId?: string): string {
  const anchor = stepId ? `#exception-${encodeURIComponent(workId)}-${encodeURIComponent(stepId)}` : `#exception-${encodeURIComponent(workId)}`;
  return `/admin/work?workspaceId=${encodeURIComponent(workspaceId)}&workId=${encodeURIComponent(workId)}${anchor}`;
}

export async function listOperationalExceptions(): Promise<OperationalExceptionProjection[]> {
  const [workRows, runRows, receiptRows, assignmentRows, userRows, workspaceRows] = await Promise.all([
    selectRows("saved_product_work", "id,workspace_id,title,payload,updated_at"),
    selectRows("standing_responsibility_runs", "id,workspace_id,finite_work_id,status,last_error,updated_at"),
    selectRows("standing_responsibility_receipts", "id,run_id,step_id,attempt,status,effect,reason,finished_at,created_at"),
    selectRows("operational_assignments", "id,work_id,assignee_user_id,assignee_email,assignee_kind,status,offered_at,expires_at"),
    selectRows("users", "id,email"),
    selectRows("workspaces", "id,name"),
  ]);
  const users = userMap(userRows);
  const workspaces = workspaceMap(workspaceRows);
  const now = Date.now();
  const result: OperationalExceptionProjection[] = [];
  const workById = new Map<string, { row: Row; payload: Responsibility }>();
  const standingWorkIds = new Set<string>();
  for (const run of runRows) {
    const receipts = receiptRows.filter((receipt) => text(receipt.run_id) === text(run.id));
    const relevant = receipts.some((receipt) => ["failed", "unknown", "accepted"].includes(text(receipt.status))
      || ["unknown", "accepted"].includes(text(receipt.effect)));
    if (relevant || ["failed", "needs_attention"].includes(text(run.status))) standingWorkIds.add(text(run.finite_work_id));
  }

  for (const item of workRows) {
    const payload = parseResponsibility(item.payload);
    const id = text(item.id);
    if (!payload || !id || text(item.workspace_id) === "") continue;
    workById.set(id, { row: item, payload });
    // A standing run owns the execution identity for its finite work. Its
    // receipt below is the exact durable projection, so do not show the same
    // failed/unknown step a second time from the copied finite payload.
    if (standingWorkIds.has(id)) continue;
    const assignment = assignmentForWork(assignmentRows, id, now);
    const responsibleUserId = text(assignment?.assignee_user_id);
    const owner = { userId: payload.ownerId, ...(users.get(payload.ownerId) ? { email: users.get(payload.ownerId) } : {}) };
    const responsible = responsibleUserId
      ? { userId: responsibleUserId, email: users.get(responsibleUserId) || text(assignment?.assignee_email), kind: optionalText(assignment?.assignee_kind), assignmentId: text(assignment?.id) }
      : undefined;
    for (const step of payload.steps) {
      if (!(step.status === "failed" || step.status === "unknown" || step.status === "accepted"
        || step.effect === "unknown" || step.effect === "accepted")) continue;
      const workspaceId = text(item.workspace_id);
      const ageAt = step.startedAt || step.finishedAt || payload.updatedAt || text(item.updated_at);
      result.push({
        id: `${id}:${step.id}:${step.attempt}`,
        source: "responsibility",
        workspaceId,
        workspaceName: workspaces.get(workspaceId) || "Unnamed workspace",
        workId: id,
        title: text(item.title) || payload.title,
        status: payload.status,
        stepId: step.id,
        stepStatus: step.status,
        effect: effectCertainty(step),
        ...(step.reason ? { reason: step.reason } : {}),
        ageAt,
        owner,
        ...(responsible ? { responsible } : {}),
        safeAction: safeExceptionAction(step, payload),
        deepLink: exceptionLink(workspaceId, id, step.id),
      });
    }
  }

  const receiptsByRun = new Map<string, Row[]>();
  for (const receipt of receiptRows) {
    const runId = text(receipt.run_id);
    const list = receiptsByRun.get(runId) ?? [];
    list.push(receipt);
    receiptsByRun.set(runId, list);
  }
  for (const run of runRows) {
    const finiteId = text(run.finite_work_id);
    const finite = workById.get(finiteId);
    if (!finite) continue;
    const receipts = receiptsByRun.get(text(run.id)) ?? [];
    const relevant = receipts.filter((receipt) => ["failed", "unknown", "accepted"].includes(text(receipt.status))
      || ["unknown", "accepted"].includes(text(receipt.effect)));
    if (!(relevant.length || ["failed", "needs_attention"].includes(text(run.status)))) continue;
    const assignment = assignmentForWork(assignmentRows, finiteId, now);
    const ownerId = finite.payload.ownerId;
    const responsibleUserId = text(assignment?.assignee_user_id);
    const workspaceId = text(run.workspace_id) || text(finite.row.workspace_id);
    const owner = { userId: ownerId, ...(users.get(ownerId) ? { email: users.get(ownerId) } : {}) };
    const responsible = responsibleUserId
      ? { userId: responsibleUserId, email: users.get(responsibleUserId) || text(assignment?.assignee_email), kind: optionalText(assignment?.assignee_kind), assignmentId: text(assignment?.id) }
      : undefined;
    if (!relevant.length) {
      result.push({
        id: `standing-run:${text(run.id)}`,
        source: "standing_run",
        workspaceId,
        workspaceName: workspaces.get(workspaceId) || "Unnamed workspace",
        workId: finiteId,
        title: text(finite.row.title) || finite.payload.title,
        status: text(run.status),
        effect: "unknown",
        ...(text(run.last_error) ? { reason: text(run.last_error) } : {}),
        ageAt: text(run.updated_at) || finite.payload.updatedAt,
        owner,
        ...(responsible ? { responsible } : {}),
        safeAction: "reconcile",
        deepLink: exceptionLink(workspaceId, finiteId),
      });
      continue;
    }
    for (const receipt of relevant) {
      const effect = text(receipt.effect) === "accepted" || text(receipt.status) === "accepted"
        ? "accepted" as const
        : text(receipt.effect) === "unknown" || text(receipt.status) === "unknown"
          ? "unknown" as const
          : "none" as const;
      result.push({
        id: `standing-run:${text(run.id)}:${text(receipt.step_id)}:${text(receipt.attempt)}`,
        source: "standing_run",
        workspaceId,
        workspaceName: workspaces.get(workspaceId) || "Unnamed workspace",
        workId: finiteId,
        title: text(finite.row.title) || finite.payload.title,
        status: text(run.status),
        stepId: text(receipt.step_id),
        stepStatus: text(receipt.status),
        effect,
        ...(text(receipt.reason) || text(run.last_error) ? { reason: text(receipt.reason) || text(run.last_error) } : {}),
        ageAt: text(receipt.finished_at) || text(receipt.created_at) || text(run.updated_at),
        owner,
        ...(responsible ? { responsible } : {}),
        safeAction: effect === "none" && text(receipt.status) === "failed" ? "retry" : "reconcile",
        deepLink: exceptionLink(workspaceId, finiteId, text(receipt.step_id)),
      });
    }
  }
  return result.sort((a, b) => Date.parse(b.ageAt) - Date.parse(a.ageAt)).slice(0, MAX_ROWS);
}

export async function listAuthorizedOperationalInbox(actor: WorkspaceActor): Promise<OperationalInbox> {
  const verifiedEmail = actor.verifiedEmail.trim().toLowerCase();
  const [assignmentRows, workRows, membershipRows, workspaceRows, providerRows] = await Promise.all([
    selectRows("operational_assignments", "id,workspace_id,work_id,sponsor_id,sponsor_email,assignee_user_id,assignee_email,assignee_kind,status,offered_at,expires_at,work_scope"),
    selectRows("saved_product_work", "id,workspace_id,title,payload"),
    selectRows("workspace_memberships", "workspace_id,user_id,role"),
    selectRows("workspaces", "id,name"),
    selectRows("offering_provider_deliveries", "id,business_workspace_id,installation_id,assignment_id,status,expires_at"),
  ]);
  const workById = new Map<string, Row>(workRows.map((item) => [text(item.id), item]));
  const workspaces = workspaceMap(workspaceRows);
  const membershipKeys = new Set(membershipRows.map((item) => `${text(item.workspace_id)}:${text(item.user_id)}`));
  const ownerKeys = new Set(membershipRows.filter((item) => text(item.role) === "owner").map((item) => `${text(item.workspace_id)}:${text(item.user_id)}`));
  const providerByAssignment = new Map(providerRows.map((item) => [text(item.assignment_id), item]));
  const now = Date.now();
  const assignments: OperationalAssignmentInboxItem[] = [];
  for (const item of assignmentRows) {
    const assignmentId = text(item.id);
    const workspaceId = text(item.workspace_id);
    const workId = text(item.work_id);
    if (!assignmentId || !workspaceId || !workId
      || text(item.assignee_user_id) !== actor.userId
      || text(item.assignee_email).trim().toLowerCase() !== verifiedEmail
      || !["offered", "accepted"].includes(text(item.status))
      || Date.parse(text(item.expires_at)) <= now
      || !membershipKeys.has(`${workspaceId}:${actor.userId}`)
      || !ownerKeys.has(`${workspaceId}:${text(item.sponsor_id)}`)) continue;
    const saved = workById.get(workId);
    const payload = parseResponsibility(saved?.payload);
    if (!saved || !payload || payload.ownerId !== text(item.sponsor_id)
      || payload.approvedBy !== payload.ownerId || !payload.approvedAt
      || !["ready", "waiting"].includes(payload.status)
      || canonical(assignmentScope(payload)) !== canonical(item.work_scope)) continue;
    const provider = providerByAssignment.get(assignmentId);
    const providerRequest = provider && text(provider.status) === "requested"
      && Date.parse(text(provider.expires_at)) > now
      ? {
        deliveryId: text(provider.id),
        status: "requested" as const,
        installationId: text(provider.installation_id),
        expiresAt: text(provider.expires_at),
      }
      : undefined;
    assignments.push({
      assignmentId,
      workspaceId,
      workspaceName: workspaces.get(workspaceId) || "Unnamed workspace",
      workId,
      title: text(saved.title) || payload.title,
      status: text(item.status) as "offered" | "accepted",
      assigneeKind: text(item.assignee_kind),
      sponsorEmail: text(item.sponsor_email),
      expiresAt: text(item.expires_at),
      ...(providerRequest ? { providerRequest } : {}),
      deepLink: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=operations&assignmentId=${encodeURIComponent(assignmentId)}`,
    });
  }
  return { assignments: assignments.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt)).slice(0, MAX_ROWS) };
}
