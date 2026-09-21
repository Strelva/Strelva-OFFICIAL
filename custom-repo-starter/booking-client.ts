/**
 * Public native-booking contract for generated client sites.
 *
 * The control plane owns the schedule, provider connection, availability
 * re-check, and provider receipt. A client site receives only published slots
 * and an opaque reservation token; workspace, work, and provider identifiers
 * never cross this boundary.
 */

export type PublicBookingProvider = "outlook" | "google";
export type PublicBookingStatus = "confirmed" | "pending" | "cancelled";

export interface PublicBookingSlot {
  id: string;
  start: string;
  end: string;
}

export interface PublicBookingSchedule {
  schemaVersion: 1;
  capabilityId: string;
  version: number;
  name: string;
  provider: PublicBookingProvider;
  timeZone: string;
  slots: PublicBookingSlot[];
}

export interface PublicBookingReceipt {
  schemaVersion: 1;
  reservationId: string;
  managementToken: string;
  capabilityId: string;
  version: number;
  provider: PublicBookingProvider;
  status: PublicBookingStatus;
  title: string;
  start: string;
  end: string;
  timeZone: string;
}

export interface PublicBookingVisitor {
  name: string;
  email: string;
  message?: string;
}

export interface PublicBookingRange {
  from: string;
  to: string;
}

export interface PublicBookingRequestDraft {
  requestId: string;
  capabilityId: string;
  capabilityVersion: number;
  slotId: string;
  visitor: PublicBookingVisitor;
}

const TENANT_ID = /^[a-z0-9-]+$/;
const TOKEN = /^[A-Za-z0-9._~-]{8,2048}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T/;
const requestDrafts = new Map<string, PublicBookingRequestDraft>();

/** Generate an idempotency key without falling back to predictable entropy. */
export function createBookingRequestId(): string {
  const source = globalThis.crypto;
  if (source && typeof source.randomUUID === "function") {
    try { return `request-${source.randomUUID()}`; } catch { /* try the byte source below */ }
  }
  if (source && typeof source.getRandomValues === "function") {
    try {
      const bytes = new Uint8Array(16);
      source.getRandomValues(bytes);
      return `request-${Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("")}`;
    } catch { /* fail closed below */ }
  }
  throw new Error("Booking requests require a secure random source. Please use a modern browser and try again.");
}

export function bookingRequestStorageKey(baseUrl: string, tenant: string, capabilityId: string): string {
  return `strelva:booking:request:${[baseUrl.trim().replace(/\/$/, ""), tenant, capabilityId].map(encodeURIComponent).join(":")}`;
}

function requestStorage(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === "undefined" ? null : globalThis.sessionStorage;
  } catch { return null; }
}

function validVisitor(value: unknown): value is PublicBookingVisitor {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.email !== "string") return false;
  return value.message === undefined || typeof value.message === "string";
}

function validRequestDraft(value: unknown): value is PublicBookingRequestDraft {
  return isRecord(value) && typeof value.requestId === "string" && TOKEN.test(value.requestId) &&
    typeof value.capabilityId === "string" && value.capabilityId.length > 0 &&
    Number.isSafeInteger(value.capabilityVersion) && Number(value.capabilityVersion) > 0 &&
    typeof value.slotId === "string" && TOKEN.test(value.slotId) && validVisitor(value.visitor) &&
    Boolean(value.visitor.name.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.visitor.email.trim().toLowerCase());
}

export function readBookingRequestDraft(key: string): PublicBookingRequestDraft | null {
  const storage = requestStorage();
  try {
    const raw = storage?.getItem(key);
    if (raw && storage) {
      const parsed: unknown = JSON.parse(raw);
      if (validRequestDraft(parsed)) return parsed;
      storage.removeItem(key);
    }
  } catch { /* use the in-memory fallback when browser storage is unavailable */ }
  return requestDrafts.get(key) ?? null;
}

