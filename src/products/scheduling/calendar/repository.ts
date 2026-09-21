import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { getSupabase } from "@/lib/db/client";
import { assertWorkspaceMember } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { z } from "zod";
import {
  calendarConnectionInputSchema,
  calendarConnectionSchema,
  calendarReminderPolicySchema,
  type CalendarConnection,
  type CalendarConnectionInput,
  type CalendarProvider,
  type CalendarReminderPolicy,
} from "./contracts";
import { refreshCalendarOAuthToken } from "./oauth";

type DbRow = Record<string, unknown>;
type CalendarConnectionWithSecrets = CalendarConnection & { accessToken?: string; refreshToken?: string };
type CalendarReceiptStatus = "writing" | "accepted" | "unknown" | "verified" | "failed";
type CalendarReceiptOperation = "create" | "update" | "delete";

export interface CalendarEventReceipt {
  id: string;
  workspaceId: string;
  workId: string;
  requestId: string;
  provider: CalendarProvider;
  calendarId: string;
  idempotencyKey: string;
  externalEventId?: string;
  operation: CalendarReceiptOperation;
  status: CalendarReceiptStatus;
  revision: number;
  title: string;
  start: string;
  end: string;
  timeZone: string;
  reminderPolicy: CalendarReminderPolicy;
  lastError?: string;
  attemptedAt?: string;
  observedAt?: string;
  createdAt: string;
  updatedAt: string;
}

type DbResult = { data: unknown; error: { code?: unknown; message?: unknown } | null };
interface CalendarQuery extends PromiseLike<DbResult> {
  select(columns?: string, options?: unknown): CalendarQuery;
  eq(column: string, value: unknown): CalendarQuery;
  order(column: string, options?: unknown): CalendarQuery;
  upsert(values: unknown, options?: unknown): CalendarQuery;
  update(values: unknown): CalendarQuery;
  maybeSingle(): Promise<DbResult>;
  single(): Promise<DbResult>;
}
type CalendarDb = { from(table: string): CalendarQuery };

const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const tokenRefreshes = new Map<string, Promise<CalendarConnectionWithSecrets>>();

/** New calendar configuration must stop with the workspace. Existing
 * connection cleanup, token refresh, and accepted-event recovery deliberately
 * use their own paths and remain available after an exit. */
export async function assertWorkspaceCalendarWriteAllowed(workspaceId: string): Promise<void> {
  if (!z.string().uuid().safeParse(workspaceId).success) {
    throw new WorkspaceConflictError("Workspace exit status could not be checked before changing the calendar.");
  }
  const client = getSupabase() as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  } | null;
  if (!client) throw new WorkspaceConflictError("Workspace exit status is unavailable. Retry before changing the calendar.");
  try {
    const result = await client.rpc("workspace_exit_completed", { p_workspace_id: workspaceId });
    if (result.error || typeof result.data !== "boolean") throw new Error("workspace exit status unavailable");
    if (result.data) {
      throw new WorkspaceConflictError("Calendar connection changes are stopped for this workspace. Existing reservations remain available for review.");
    }
  } catch (error) {
    if (error instanceof WorkspaceConflictError) throw error;
    throw new WorkspaceConflictError("Workspace exit status is unavailable. Retry before changing the calendar.");
  }
}

function db(): CalendarDb {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Calendar storage is not configured");
  return client as unknown as CalendarDb;
}

function text(row: DbRow, key: string): string {
  return typeof row[key] === "string" ? row[key] as string : "";
}

function optionalText(row: DbRow, key: string): string | undefined {
  const value = text(row, key);
  return value || undefined;
}

function dateOrNull(row: DbRow, key: string): string | null {
  const value = optionalText(row, key);
  return value ?? null;
}

function validTimeZone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    throw new WorkspaceStoreError("The calendar timezone is invalid.");
  }
}

