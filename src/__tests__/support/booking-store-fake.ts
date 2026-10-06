import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { BookingStoreDb } from "@/platform/bookings/store";

/**
 * Stand-ins for the one booking store's RPCs (20261008141000_booking_store.sql).
 *
 * `fakeBookingStore` mirrors the SQL rules closely enough to drive the routes:
 * one calendar per tenant stable id, the overlap refusal for held, requested
 * and confirmed rows (imports never refused), idempotency on the legacy id,
 * reservation id or external ref, local dates in each booking's own zone.
 *
 * `psqlBookingStore` calls the real functions on a throwaway cluster (set by
 * scripts/check-workspace-sql.sh through STRELVA_BOOKINGS_PSQL).
 */

export interface FakeTenant {
  stableId: string;
  workspaceId: string | null;
  systemId: string | null;
  paused: boolean;
  phone: string | null;
  hours: { timezone: string; weekly: Array<{ day: number; opens: string; closes: string }>; overrides?: unknown[] } | null;
  services: Array<{ id: string; name: string; durationMinutes: number | null; active: boolean; externalRef: string | null }>;
}

type Row = Record<string, unknown> & {
  id: string; calendarKey: string; status: string; origin: string; start: string; end: string; bufferMinutes: number;
  timeZone: string; legacyId: string | null; publicReservationId: string | null; externalSource: string | null; externalRef: string | null;
};

const HOLDING = new Set(["held", "requested", "confirmed"]);

