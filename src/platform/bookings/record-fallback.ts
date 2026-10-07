/** One-hour cache of record facts only. Routing, pause and booking policy are
 * always reread; a store failure never becomes permission to take a booking. */
import { getRedis } from "@/platform/infra/redis";
import { alertOnce } from "@/platform/infra/monitoring";
import type { BookingContext } from "./store";

export const BOOKING_RECORD_CACHE_MS = 60 * 60 * 1000;
type Facts = Pick<BookingContext, "hours" | "services" | "phone">;
type Snapshot = { at: number; facts: Facts };
type Policy = Pick<BookingContext, "tenantStableId" | "workspaceId" | "systemId" | "paused" | "settings" | "servicePolicies">;
export interface BookingRecordFallbackPorts {
  now(): number;
  get(key: string): Promise<unknown>;
  set(key: string, snapshot: Snapshot): Promise<void>;
  alert(tenant: string): Promise<void>;
}
const memory = new Map<string, Snapshot>();
export function resetBookingRecordCache() { memory.clear(); }
const keyFor = (context: Policy) => `reb:booking:record:${context.tenantStableId}:${context.workspaceId ?? "none"}`;
const defaults: BookingRecordFallbackPorts = {
  now: () => Date.now(),
  async get(key) { return getRedis()?.get(key) ?? null; },
  async set(key, snapshot) { await getRedis()?.set(key, snapshot, { ex: 3600 }); },
  async alert(tenant) { await alertOnce("booking_record_unreadable", "high", { tenant }, 3600); },
};

export function bookingRecordFallbackEnabled(env: Partial<Record<string, string | undefined>> = process.env) {
  return env.STRELVA_BOOKING_RECORD_FALLBACK === "1" && env.STRELVA_BOOKING_STORE_WRITE === "1"
    && env.DUAL_WRITE_PG !== "0" && env.DUAL_WRITE_PG !== "false";
}
export async function cacheBookingRecord(context: BookingContext, ports = defaults) {
  const key = keyFor(context);
  const snapshot: Snapshot = { at: ports.now(), facts: structuredClone({ hours: context.hours, services: context.services, phone: context.phone }) };
  if (memory.size >= 512) memory.delete(memory.keys().next().value!);
  memory.set(key, snapshot);
  await ports.set(key, snapshot).catch(() => undefined);
}

/** Caller must have read a fresh policy successfully from the one store. */
export async function cachedBookingRecord(tenant: string, policy: Policy, ports = defaults): Promise<BookingContext | null> {
  await ports.alert(tenant).catch(() => undefined);
  const key = keyFor(policy);
  const raw = memory.get(key) ?? await ports.get(key).catch(() => null);
  if (!raw || typeof raw !== "object") return null;
  const snapshot = raw as Partial<Snapshot>;
  if (typeof snapshot.at !== "number" || snapshot.at > ports.now() || ports.now() - snapshot.at >= BOOKING_RECORD_CACHE_MS
    || !snapshot.facts || !Array.isArray(snapshot.facts.services)
    || !(snapshot.facts.phone === null || typeof snapshot.facts.phone === "string")
    || !(snapshot.facts.hours === null || (typeof snapshot.facts.hours.timezone === "string" && Array.isArray(snapshot.facts.hours.weekly)))
    || snapshot.facts.services.some(s => !s || typeof s.id !== "string" || typeof s.name !== "string" || typeof s.active !== "boolean")) {
    memory.delete(key);
    return null;
  }
  return { ...policy, ...structuredClone(snapshot.facts) };
}