function mapConnection(row: DbRow, includeSecrets = false): CalendarConnectionWithSecrets {
  const reminder = calendarReminderPolicySchema.parse(row.reminder_policy ?? { mode: "off" });
  const value: CalendarConnectionWithSecrets = calendarConnectionSchema.parse({
    id: text(row, "id"),
    workspaceId: text(row, "workspace_id"),
    provider: text(row, "provider"),
    calendarId: text(row, "calendar_id"),
    calendarName: text(row, "calendar_name"),
    timeZone: text(row, "time_zone"),
    status: text(row, "status"),
    scopes: Array.isArray(row.scopes) ? row.scopes.filter((scope): scope is string => typeof scope === "string") : [],
    reminderPolicy: reminder,
    tokenExpiresAt: dateOrNull(row, "token_expires_at"),
    lastCheckedAt: dateOrNull(row, "last_checked_at"),
    lastError: row.last_error == null ? null : text(row, "last_error"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  });
  if (includeSecrets) {
    value.accessToken = decryptSecret(optionalText(row, "access_token_ciphertext")) ?? undefined;
    value.refreshToken = decryptSecret(optionalText(row, "refresh_token_ciphertext")) ?? undefined;
  }
  return value;
}

function mapReceipt(row: DbRow): CalendarEventReceipt {
  return {
    id: text(row, "id"), workspaceId: text(row, "workspace_id"), workId: text(row, "work_id"),
    requestId: text(row, "request_id"), provider: text(row, "provider") as CalendarProvider,
    calendarId: text(row, "calendar_id"), idempotencyKey: text(row, "idempotency_key"),
    externalEventId: optionalText(row, "external_event_id"), operation: text(row, "operation") as CalendarReceiptOperation,
    status: text(row, "status") as CalendarReceiptStatus, revision: Number(row.revision ?? 0), title: text(row, "title"),
    start: text(row, "start_at"), end: text(row, "end_at"), timeZone: text(row, "time_zone"),
    reminderPolicy: calendarReminderPolicySchema.parse(row.reminder_policy ?? { mode: "off" }),
    lastError: optionalText(row, "last_error"), attemptedAt: optionalText(row, "attempted_at"), observedAt: optionalText(row, "observed_at"),
    createdAt: text(row, "created_at"), updatedAt: text(row, "updated_at"),
  };
}

function failure(error: unknown, fallback: string): never {
  const detail = error && typeof error === "object" ? `${(error as { code?: unknown }).code ?? ""} ${(error as { message?: unknown }).message ?? ""}` : "";
  if (detail.includes("workspace_calendar_connections") || detail.includes("workspace_calendar_event_receipts")) {
    throw new WorkspaceStoreError(fallback);
  }
  throw new WorkspaceStoreError(fallback);
}

export async function listWorkspaceCalendarConnections(actor: WorkspaceActor, workspaceId: string): Promise<CalendarConnection[]> {
  await assertWorkspaceMember(actor, workspaceId);
  const { data, error } = await db().from("workspace_calendar_connections").select("*").eq("workspace_id", workspaceId).order("provider");
  if (error) failure(error, "Calendar connections are unavailable.");
  return (Array.isArray(data) ? data : []).map((row: unknown) => mapConnection(row as DbRow));
}

/** Provider credentials change a workspace-wide external system, so only its
 * owner or administrator may bind, reconfigure, or disconnect one. */
export async function assertWorkspaceCalendarManager(actor: WorkspaceActor, workspaceId: string): Promise<void> {
  const { data, error } = await db().from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", actor.userId).maybeSingle();
  if (error) failure(error, "Workspace calendar permissions are unavailable.");
  const role = data && typeof (data as DbRow).role === "string" ? (data as DbRow).role : "";
  if (role !== "owner" && role !== "admin") throw new WorkspaceAccessError("A workspace owner or administrator must manage calendar connections.");
}

/** Server-only credential read. The returned token must never cross an HTTP boundary. */
export async function getWorkspaceCalendarConnection(actor: WorkspaceActor, workspaceId: string, provider: CalendarProvider): Promise<CalendarConnectionWithSecrets | null> {
  await assertWorkspaceMember(actor, workspaceId);
  const connection = await readStoredCalendarConnection(workspaceId, provider);
  if (!connection || connection.status === "revoked" || connection.status === "error") return connection;
  return refreshExpiredCalendarConnection(workspaceId, provider, connection);
}

async function readStoredCalendarConnection(workspaceId: string, provider: CalendarProvider): Promise<CalendarConnectionWithSecrets | null> {
  const { data, error } = await db().from("workspace_calendar_connections").select("*").eq("workspace_id", workspaceId).eq("provider", provider).maybeSingle();
  if (error) failure(error, "Calendar connection is unavailable.");
  return data ? mapConnection(data as DbRow, true) : null;
}

function refreshMessage(error: unknown): string {
  if (error instanceof WorkspaceStoreError) return error.message;
  if (error instanceof Error && error.message.includes("Reconnect")) return error.message;
  return "Calendar token refresh could not be completed. Retry after checking the connection.";
}

async function recordRefreshFailure(workspaceId: string, provider: CalendarProvider, error: unknown, expectedUpdatedAt?: string): Promise<void> {
  try {
    const terminal = error instanceof WorkspaceStoreError
      || (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "unauthorized");
    let query = db().from("workspace_calendar_connections").update({
      status: terminal ? "error" : "connected",
      last_error: refreshMessage(error).slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("workspace_id", workspaceId).eq("provider", provider);
    if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
    await query;
  } catch {
    // Keep the provider error as the request result when status persistence is unavailable.
  }
}

async function persistRefreshedCalendarConnection(
  workspaceId: string,
  provider: CalendarProvider,
  current: CalendarConnectionWithSecrets,
): Promise<CalendarConnectionWithSecrets> {
  if (!current.refreshToken) {
    const error = new WorkspaceStoreError("Calendar authorization has expired. Reconnect the calendar.");
    const latest = await readStoredCalendarConnection(workspaceId, provider);
    if (latest && latest.updatedAt !== current.updatedAt) return latest;
    await recordRefreshFailure(workspaceId, provider, error, current.updatedAt);
    throw error;
  }
  try {
    const tokens = await refreshCalendarOAuthToken(provider, current.refreshToken);
    const refreshToken = tokens.refreshToken ?? current.refreshToken;
    const { data, error } = await db().from("workspace_calendar_connections").update({
      access_token_ciphertext: encryptSecret(tokens.accessToken),
      refresh_token_ciphertext: encryptSecret(refreshToken),
      token_expires_at: tokens.expiresAt ?? null,
      scopes: tokens.scopes.length ? tokens.scopes : current.scopes,
      status: "connected",
      last_error: null,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("workspace_id", workspaceId).eq("provider", provider).eq("updated_at", current.updatedAt).select("*").maybeSingle();
    if (error) failure(error, "Calendar authorization could not be saved.");
    if (!data) {
      const latest = await readStoredCalendarConnection(workspaceId, provider);
      if (latest && latest.updatedAt !== current.updatedAt) return latest;
      throw new WorkspaceStoreError("Calendar connection changed while authorization refreshed. Retry the connection.");
    }
    return mapConnection(data as DbRow, true);
  } catch (error) {
    const latest = await readStoredCalendarConnection(workspaceId, provider).catch(() => null);
    if (latest && latest.updatedAt !== current.updatedAt) return latest;
    await recordRefreshFailure(workspaceId, provider, error, current.updatedAt);
    throw error;
  }
}

async function refreshExpiredCalendarConnection(
  workspaceId: string,
  provider: CalendarProvider,
  connection: CalendarConnectionWithSecrets,
): Promise<CalendarConnectionWithSecrets> {
  const expiresAt = connection.tokenExpiresAt ? Date.parse(connection.tokenExpiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) return connection;
  const key = `${workspaceId}:${provider}`;
  const inFlight = tokenRefreshes.get(key);
  if (inFlight) return inFlight;
  const refresh = persistRefreshedCalendarConnection(workspaceId, provider, connection);
  tokenRefreshes.set(key, refresh);
  try {
    return await refresh;
  } finally {
    if (tokenRefreshes.get(key) === refresh) tokenRefreshes.delete(key);
  }
}

export async function saveWorkspaceCalendarConnection(
  actor: WorkspaceActor,
  workspaceId: string,
  input: CalendarConnectionInput,
  credentials: { accessToken: string; refreshToken?: string; scopes?: string[]; tokenExpiresAt?: string | null },
  status: "authorized" | "connected" = "connected",
): Promise<CalendarConnection> {
  await assertWorkspaceCalendarManager(actor, workspaceId);
  await assertWorkspaceCalendarWriteAllowed(workspaceId);
  const value = calendarConnectionInputSchema.parse(input);
  const timeZone = validTimeZone(value.timeZone);
  if (!credentials.accessToken.trim()) throw new WorkspaceStoreError("Calendar authorization is incomplete.");
  const { data, error } = await db().from("workspace_calendar_connections").upsert({
    workspace_id: workspaceId,
    provider: value.provider,
    calendar_id: value.calendarId,
    calendar_name: value.calendarName,
    time_zone: timeZone,
    status,
    scopes: credentials.scopes ?? [],
    access_token_ciphertext: encryptSecret(credentials.accessToken),
    refresh_token_ciphertext: encryptSecret(credentials.refreshToken),
    token_expires_at: credentials.tokenExpiresAt ?? null,
    reminder_policy: value.reminderPolicy,
    last_error: null,
    last_checked_at: null,
    created_by: actor.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,provider" }).select("*").single();
  if (error || !data) failure(error, "Calendar connection could not be saved.");
  return mapConnection(data as DbRow);
}

export async function configureWorkspaceCalendarConnection(actor: WorkspaceActor, workspaceId: string, input: CalendarConnectionInput): Promise<CalendarConnection> {
  await assertWorkspaceCalendarManager(actor, workspaceId);
  await assertWorkspaceCalendarWriteAllowed(workspaceId);
  const existing = await getWorkspaceCalendarConnection(actor, workspaceId, input.provider);
  if (!existing?.accessToken) throw new WorkspaceStoreError("Connect this calendar before choosing its calendar and timezone.");
  return saveWorkspaceCalendarConnection(actor, workspaceId, input, {
    accessToken: existing.accessToken,
    refreshToken: existing.refreshToken,
    scopes: existing.scopes,
    tokenExpiresAt: existing.tokenExpiresAt,
  });
}

export async function revokeWorkspaceCalendarConnection(actor: WorkspaceActor, workspaceId: string, provider: CalendarProvider): Promise<boolean> {
  await assertWorkspaceCalendarManager(actor, workspaceId);
  const { data, error } = await db().from("workspace_calendar_connections").update({
    status: "revoked", access_token_ciphertext: null, refresh_token_ciphertext: null,
    last_error: "Disconnected by a workspace member.", updated_at: new Date().toISOString(),
  }).eq("workspace_id", workspaceId).eq("provider", provider).select("id");
  if (error) failure(error, "Calendar connection could not be disconnected.");
  return Boolean(Array.isArray(data) && data.length);
}

export async function markWorkspaceCalendarConnectionError(actor: WorkspaceActor, workspaceId: string, provider: CalendarProvider, message: string): Promise<void> {
  await assertWorkspaceCalendarManager(actor, workspaceId);
  const { error } = await db().from("workspace_calendar_connections").update({ status: "error", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("provider", provider);
  if (error) failure(error, "Calendar connection status could not be saved.");
}

export async function readCalendarEventReceipt(actor: WorkspaceActor, workspaceId: string, workId: string, requestId: string, provider: CalendarProvider): Promise<CalendarEventReceipt | null> {
  await assertWorkspaceMember(actor, workspaceId);
  const { data, error } = await db().from("workspace_calendar_event_receipts").select("*").eq("workspace_id", workspaceId).eq("work_id", workId).eq("request_id", requestId).eq("provider", provider).maybeSingle();
  if (error) failure(error, "Calendar sync evidence is unavailable.");
  return data ? mapReceipt(data as DbRow) : null;
}

export async function saveCalendarEventReceipt(actor: WorkspaceActor, receipt: Omit<CalendarEventReceipt, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<CalendarEventReceipt> {
  await assertWorkspaceMember(actor, receipt.workspaceId);
  const payload = {
    ...(receipt.id ? { id: receipt.id } : {}), workspace_id: receipt.workspaceId, work_id: receipt.workId, request_id: receipt.requestId,
    provider: receipt.provider, calendar_id: receipt.calendarId, idempotency_key: receipt.idempotencyKey, external_event_id: receipt.externalEventId ?? null,
    operation: receipt.operation, status: receipt.status, revision: receipt.revision, title: receipt.title, start_at: receipt.start, end_at: receipt.end,
    time_zone: validTimeZone(receipt.timeZone), reminder_policy: receipt.reminderPolicy, last_error: receipt.lastError ?? null,
    attempted_at: receipt.attemptedAt ?? null, observed_at: receipt.observedAt ?? null, updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from("workspace_calendar_event_receipts").upsert(payload, { onConflict: "workspace_id,work_id,request_id,provider" }).select("*").single();
  if (error || !data) failure(error, "Calendar sync evidence could not be saved.");
  return mapReceipt(data as DbRow);
}
