/**
 * The one booking store (20261008141000_booking_store.sql): typed, bounded
 * calls to its service-role functions. Nothing here decides which store a
 * route reads; see flags.ts and src/lib/storage/booking-store.ts.
 */
import { getSupabase } from "@/platform/infra/db/client";

export const BOOKING_STORE_TIMEOUT_MS = 2000;

export const STORE_BOOKING_STATUSES = ["held", "requested", "confirmed", "cancelled", "declined", "no_show", "completed"] as const;
export type StoreBookingStatus = (typeof STORE_BOOKING_STATUSES)[number];
export type StoreBookingOrigin = "site" | "inquiry" | "agent" | "owner" | "import" | "legacy";
export type StoreBookingVia = "dual_write" | "repair" | "backfill" | "native" | "import";
export type StoreBookingActor = "visitor" | "owner" | "member" | "strelva" | "import" | "migration" | "system";
/** Statuses that hold a slot (the exclusion constraint's set). */
export const SLOT_HOLDING_STATUSES: ReadonlySet<StoreBookingStatus> = new Set(["held", "requested", "confirmed"]);

export interface StoreBooking {
  id: string;
  calendarKey: string;
  tenantStableId: string | null;
  /** The tenant's current slug (null once the tenant row is gone). */
  tenantId: string | null;
  workspaceId: string | null;
  systemId: string | null;
  status: StoreBookingStatus;
  origin: StoreBookingOrigin;
  serviceRef: string | null;
  businessServiceId: string | null;
  serviceName: string;
  start: string;
  end: string;
  bufferMinutes: number;
  timeZone: string;
  localDate: string;
  localStart: string;
  localEnd: string;
  customer: { name: string; email?: string; phone?: string };
  contactId: string | null;
  intakeAnswers: Record<string, string>;
  inquiryId: string | null;
  legacyId: string | null;
  publicReservationId: string | null;
  externalSource: string | null;
  externalRef: string | null;
  recordedVia: string;
  createdAt: string;
  cancelledAt: string | null;
}

/** What a caller sends to record one booking. One of the four identities is required. */
export interface StoreBookingInput {
  id?: string;
  legacyId?: string;
  publicReservationId?: string;
  externalSource?: "calendly";
  externalRef?: string;
  status: StoreBookingStatus;
  origin: StoreBookingOrigin;
  serviceRef?: string;
  serviceName: string;
  start: string;
  end: string;
  bufferMinutes: number;
  timeZone: string;
  customer: { name: string; email?: string; phone?: string };
  intakeAnswers?: Record<string, string>;
  inquiryId?: string;
  requestFingerprint?: string;
  createdAt?: string;
  cancelledAt?: string;
  reason?: string;
}

export interface BookingSettings {
  mode: "instant" | "request";
  bufferMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  defaultLengthMinutes: number;
  maxPerDay: number | null;
  timezone: string;
  bookableHours: Array<{ day: number; opens: string; closes: string }> | null;
  bookableOverrides: Array<{ date: string; closed: boolean; opens?: string; closes?: string; label?: string }> | null;
  legacyRequiresPayment: boolean;
  revision?: number;
}

export interface RecordHours {
  timezone: string;
  weekly: Array<{ day: number; opens: string; closes: string }>;
  overrides?: Array<{ date: string; closed: boolean; opens?: string; closes?: string; label?: string }>;
}

export interface RecordService {
  id: string;
  name: string;
  durationMinutes: number | null;
  active: boolean;
  externalRef: string | null;
}

/** Everything a booking route needs about the business, read at use. */
export interface BookingContext {
  tenantStableId: string;
  workspaceId: string | null;
  systemId: string | null;
  paused: boolean;
  hours: RecordHours | null;
  phone: string | null;
  services: RecordService[];
  settings: BookingSettings | null;
}

export class BookingStoreError extends Error {
  constructor(
    readonly code: "unconfigured" | "timeout" | "unknown_tenant" | "invalid" | "not_found" | "failed" | "hours_need_record" | "hours_outside_record",
    message?: string,
  ) {
    super(message ?? `booking_store_${code}`);
    this.name = "BookingStoreError";
  }
}

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
type RpcCall = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
export type BookingStoreDb = { rpc(name: string, args: Record<string, unknown>): RpcCall };