function local(iso: string, zone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function fakeBookingStore() {
  const tenants = new Map<string, FakeTenant>();
  const settings = new Map<string, Record<string, unknown> & { revision: number }>();
  const rows: Row[] = [];
  const history: Array<{ bookingId: string; actor: string; from: string | null; to: string; reason: string | null }> = [];
  const parity: Array<Record<string, unknown>> = [];
  const state = { down: false, streakDays: 0 };

  function json(row: Row) {
    const start = local(row.start, row.timeZone);
    const end = local(row.end, row.timeZone);
    const slug = [...tenants.entries()].find(([, t]) => t.stableId === row.calendarKey)?.[0] ?? null;
    return { ...row, tenantId: slug, localDate: start.date, localStart: start.time, localEnd: end.time };
  }
  function overlaps(a: Row, b: { start: string; end: string; bufferMinutes: number }): boolean {
    const aEnd = Date.parse(a.end) + a.bufferMinutes * 60_000;
    const bEnd = Date.parse(b.end) + b.bufferMinutes * 60_000;
    return Date.parse(a.start) < bEnd && Date.parse(b.start) < aEnd;
  }
  function holds(row: { status: string; origin: string }) {
    return HOLDING.has(row.status) && row.origin !== "import";
  }
  const fail = (message: string) => ({ data: null, error: { message } });

  const db: BookingStoreDb = {
    rpc(name: string, args: Record<string, unknown>) {
      const run = async () => {
        if (state.down) return fail("connection refused");
        const tenant = tenants.get(String(args.p_tenant_id ?? ""));
        switch (name) {
          case "read_tenant_booking_context": {
            if (!tenant) return { data: null, error: null };
            const s = settings.get(tenant.stableId);
            return { data: { tenantStableId: tenant.stableId, workspaceId: tenant.workspaceId, systemId: tenant.systemId, paused: tenant.paused,
              hours: tenant.hours, phone: tenant.phone, services: tenant.services, settings: s ?? null }, error: null };
          }
          case "upsert_tenant_booking_settings": {
            if (!tenant) return fail("booking_unknown_tenant");
            const prior = settings.get(tenant.stableId);
            const next = { ...(args.p_settings as Record<string, unknown>), revision: (prior?.revision ?? 0) + 1 };
            settings.set(tenant.stableId, next);
            return { data: { status: prior ? "updated" : "recorded", revision: next.revision }, error: null };
          }
          case "record_tenant_booking": {
            if (!tenant) return fail("booking_unknown_tenant");
            const b = args.p_booking as Record<string, unknown>;
            if (!b.start || !b.end || Date.parse(String(b.end)) <= Date.parse(String(b.start))) return fail("booking_invalid");
            const key = tenant.stableId;
            const existing = rows.find((r) => r.calendarKey === key && (
              (b.legacyId && r.legacyId === b.legacyId) || (b.publicReservationId && r.publicReservationId === b.publicReservationId)
              || (b.externalRef && r.externalSource === b.externalSource && r.externalRef === b.externalRef) || (b.id && r.id === b.id)));
            const candidate = { start: String(b.start), end: String(b.end), bufferMinutes: Number(b.bufferMinutes ?? 0) };
            const clash = (self: Row | undefined) => holds({ status: String(b.status), origin: existing?.origin ?? String(b.origin) })
              && rows.some((r) => r !== self && r.calendarKey === key && holds(r) && overlaps(r, candidate));
            const actor = args.p_via === "backfill" ? "migration" : args.p_via === "import" ? "import" : "visitor";
            if (existing) {
              if (existing.status === b.status && existing.start === candidate.start && existing.end === candidate.end) return { data: { status: "unchanged", booking: json(existing) }, error: null };
              if (clash(existing)) return { data: { status: "conflict", booking: null }, error: null };
              const from = existing.status;
              Object.assign(existing, { status: b.status, start: candidate.start, end: candidate.end, bufferMinutes: candidate.bufferMinutes, cancelledAt: b.cancelledAt ?? null });
              if (from !== existing.status) history.push({ bookingId: existing.id, actor, from, to: existing.status, reason: (b.reason as string) ?? null });
              return { data: { status: "updated", booking: json(existing) }, error: null };
            }
            if (!b.legacyId && !b.publicReservationId && !b.externalRef && !b.id) return fail("booking_invalid");
            if (clash(undefined)) return { data: { status: "conflict", booking: null }, error: null };
            const customer = b.customer as { name: string; email?: string; phone?: string };
            const row: Row = {
              id: randomUUID(), calendarKey: key, tenantStableId: key, workspaceId: tenant.workspaceId, systemId: tenant.systemId,
              status: String(b.status), origin: String(b.origin), serviceRef: b.serviceRef ?? null, businessServiceId: null,
              serviceName: b.serviceName, start: candidate.start, end: candidate.end, bufferMinutes: candidate.bufferMinutes,
              timeZone: String(b.timeZone), customer: { ...customer, ...(customer.email ? { email: customer.email.toLowerCase() } : {}) },
              contactId: null, intakeAnswers: b.intakeAnswers ?? {}, inquiryId: b.inquiryId ?? null, legacyId: (b.legacyId as string) ?? null,
              publicReservationId: (b.publicReservationId as string) ?? null, externalSource: (b.externalSource as string) ?? null,
              externalRef: (b.externalRef as string) ?? null, recordedVia: args.p_via, createdAt: b.createdAt ?? new Date().toISOString(),
              cancelledAt: b.cancelledAt ?? null,
            };
            rows.push(row);
            history.push({ bookingId: row.id, actor, from: null, to: row.status, reason: (b.reason as string) ?? null });
            return { data: { status: "recorded", booking: json(row) }, error: null };
          }
          case "set_tenant_booking_status": {
            if (!tenant) return fail("booking_unknown_tenant");
            const row = rows.find((r) => r.calendarKey === tenant.stableId && (r.legacyId === args.p_ref || r.id === args.p_ref));
            if (!row) return { data: { status: "not_found", booking: null }, error: null };
            if (row.status === args.p_status) return { data: { status: "unchanged", booking: json(row) }, error: null };
            if (HOLDING.has(String(args.p_status)) && row.origin !== "import" && rows.some((r) => r !== row && r.calendarKey === row.calendarKey && holds(r) && overlaps(r, row))) {
              return { data: { status: "conflict", booking: json(row) }, error: null };
            }
            history.push({ bookingId: row.id, actor: String(args.p_actor), from: row.status, to: String(args.p_status), reason: (args.p_reason as string) ?? null });
            row.status = String(args.p_status);
            if (row.status === "cancelled") row.cancelledAt = row.cancelledAt ?? new Date().toISOString();
            return { data: { status: "updated", booking: json(row) }, error: null };
          }
          case "read_tenant_bookings": {
            if (!tenant) return { data: [], error: null };
            const list = rows.filter((r) => r.calendarKey === tenant.stableId).map(json)
              .filter((r) => (!args.p_from || r.localDate >= String(args.p_from)) && (!args.p_to || r.localDate <= String(args.p_to)))
              .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
            return { data: list, error: null };
          }
          case "read_workspace_booking_requests":
            return { data: rows.filter((r) => r.workspaceId === args.p_workspace_id && r.status === "requested").map(json), error: null };
          case "decide_workspace_booking_request": {
            const row = rows.find((r) => r.id === args.p_booking_id);
            if (!row || row.workspaceId !== args.p_workspace_id) return fail("booking_not_found");
            if (row.status !== "requested") return { data: { status: "already_decided", booking: json(row) }, error: null };
            const to = args.p_decision === "approve" ? "confirmed" : "declined";
            history.push({ bookingId: row.id, actor: String(args.p_actor), from: "requested", to, reason: null });
            row.status = to;
            return { data: { status: "decided", booking: json(row) }, error: null };
          }
          case "client_record_parity_streak":
            return { data: { store: args.p_store, days: state.streakDays }, error: null };
          case "record_client_record_parity":
            parity.push(args);
            return { data: { ok: args.p_missing === 0 && args.p_mismatched === 0 }, error: null };
          default:
            return fail(`unexpected ${name}`);
        }
      };
      return run();
    },
  };
  return { db, tenants, settings, rows, history, parity, state };
}

const TYPES: Record<string, string> = {
  p_tenant_id: "text", p_booking: "jsonb", p_via: "text", p_ref: "text", p_status: "text", p_actor: "text", p_reason: "text",
  p_from: "date", p_to: "date", p_settings: "jsonb", p_workspace_id: "uuid", p_booking_id: "uuid", p_decision: "text",
  p_store: "text", p_redis_count: "integer", p_postgres_count: "integer", p_missing: "integer", p_mismatched: "integer",
};

/** The real RPCs on a throwaway cluster, through psql. */
export function psqlBookingStore(connection: string): BookingStoreDb & { exec(sql: string): string } {
  const base = [...connection.split(" ").filter(Boolean), "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  return {
    exec(sql) {
      return execFileSync("psql", base, { input: sql, encoding: "utf8" });
    },
    rpc(name, args) {
      const run = async () => {
        const keys = Object.keys(args);
        const vars: string[] = [];
        const params = keys.map((key, i) => {
          const value = args[key];
          if (value === null || value === undefined) return `${key} => null::${TYPES[key] ?? "text"}`;
          vars.push("-v", `a${i}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
          return `${key} => :'a${i}'::${TYPES[key] ?? "text"}`;
        }).join(", ");
        try {
          const out = execFileSync("psql", [...base, ...vars], { input: `select coalesce(to_jsonb(public.${name}(${params})), 'null'::jsonb);\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
          return { data: JSON.parse(out.trim()), error: null };
        } catch (error) {
          return { data: null, error: { message: String((error as { stderr?: string }).stderr ?? error) } };
        }
      };
      return run();
    },
  };
}