export function writeBookingRequestDraft(key: string, draft: PublicBookingRequestDraft): void {
  requestDrafts.set(key, draft);
  try { requestStorage()?.setItem(key, JSON.stringify(draft)); } catch { /* memory keeps the retry alive for this page */ }
}

export function clearBookingRequestDraft(key: string): void {
  requestDrafts.delete(key);
  try { requestStorage()?.removeItem(key); } catch { /* already clear in memory */ }
}

export function sameBookingRequest(draft: PublicBookingRequestDraft, input: { slotId: string; capabilityVersion?: number; visitor: PublicBookingVisitor }): boolean {
  const previous = visitorBody(draft.visitor);
  const current = visitorBody(input.visitor);
  return draft.slotId === input.slotId &&
    (input.capabilityVersion === undefined || draft.capabilityVersion === input.capabilityVersion) &&
    previous.name === current.name && previous.email === current.email &&
    (previous.message ?? "") === (current.message ?? "");
}

function endpoint(baseUrl: string, tenant: string, suffix = ""): string {
  if (!TENANT_ID.test(tenant)) throw new Error("Invalid business identifier.");
  const base = baseUrl.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) throw new Error("Invalid booking service URL.");
  return `${base}/api/v1/bookings/${encodeURIComponent(tenant)}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every(key => allowed.has(key));
}

function isProvider(value: unknown): value is PublicBookingProvider {
  return value === "outlook" || value === "google";
}

function isSlot(value: unknown): value is PublicBookingSlot {
  if (!isRecord(value) || !exactKeys(value, ["id", "start", "end"]) || typeof value.id !== "string" || !TOKEN.test(value.id)) return false;
  return typeof value.start === "string" && ISO.test(value.start) &&
    typeof value.end === "string" && ISO.test(value.end) && Date.parse(value.end) > Date.parse(value.start);
}

/** Validate the published schedule before rendering visitor controls. */
export function isPublicBookingSchedule(value: unknown): value is PublicBookingSchedule {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "capabilityId", "version", "name", "provider", "timeZone", "slots"]) || value.schemaVersion !== 1 || typeof value.capabilityId !== "string" || !value.capabilityId ||
    !Number.isSafeInteger(value.version) || Number(value.version) < 1 || typeof value.name !== "string" ||
    !isProvider(value.provider) || typeof value.timeZone !== "string" || !value.timeZone ||
    !Array.isArray(value.slots) || value.slots.length > 500) return false;
  return value.slots.every(isSlot);
}

/** Validate a safe receipt returned after the provider readback decision. */
export function isPublicBookingReceipt(value: unknown): value is PublicBookingReceipt {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "reservationId", "managementToken", "capabilityId", "version", "provider", "status", "title", "start", "end", "timeZone"]) || value.schemaVersion !== 1 || typeof value.reservationId !== "string" || !TOKEN.test(value.reservationId) ||
    typeof value.managementToken !== "string" || !TOKEN.test(value.managementToken) || typeof value.capabilityId !== "string" ||
    !Number.isSafeInteger(value.version) || Number(value.version) < 1 || !isProvider(value.provider) ||
    !["confirmed", "pending", "cancelled"].includes(String(value.status)) || typeof value.title !== "string" ||
    typeof value.start !== "string" || !ISO.test(value.start) || typeof value.end !== "string" || !ISO.test(value.end) ||
    Date.parse(value.end) <= Date.parse(value.start) || typeof value.timeZone !== "string" || !value.timeZone) return false;
  return true;
}

function visitorBody(visitor: PublicBookingVisitor): Record<string, string> {
  const name = visitor.name.trim().slice(0, 160);
  const email = visitor.email.trim().toLowerCase().slice(0, 320);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter your name and a valid email address.");
  return { name, email, ...(visitor.message?.trim() ? { message: visitor.message.trim().slice(0, 2000) } : {}) };
}

async function readResponse(response: Response, fallback: string): Promise<Record<string, unknown>> {
  let body: unknown = null;
  try { body = await response.json(); } catch { /* use the stable fallback below */ }
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : fallback;
    throw new Error(message);
  }
  if (!isRecord(body)) throw new Error(fallback);
  return body;
}

function receiptFrom(body: Record<string, unknown>): PublicBookingReceipt {
  const receipt = body.receipt ?? body.reservation ?? body;
  if (!isPublicBookingReceipt(receipt)) throw new Error("The booking service returned an incomplete receipt.");
  return receipt;
}

export async function loadBookingSchedule(
  baseUrl: string,
  tenant: string,
  capabilityId: string,
  range: PublicBookingRange,
  signal?: AbortSignal,
): Promise<PublicBookingSchedule> {
  const url = new URL(endpoint(baseUrl, tenant));
  url.searchParams.set("capabilityId", capabilityId);
  url.searchParams.set("from", range.from);
  url.searchParams.set("to", range.to);
  const response = await fetch(url, { credentials: "omit", cache: "no-store", signal });
  const body = await readResponse(response, "Booking availability is unavailable. Please try again.");
  if (!isPublicBookingSchedule(body)) throw new Error("This booking schedule could not be loaded.");
  return body;
}

export async function reserveBooking(
  baseUrl: string,
  tenant: string,
  schedule: Pick<PublicBookingSchedule, "capabilityId" | "version">,
  slot: Pick<PublicBookingSlot, "id">,
  visitor: PublicBookingVisitor,
  options: { requestId?: string } = {},
): Promise<PublicBookingReceipt> {
  const requestId = options.requestId?.trim();
  if (requestId !== undefined && !TOKEN.test(requestId)) throw new Error("The booking request could not be identified. Please try again.");
  const response = await fetch(endpoint(baseUrl, tenant, "/reservations"), {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capabilityId: schedule.capabilityId, capabilityVersion: schedule.version, slotId: slot.id, visitor: visitorBody(visitor), ...(requestId ? { requestId } : {}) }),
  });
  return receiptFrom(await readResponse(response, "That time could not be reserved. Please choose another time."));
}

export async function changeBooking(
  baseUrl: string,
  tenant: string,
  receipt: Pick<PublicBookingReceipt, "reservationId" | "managementToken" | "capabilityId" | "version">,
  slot: Pick<PublicBookingSlot, "id">,
): Promise<PublicBookingReceipt> {
  const response = await fetch(endpoint(baseUrl, tenant, `/reservations/${encodeURIComponent(receipt.reservationId)}`), {
    method: "PATCH",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managementToken: receipt.managementToken, capabilityId: receipt.capabilityId, capabilityVersion: receipt.version, slotId: slot.id }),
  });
  return receiptFrom(await readResponse(response, "That time could not be changed. Please choose another time."));
}

export async function cancelBooking(
  baseUrl: string,
  tenant: string,
  receipt: Pick<PublicBookingReceipt, "reservationId" | "managementToken">,
): Promise<PublicBookingReceipt> {
  const response = await fetch(endpoint(baseUrl, tenant, `/reservations/${encodeURIComponent(receipt.reservationId)}`), {
    method: "DELETE",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managementToken: receipt.managementToken }),
  });
  return receiptFrom(await readResponse(response, "This booking could not be cancelled. Please try again."));
}

/** Re-read an ambiguous provider result without repeating a write. */
export async function readBookingStatus(
  baseUrl: string,
  tenant: string,
  receipt: Pick<PublicBookingReceipt, "reservationId" | "managementToken">,
): Promise<PublicBookingReceipt> {
  const response = await fetch(endpoint(baseUrl, tenant, `/reservations/${encodeURIComponent(receipt.reservationId)}/readback`), {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ managementToken: receipt.managementToken }),
  });
  return receiptFrom(await readResponse(response, "This booking status could not be checked. Please try again."));
}