let override: { db: BookingStoreDb | null } | null = null;
/** Tests and scripts may supply their own client (null = unconfigured). */
export function setBookingStoreDb(db: BookingStoreDb | null | undefined): void {
  override = db === undefined ? null : { db };
}
export function bookingStoreDb(): BookingStoreDb | null {
  if (override) return override.db;
  try {
    return getSupabase() as unknown as BookingStoreDb | null;
  } catch {
    return null;
  }
}

async function call<T>(name: string, args: Record<string, unknown>, db: BookingStoreDb | null = bookingStoreDb()): Promise<T> {
  if (!db) throw new BookingStoreError("unconfigured");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const builder = db.rpc(name, args);
  const request = typeof builder.abortSignal === "function" ? builder.abortSignal(controller.signal) : builder;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, BOOKING_STORE_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([Promise.resolve(request), timeout]);
    if (outcome === "timeout") throw new BookingStoreError("timeout");
    if (outcome.error) {
      const detail = `${outcome.error.code ?? ""} ${outcome.error.message ?? ""}`;
      if (detail.includes("booking_unknown_tenant")) throw new BookingStoreError("unknown_tenant");
      if (detail.includes("booking_invalid")) throw new BookingStoreError("invalid");
      if (detail.includes("booking_not_found")) throw new BookingStoreError("not_found");
      if (detail.includes("booking_hours_need_record")) throw new BookingStoreError("hours_need_record");
      if (detail.includes("booking_hours_outside_record")) throw new BookingStoreError("hours_outside_record");
      throw new BookingStoreError("failed", detail.trim() || "booking_store_failed");
    }
    return outcome.data as T;
  } catch (error) {
    if (error instanceof BookingStoreError) throw error;
    throw new BookingStoreError(error instanceof Error && error.name === "AbortError" ? "timeout" : "failed");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function parseStoreBooking(raw: unknown): StoreBooking | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.start !== "string" || typeof r.end !== "string" || typeof r.status !== "string") return null;
  if (!(STORE_BOOKING_STATUSES as readonly string[]).includes(r.status)) return null;
  const customer = (r.customer && typeof r.customer === "object" ? r.customer : {}) as Record<string, unknown>;
  const answers = r.intakeAnswers && typeof r.intakeAnswers === "object" && !Array.isArray(r.intakeAnswers)
    ? Object.fromEntries(Object.entries(r.intakeAnswers as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>
    : {};
  return {
    id: r.id,
    calendarKey: String(r.calendarKey ?? ""),
    tenantStableId: text(r.tenantStableId),
    tenantId: text(r.tenantId),
    workspaceId: text(r.workspaceId),
    systemId: text(r.systemId),
    status: r.status as StoreBookingStatus,
    origin: String(r.origin) as StoreBookingOrigin,
    serviceRef: text(r.serviceRef),
    businessServiceId: text(r.businessServiceId),
    serviceName: String(r.serviceName ?? ""),
    start: r.start,
    end: r.end,
    bufferMinutes: Number(r.bufferMinutes) || 0,
    timeZone: String(r.timeZone ?? "UTC"),
    localDate: String(r.localDate ?? ""),
    localStart: String(r.localStart ?? ""),
    localEnd: String(r.localEnd ?? ""),
    customer: {
      name: String(customer.name ?? ""),
      ...(typeof customer.email === "string" ? { email: customer.email } : {}),
      ...(typeof customer.phone === "string" ? { phone: customer.phone } : {}),
    },
    contactId: text(r.contactId),
    intakeAnswers: answers,
    inquiryId: text(r.inquiryId),
    legacyId: text(r.legacyId),
    publicReservationId: text(r.publicReservationId),
    externalSource: text(r.externalSource),
    externalRef: text(r.externalRef),
    recordedVia: String(r.recordedVia ?? ""),
    createdAt: String(r.createdAt ?? ""),
    cancelledAt: text(r.cancelledAt),
  };
}

function parseSettings(raw: unknown): BookingSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    mode: r.mode === "request" ? "request" : "instant",
    bufferMinutes: Number(r.bufferMinutes ?? 15),
    minNoticeMinutes: Number(r.minNoticeMinutes ?? 240),
    maxAdvanceDays: Number(r.maxAdvanceDays ?? 60),
    defaultLengthMinutes: Number(r.defaultLengthMinutes ?? 60),
    maxPerDay: r.maxPerDay === null || r.maxPerDay === undefined ? null : Number(r.maxPerDay),
    timezone: typeof r.timezone === "string" ? r.timezone : "America/New_York",
    bookableHours: Array.isArray(r.bookableHours) ? (r.bookableHours as BookingSettings["bookableHours"]) : null,
    bookableOverrides: Array.isArray(r.bookableOverrides) ? (r.bookableOverrides as BookingSettings["bookableOverrides"]) : null,
    legacyRequiresPayment: r.legacyRequiresPayment === true,
    ...(typeof r.revision === "number" ? { revision: r.revision } : {}),
  };
}

function parseHours(raw: unknown): RecordHours | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.timezone !== "string" || !Array.isArray(r.weekly)) return null;
  return {
    timezone: r.timezone,
    weekly: (r.weekly as RecordHours["weekly"]).filter((w) => w && typeof w.day === "number" && typeof w.opens === "string" && typeof w.closes === "string"),
    ...(Array.isArray(r.overrides) ? { overrides: r.overrides as RecordHours["overrides"] } : {}),
  };
}

export async function readBookingContext(tenant: string, db?: BookingStoreDb | null): Promise<BookingContext | null> {
  const data = await call<Record<string, unknown> | null>("read_tenant_booking_context", { p_tenant_id: tenant }, db);
  if (!data || typeof data !== "object" || typeof data.tenantStableId !== "string") return null;
  const services = Array.isArray(data.services) ? data.services : [];
  return {
    tenantStableId: data.tenantStableId,
    workspaceId: text(data.workspaceId),
    systemId: text(data.systemId),
    paused: data.paused === true,
    hours: parseHours(data.hours),
    phone: typeof data.phone === "string" ? data.phone : null,
    services: services
      .map((s) => s as Record<string, unknown>)
      .filter((s) => typeof s.id === "string" && typeof s.name === "string")
      .map((s) => ({
        id: String(s.id),
        name: String(s.name),
        durationMinutes: typeof s.durationMinutes === "number" ? s.durationMinutes : null,
        active: s.active !== false,
        externalRef: text(s.externalRef),
      })),
    settings: parseSettings(data.settings),
  };
}

export type RecordBookingResult =
  | { status: "recorded" | "updated" | "unchanged"; booking: StoreBooking }
  | { status: "conflict" };

export async function recordBooking(tenant: string, input: StoreBookingInput, via: StoreBookingVia, db?: BookingStoreDb | null): Promise<RecordBookingResult> {
  const data = await call<{ status?: string; booking?: unknown }>("record_tenant_booking", { p_tenant_id: tenant, p_booking: input, p_via: via }, db);
  if (data?.status === "conflict") return { status: "conflict" };
  const booking = parseStoreBooking(data?.booking);
  if (!booking || (data?.status !== "recorded" && data?.status !== "updated" && data?.status !== "unchanged")) {
    throw new BookingStoreError("failed", "booking_store_unexpected_response");
  }
  return { status: data.status, booking };
}

export type SetStatusResult =
  | { status: "updated" | "unchanged"; booking: StoreBooking }
  | { status: "not_found" }
  | { status: "conflict" };

export async function setBookingStatus(
  tenant: string,
  ref: string,
  status: StoreBookingStatus,
  actor: StoreBookingActor,
  reason: string | null,
  db?: BookingStoreDb | null,
): Promise<SetStatusResult> {
  const data = await call<{ status?: string; booking?: unknown }>("set_tenant_booking_status", {
    p_tenant_id: tenant, p_ref: ref, p_status: status, p_actor: actor, p_reason: reason,
  }, db);
  if (data?.status === "not_found") return { status: "not_found" };
  if (data?.status === "conflict") return { status: "conflict" };
  const booking = parseStoreBooking(data?.booking);
  if (!booking || (data?.status !== "updated" && data?.status !== "unchanged")) throw new BookingStoreError("failed", "booking_store_unexpected_response");
  return { status: data.status, booking };
}

/** Bookings whose local start date is in [from, to] (YYYY-MM-DD, both optional), oldest first. */
export async function readTenantBookings(tenant: string, range?: { from?: string; to?: string }, db?: BookingStoreDb | null): Promise<StoreBooking[]> {
  const data = await call<unknown>("read_tenant_bookings", { p_tenant_id: tenant, p_from: range?.from ?? null, p_to: range?.to ?? null }, db);
  if (!Array.isArray(data)) throw new BookingStoreError("failed", "booking_store_malformed");
  return data.map(parseStoreBooking).filter((b): b is StoreBooking => Boolean(b));
}

export async function upsertBookingSettings(tenant: string, settings: Partial<BookingSettings>, via: StoreBookingVia, db?: BookingStoreDb | null): Promise<{ status: "recorded" | "updated"; revision: number }> {
  const data = await call<{ status?: string; revision?: number }>("upsert_tenant_booking_settings", { p_tenant_id: tenant, p_settings: settings, p_via: via }, db);
  if ((data?.status !== "recorded" && data?.status !== "updated") || typeof data.revision !== "number") throw new BookingStoreError("failed", "booking_store_unexpected_response");
  return { status: data.status, revision: data.revision };
}

export async function readWorkspaceBookingRequests(workspaceId: string, db?: BookingStoreDb | null): Promise<StoreBooking[]> {
  const data = await call<unknown>("read_workspace_booking_requests", { p_workspace_id: workspaceId }, db);
  if (!Array.isArray(data)) throw new BookingStoreError("failed", "booking_store_malformed");
  return data.map(parseStoreBooking).filter((b): b is StoreBooking => Boolean(b));
}

export async function decideBookingRequest(
  workspaceId: string,
  bookingId: string,
  decision: "approve" | "not_yet",
  actor: "owner" | "member",
  db?: BookingStoreDb | null,
): Promise<{ status: "decided" | "already_decided"; booking: StoreBooking }> {
  const data = await call<{ status?: string; booking?: unknown }>("decide_workspace_booking_request", {
    p_workspace_id: workspaceId, p_booking_id: bookingId, p_decision: decision, p_actor: actor,
  }, db);
  const booking = parseStoreBooking(data?.booking);
  if (!booking || (data?.status !== "decided" && data?.status !== "already_decided")) throw new BookingStoreError("failed", "booking_store_unexpected_response");
  return { status: data.status, booking };
}

// --- After a booking is taken (20261009110000_booking_lifecycle.sql) ---------------

export type BookingMessageKind = "reminder_24h" | "reminder_2h" | "request_owner_reminder" | "request_lapsed";
export type BookingMessageStatus = "sent" | "suppressed" | "failed" | "skipped";

export interface ClaimedBookingMessage {
  messageId: string;
  kind: BookingMessageKind;
  booking: StoreBooking;
}

const MESSAGE_KINDS: ReadonlySet<string> = new Set(["reminder_24h", "reminder_2h", "request_owner_reminder", "request_lapsed"]);

/** Claim every message due at `now` (at most `limit`). Each is claimed once, ever. */
export async function claimBookingMessages(now: Date, limit: number, db?: BookingStoreDb | null): Promise<ClaimedBookingMessage[]> {
  const data = await call<unknown>("claim_booking_messages", { p_now: now.toISOString(), p_limit: limit }, db);
  if (!Array.isArray(data)) throw new BookingStoreError("failed", "booking_store_malformed");
  return data.flatMap((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const booking = parseStoreBooking(r.booking);
    if (typeof r.messageId !== "string" || typeof r.kind !== "string" || !MESSAGE_KINDS.has(r.kind) || !booking) return [];
    return [{ messageId: r.messageId, kind: r.kind as BookingMessageKind, booking }];
  });
}

/** Record what the send path returned. A message finishes once. */
export async function finishBookingMessage(
  messageId: string,
  status: BookingMessageStatus,
  providerMessageId: string | null,
  detail: string | null,
  db?: BookingStoreDb | null,
): Promise<"finished" | "not_claimed"> {
  const data = await call<{ status?: string }>("finish_booking_message", {
    p_message_id: messageId, p_status: status, p_provider_message_id: providerMessageId, p_detail: detail,
  }, db);
  return data?.status === "finished" ? "finished" : "not_claimed";
}

/** The hold sweep: holds a customer has not confirmed in 15 minutes are released. */
export async function expireBookingHolds(now: Date, db?: BookingStoreDb | null): Promise<number> {
  const data = await call<{ expired?: unknown }>("expire_booking_holds", { p_now: now.toISOString() }, db);
  return Number(data?.expired ?? 0) || 0;
}

/** The request's own 72-hour clock. Returns the lapsed (declined) bookings and their customer message claim. */
export async function lapseBookingRequests(now: Date, limit: number, db?: BookingStoreDb | null): Promise<Array<{ messageId: string | null; booking: StoreBooking }>> {
  const data = await call<unknown>("lapse_booking_requests", { p_now: now.toISOString(), p_limit: limit }, db);
  if (!Array.isArray(data)) throw new BookingStoreError("failed", "booking_store_malformed");
  return data.flatMap((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const booking = parseStoreBooking(r.booking);
    return booking ? [{ messageId: typeof r.messageId === "string" ? r.messageId : null, booking }] : [];
  });
}

export interface BookingLastChange {
  actor: string;
  from: string | null;
  to: string;
  reason: string | null;
}

/** One booking of one business with why it last changed, or null (also for another business's booking). */
export async function readWorkspaceBooking(
  workspaceId: string,
  bookingId: string,
  db?: BookingStoreDb | null,
): Promise<(StoreBooking & { lastChange: BookingLastChange | null }) | null> {
  const data = await call<Record<string, unknown> | null>("read_workspace_booking", { p_workspace_id: workspaceId, p_booking_id: bookingId }, db);
  const booking = parseStoreBooking(data);
  if (!booking) return null;
  const last = data?.lastChange && typeof data.lastChange === "object" ? data.lastChange as Record<string, unknown> : null;
  return {
    ...booking,
    lastChange: last && typeof last.to === "string"
      ? { actor: String(last.actor ?? ""), from: text(last.from), to: last.to, reason: text(last.reason) }
      : null,
  };
}

export interface ManagedReservation {
  tenantId: string;
  siteName: string;
  reservationId: string;
  capabilityId: string;
  capabilityVersion: number;
  title: string;
  start: string;
  end: string;
  timeZone: string;
  status: "pending" | "confirmed" | "cancelled";
}

/** The receipt a manage link's token belongs to, found by the token's hash alone. */
export async function readReservationByManageTokenHash(tokenHash: string, db?: BookingStoreDb | null): Promise<ManagedReservation | null> {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
  const data = await call<Record<string, unknown> | null>("read_public_booking_by_manage_token", { p_token_hash: tokenHash }, db);
  if (!data || typeof data.tenantId !== "string" || typeof data.reservationId !== "string" || typeof data.start !== "string" || typeof data.end !== "string") {
    return null;
  }
  const status = data.status === "confirmed" || data.status === "cancelled" ? data.status : "pending";
  return {
    tenantId: data.tenantId,
    siteName: typeof data.siteName === "string" ? data.siteName : "",
    reservationId: data.reservationId,
    capabilityId: String(data.capabilityId ?? ""),
    capabilityVersion: Number(data.capabilityVersion) || 0,
    title: String(data.title ?? "Booking"),
    start: data.start,
    end: data.end,
    timeZone: String(data.timeZone ?? "UTC"),
    status,
  };
}

export interface WorkspaceScheduleReservationInput {
  workId: string;
  requestId: string;
  status: "confirmed" | "cancelled";
  title: string;
  start: string;
  end: string;
  timeZone: string;
}

/** Copy one schedule reservation made in the workspace (no public receipt) into the one store. */
export async function recordWorkspaceBooking(
  workspaceId: string,
  input: WorkspaceScheduleReservationInput,
  via: "backfill" | "repair" | "native",
  db?: BookingStoreDb | null,
): Promise<RecordBookingResult> {
  const data = await call<{ status?: string; booking?: unknown }>("record_workspace_booking", { p_workspace_id: workspaceId, p_booking: input, p_via: via }, db);
  if (data?.status === "conflict") return { status: "conflict" };
  const booking = parseStoreBooking(data?.booking);
  if (!booking || (data?.status !== "recorded" && data?.status !== "updated" && data?.status !== "unchanged")) {
    throw new BookingStoreError("failed", "booking_store_unexpected_response");
  }
  return { status: data.status, booking };
}

/** Booking-only hours for one site of this business. Narrowing only; null clears the narrowing. */
export async function setTenantBookingHours(
  workspaceId: string,
  tenant: string,
  hours: Array<{ day: number; opens: string; closes: string }> | null,
  db?: BookingStoreDb | null,
): Promise<{ revision: number }> {
  const data = await call<{ status?: string; revision?: unknown }>("set_tenant_booking_hours", { p_workspace_id: workspaceId, p_tenant_id: tenant, p_hours: hours }, db);
  if (data?.status !== "updated") throw new BookingStoreError("failed", "booking_store_unexpected_response");
  return { revision: Number(data.revision) || 0 };
}
