import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";
import { fakeBookingStore, psqlBookingStore, type FakeTenant } from "./support/booking-store-fake";

// The one booking store (Reborn §2, bookings spec "Bookings in the 1.0.0
// model"), driven through the real legacy routes (`/api/booking`,
// `/api/booking/availability`, `/api/booking/[id]`), the real public booking
// service behind `/api/v1/bookings` and the real store client. Only the edges
// are doubles: Redis, the legacy dev store, tenant routing, email, and the
// database (an in-memory stand-in, or the real functions on a throwaway
// cluster when STRELVA_BOOKINGS_PSQL is set by scripts/check-workspace-sql.sh).

const redis = makeRedisMock();
const devStore = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const h = vi.hoisted(() => ({
  tenant: "t1",
  services: [{ id: "svc-consult", name: "Consultation", duration: "30" }] as Array<{ id: string; name: string; duration: string; comingSoon?: boolean }>,
  sendBookingConfirmation: vi.fn(),
  sendNewBookingOwnerEmail: vi.fn(),
  alertOnce: vi.fn(),
  logActivity: vi.fn(),
  addEvent: vi.fn(),
}));

vi.mock("@/platform/infra/redis", () => ({ getRedis: () => redis }));
vi.mock("@/lib/events", () => ({ addEvent: h.addEvent }));
vi.mock("@/lib/storage/core", () => ({
  DEFAULT_TENANT: "demo",
  readDevContent: async (tenant: string) => ({ ...(devStore.get(tenant) ?? {}) }),
  writeDevContent: async (data: Record<string, unknown>, tenant: string) => { devStore.set(tenant, JSON.parse(JSON.stringify(data))); },
}));
vi.mock("@/lib/storage/content-store", () => ({ getContent: async () => ({ services: h.services }) }));
vi.mock("@/lib/storage", async () => ({
  ...(await vi.importActual<typeof import("@/platform/bookings/legacy-store")>("@/platform/bookings/legacy-store")),
  getContent: async () => ({ services: h.services }),
  logActivity: h.logActivity,
  DEFAULT_TENANT: "demo",
}));
vi.mock("@/platform/infra/db/source-flags", () => ({ dataSourceIsPostgres: () => false }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => h.tenant }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false, rateLimitKey: () => "booking-test" }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: async (id: string) => ({ id, siteName: "Mooney Firm", ownerEmail: "tenant-owner@example.test", active: true }) }));
vi.mock("@/lib/owner-recipient", () => ({ ownerNoticeEmail: async () => "owner-recipient@example.test" }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: (_c: unknown, path: string) => `https://app.strelva.test${path}` }));
vi.mock("@/lib/delivery-email", () => ({ sendBookingConfirmation: h.sendBookingConfirmation, sendNewBookingOwnerEmail: h.sendNewBookingOwnerEmail }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: h.alertOnce }));
vi.mock("@/platform/infra/auth", () => ({ verifyAuth: async () => true, requireTenantPermission: async () => null, requireTenantAccess: async () => null }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/leads", () => ({ getLeadById: async () => null }));

import { POST as postBooking } from "@/app/api/booking/route";
import { GET as getAvailability } from "@/app/api/booking/availability/route";
import { PUT as putBooking } from "@/app/api/booking/[id]/route";
import { getBookings } from "@/platform/bookings/legacy-store";
import type { Booking } from "@/lib/types";
import { resetBookingFlagCache } from "@/platform/bookings/flags";
import { setBookingStoreDb, readTenantBookings, upsertBookingSettings, type BookingStoreDb } from "@/platform/bookings/store";
import { publicBookingStoreHook, subtractStoreBookings } from "@/platform/bookings/public-api";
import { createPublicBookingService, PublicBookingError, type PublicBookingBinding, type PublicBookingReservationRef } from "@/products/scheduling/public-booking";
import { BOOKING_STORE_PENDING_KEY } from "@/platform/bookings/tenant";
import { backfillTenantBookings, checkTenantBookingParity, repairPendingBookings, type LegacyBookingPorts } from "@/platform/bookings/move";
import { recordCalendlyBooking } from "@/platform/bookings/calendly";
import { bookingRequestAdapter } from "@/platform/bookings/needs-you-adapter";
import { decideBookingRequest, readWorkspaceBookingRequests } from "@/platform/bookings/store";
import { updateBooking } from "@/platform/bookings/legacy-store";
import { setCalendarBusyPorts, type CalendarBusyPorts } from "@/platform/bookings/calendar-busy";

const FRIDAY = "2026-11-06";
const NOW = Date.parse("2026-11-02T12:00:00.000Z");
const RECORD_HOURS = { timezone: "America/New_York", weekly: [{ day: 5, opens: "09:00", closes: "15:00" }] };
const STORE_SETTINGS = { mode: "instant" as const, bufferMinutes: 0, minNoticeMinutes: 0, maxAdvanceDays: 60, defaultLengthMinutes: 60, timezone: "America/New_York" };

function env(read: "legacy" | "compare" | "postgres", write = true) {
  vi.stubEnv("STRELVA_BOOKING_STORE_WRITE", write ? "1" : "");
  vi.stubEnv("STRELVA_BOOKING_STORE_READ", read === "legacy" ? "" : read);
  resetBookingFlagCache();
}

function bookingRequest(startTime: string, name = "Dana Reed") {
  return new Request("https://mooney.example/api/booking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ serviceId: "svc-consult", date: FRIDAY, startTime, clientName: name, clientEmail: "Dana@Example.test", clientPhone: "716-555-0100" }),
  });
}

async function availability(date = FRIDAY): Promise<string[]> {
  const res = await getAvailability(new Request(`https://mooney.example/api/booking/availability?date=${date}&serviceId=svc-consult`));
  expect(res.status).toBe(200);
  return (await res.json()).slots;
}

function legacyRows(tenant = h.tenant): Booking[] {
  return (devStore.get(tenant)?.[`__bookings_${tenant}`] as Booking[] | undefined) ?? [];
}

/** The public API service with fake calendar/tokens; open times come from a schedule, minus the one store. */
function publicApi(tenant: string, stableId: string) {
  const tokens = new Map<string, PublicBookingReservationRef>();
  const scheduleSlots = [
    { id: "slot-1000-xxxxxxxxxxxxxxxx", start: "2026-11-06T15:00:00.000Z", end: "2026-11-06T15:30:00.000Z" },
    { id: "slot-1100-xxxxxxxxxxxxxxxx", start: "2026-11-06T16:00:00.000Z", end: "2026-11-06T16:30:00.000Z" },
  ];
  const binding = (slots: PublicBookingBinding["slots"]): PublicBookingBinding => ({
    tenantId: tenant, tenantStableId: stableId, grantId: randomUUID(), capabilityId: "consult", version: 1,
    inquiryCapabilityId: "inquiry", inquiryVersion: 1, name: "Consultation", provider: "google", timeZone: "America/New_York",
    slots, owner: { userId: randomUUID(), verifiedEmail: "owner@example.test" }, workspaceId: randomUUID(), workId: randomUUID(),
  });
  const service = createPublicBookingService({
    resolve: async () => binding(await subtractStoreBookings(tenant, scheduleSlots)),
    inquiries: { capture: async () => ({ inquiryId: `lead_${randomUUID()}` }) },
    calendar: {
      reserve: async (input) => ({ verification: "verified", start: input.start, end: input.end, expectedRevision: 1 }),
      change: async (input) => ({ verification: "verified", start: input.start, end: input.end, expectedRevision: 2 }),
      cancel: async () => ({ verification: "verified", start: scheduleSlots[0]!.start, end: scheduleSlots[0]!.end, expectedRevision: 3 }),
    },
    tokens: {
      findByRequest: async ({ requestId }) => [...tokens.values()].find((t) => t.requestId === requestId) ?? null,
      findByToken: async ({ managementToken }) => [...tokens.values()].find((t) => t.managementToken === managementToken) ?? null,
      save: async (value) => { tokens.set(value.reservationId, value); return value; },
    },
    store: publicBookingStoreHook(),
  });
  return { service, scheduleSlots };
}

const visitor = { name: "Sam Lee", email: "sam@example.test" };
const requestId = () => `req-${randomUUID()}-${randomUUID()}`.slice(0, 80);

interface World {
  db: BookingStoreDb;
  tenant: string;
  stableId: string;
  setFridayCloses(closes: string): Promise<void>;
  pause(): Promise<void>;
}

/** Both route families, one store: the scenario the bookings spec's bar names. */
async function oneStoreScenario(world: World) {
  h.tenant = world.tenant;
  env("postgres");
  await upsertBookingSettings(world.tenant, STORE_SETTINGS, "native", world.db);

  // 1. A widget booking through /api/booking lands in the store (and the legacy table).
  const widget = await postBooking(bookingRequest("10:00"));
  expect(widget.status).toBe(200);
  const widgetBody = await widget.json();
  expect(widgetBody.booking).toMatchObject({ date: FRIDAY, startTime: "10:00", endTime: "10:30", status: "confirmed", serviceName: "Consultation" });
  expect(legacyRows(world.tenant).map((b) => b.id)).toEqual([widgetBody.booking.id]);
  const afterWidget = await readTenantBookings(world.tenant, { from: FRIDAY, to: FRIDAY }, world.db);
  expect(afterWidget).toEqual([expect.objectContaining({ legacyId: widgetBody.booking.id, origin: "site", status: "confirmed", localStart: "10:00" })]);

  // 2. The public API no longer offers that time, and refuses it.
  const api = publicApi(world.tenant, world.stableId);
  const read = await api.service.read({ tenantId: world.tenant, capabilityId: "consult" });
  expect(read.slots.map((s) => s.id)).toEqual([api.scheduleSlots[1]!.id]);
  await expect(api.service.reserve({ tenantId: world.tenant, capabilityId: "consult", capabilityVersion: 1, slotId: api.scheduleSlots[0]!.id, visitor, requestId: requestId() }))
    .rejects.toMatchObject({ code: "conflict" });

  // 3. An API reservation at 11:00 lands in the same store.
  const receipt = await api.service.reserve({ tenantId: world.tenant, capabilityId: "consult", capabilityVersion: 1, slotId: api.scheduleSlots[1]!.id, visitor, requestId: requestId() });
  expect(receipt.status).toBe("confirmed");
  const both = await readTenantBookings(world.tenant, { from: FRIDAY, to: FRIDAY }, world.db);
  expect(both.map((b) => [b.localStart, b.status, b.publicReservationId === receipt.reservationId])).toEqual([["10:00", "confirmed", false], ["11:00", "confirmed", true]]);

  // 4. The widget no longer offers either time, and refuses the API's slot.
  const slots = await availability();
  expect(slots).not.toContain("10:00");
  expect(slots).not.toContain("11:00");
  expect(slots).toEqual(expect.arrayContaining(["09:00", "09:30", "10:30", "11:30", "14:30"]));
  const refused = await postBooking(bookingRequest("11:00", "Late Comer"));
  expect(refused.status).toBe(409);
  expect(legacyRows(world.tenant)).toHaveLength(1);

  // 5. Even a direct claim on an overlapping time is refused by the store.
  const hook = publicBookingStoreHook()!;
  const claim = await hook.claim({
    binding: { tenantId: world.tenant, timeZone: "America/New_York" } as PublicBookingBinding,
    reservationId: randomUUID(), requestFingerprint: "a".repeat(64), title: "Consultation",
    start: "2026-11-06T15:15:00.000Z", end: "2026-11-06T15:45:00.000Z", visitor, inquiryId: "lead_x",
  });
  expect(claim).toBe("conflict");

  // 6. Friday hours change in the business record: slots follow, no booking-side edit.
  await world.setFridayCloses("11:00");
  expect(await availability()).toEqual(["09:00", "09:30", "10:30"]);

  // 7. Pause: no new times, a booking is refused with the business phone, and every booking stays.
  const before = await readTenantBookings(world.tenant, undefined, world.db);
  await world.pause();
  expect(await availability()).toEqual([]);
  const paused = await postBooking(bookingRequest("09:00"));
  expect(paused.status).toBe(409);
  const pausedBody = await paused.json();
  expect(pausedBody).toMatchObject({ paused: true });
  expect(pausedBody.error).toContain("716-555-0199");
  expect(await api.service.read({ tenantId: world.tenant, capabilityId: "consult" })).toBeTruthy();
  const after = await readTenantBookings(world.tenant, undefined, world.db);
  expect(after.map((b) => [b.id, b.status])).toEqual(before.map((b) => [b.id, b.status]));
  // A customer (here the owner on their behalf) can still cancel while paused.
  const cancel = await putBooking(new Request(`https://mooney.example/api/booking/${widgetBody.booking.id}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "cancelled" }),
  }), { params: Promise.resolve({ id: widgetBody.booking.id }) });
  expect(cancel.status).toBe(200);
  expect((await readTenantBookings(world.tenant, { from: FRIDAY, to: FRIDAY }, world.db))[0]).toMatchObject({ legacyId: widgetBody.booking.id, status: "cancelled" });
  expect(legacyRows(world.tenant)[0]).toMatchObject({ status: "cancelled" });

  // 8. Rollback: back to legacy reads; the legacy store kept every widget write.
  env("legacy");
  expect((await getBookings(world.tenant)).map((b) => [b.id, b.status])).toEqual([[widgetBody.booking.id, "cancelled"]]);
}

beforeEach(() => {
  redis.store.clear();
  redis.zsets.clear();
  devStore.clear();
  h.tenant = "t1";
  h.services = [{ id: "svc-consult", name: "Consultation", duration: "30" }];
  h.sendBookingConfirmation.mockReset().mockResolvedValue(false);
  h.sendNewBookingOwnerEmail.mockReset().mockResolvedValue(true);
  h.alertOnce.mockReset().mockResolvedValue(undefined);
  h.logActivity.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("DUAL_WRITE_PG", "1");
  vi.stubEnv("STRELVA_BOOKING_OWNER_NOTICE", "");
});

afterEach(() => {
  setBookingStoreDb(undefined);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetBookingFlagCache();
});

function fakeWorld(overrides: Partial<FakeTenant> = {}) {
  const fake = fakeBookingStore();
  fake.state.streakDays = 7;
  const tenant: FakeTenant = {
    stableId: randomUUID(), workspaceId: randomUUID(), systemId: randomUUID(), paused: false, phone: "716-555-0199",
    hours: JSON.parse(JSON.stringify(RECORD_HOURS)),
    services: [{ id: randomUUID(), name: "Consultation", durationMinutes: 30, active: true, externalRef: "svc-consult" }],
    ...overrides,
  };
  fake.tenants.set("t1", tenant);
  setBookingStoreDb(fake.db);
  const world: World = {
    db: fake.db, tenant: "t1", stableId: tenant.stableId,
    async setFridayCloses(closes) { tenant.hours = { ...tenant.hours!, weekly: [{ day: 5, opens: "09:00", closes }] }; },
    async pause() { tenant.paused = true; },
  };
  return { fake, tenant, world };
}

describe("one booking store, both route families (in-memory store)", () => {
  it("a widget booking and an API reservation share one calendar; hours, pause and rollback hold", async () => {
    const { world } = fakeWorld();
    await oneStoreScenario(world);
  });
});

const PSQL = process.env.STRELVA_BOOKINGS_PSQL;

describe.runIf(Boolean(PSQL))("one booking store, both route families (real functions on a throwaway cluster)", () => {
  it("a widget booking and an API reservation share one calendar; hours, pause and rollback hold", async () => {
    const db = psqlBookingStore(PSQL!);
    const slug = `bk-${randomUUID().slice(0, 8)}`;
    const stableId = randomUUID();
    const operator = randomUUID();
    const email = `op-${operator.slice(0, 8)}@strelva.example.test`;
    const importPayload = JSON.stringify({
      tenantId: slug, tenantStableId: stableId, workspaceName: "Mooney Firm", billing: null, account: null,
      patch: {
        facts: { phone: { value: "716-555-0199", verified: false }, hours: { value: RECORD_HOURS, verified: false } },
        services: [{ op: "upsert", name: "Consultation", durationMinutes: 30, active: true, position: 0, externalRef: "svc-consult" }],
      },
      contacts: [],
    });
    const workspaceId = db.exec(`insert into public.users(id, email, verified_at) values ('${operator}', '${email}', now());
      insert into public.super_admins(user_id, email) values ('${operator}', '${email}');
      insert into public.tenants(id, stable_id, site_name, active) values ('${slug}', '${stableId}', 'Mooney Firm', true);
      select public.convert_tenant_to_business('${email}', '${slug}', '${importPayload}', '${randomUUID()}', repeat('e', 64))->>'workspaceId';`).trim();
    db.exec(`insert into public.tenant_client_record_parity(store, tenant_stable_id, checked_on, ok, redis_count, postgres_count, missing, mismatched)
      select 'bookings', '${stableId}', (now() at time zone 'UTC')::date - d, true, 0, 0, 0, 0 from generate_series(0, 7) d
      on conflict do nothing;`);
    setBookingStoreDb(db);
    await oneStoreScenario({
      db, tenant: slug, stableId,
      async setFridayCloses(closes) {
        db.exec(`update public.business_record_facts set value = '{"timezone":"America/New_York","weekly":[{"day":5,"opens":"09:00","closes":"${closes}"}]}'
          where workspace_id = '${workspaceId}' and fact_key = 'hours';`);
      },
      async pause() {
        const sys = randomUUID();
        const rev = randomUUID();
        db.exec(`insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by)
            values ('${sys}', '${workspaceId}', 'Bookings', 'booking', '${randomUUID()}', repeat('c', 64), '${operator}', '${operator}');
          insert into public.system_revisions(id, system_id, business_workspace_id, number, implementation, command_id, command_digest, created_by)
            values ('${rev}', '${sys}', '${workspaceId}', 1, '{"kind":"schedule","ref":"work:contract"}', '${randomUUID()}', repeat('d', 64), '${operator}');
          update public.systems set current_revision_id = '${rev}', current_revision_number = 1, lifecycle = 'live' where id = '${sys}';
          update public.systems set lifecycle = 'paused' where id = '${sys}';`);
      },
    });
  });
});

describe("dual-write and compare (reads still legacy)", () => {
  it("dual-write copies a widget booking; the visitor's response is unchanged", async () => {
    const { fake } = fakeWorld();
    env("legacy");
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["booking", "confirmationSent", "success"]);
    expect(fake.rows).toEqual([expect.objectContaining({ legacyId: body.booking.id, origin: "legacy", status: "confirmed", recordedVia: "dual_write" })]);
  });

  it("a store outage never fails the visitor: the copy is queued, and the repair replays it", async () => {
    const { fake } = fakeWorld();
    env("legacy");
    fake.state.down = true;
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(200);
    const id = (await res.json()).booking.id;
    expect(redis.zsets.get(BOOKING_STORE_PENDING_KEY)?.has(`booking|t1|${id}`)).toBe(true);
    expect(fake.rows).toHaveLength(0);
    fake.state.down = false;
    const ports: LegacyBookingPorts = {
      bookings: async () => legacyRows(), booking: async (_t, bid) => legacyRows().find((b) => b.id === bid) ?? null,
      settings: async () => ({ config: (await import("@/lib/booking")).DEFAULT_BOOKING_CONFIG, overrides: [] }),
      services: async () => h.services, reservations: async () => [], reservation: async () => null,
    };
    const repaired = await repairPendingBookings({ ports, redis: redis as never, db: fake.db });
    expect(repaired).toMatchObject({ checked: 1, repaired: 1, remaining: 0 });
    expect(fake.rows).toEqual([expect.objectContaining({ legacyId: id, recordedVia: "repair" })]);
  });

  it("without the write switch nothing reaches the store, and reads never move", async () => {
    const { fake } = fakeWorld();
    vi.stubEnv("STRELVA_BOOKING_STORE_READ", "postgres");
    resetBookingFlagCache();
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(200);
    expect(fake.rows).toHaveLength(0);
  });

  it("compare serves legacy and reports a booking the store is missing", async () => {
    const { fake } = fakeWorld();
    env("legacy");
    await postBooking(bookingRequest("10:00"));
    fake.rows.length = 0;
    env("compare");
    const served = await getBookings("t1");
    expect(served).toHaveLength(1);
    expect(h.alertOnce).toHaveBeenCalledWith("booking_store_parity_miss", "high", expect.objectContaining({ tenant: "t1", missing: 1 }), 3600);
  });

  it("a store failure after the flip serves the legacy answer (reads) and takes the booking on the legacy path (writes)", async () => {
    const { fake } = fakeWorld();
    env("postgres");
    await availability();
    fake.state.down = true;
    expect((await availability()).length).toBeGreaterThan(0);
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(200);
    expect(legacyRows()).toHaveLength(1);
    expect(redis.zsets.get(BOOKING_STORE_PENDING_KEY)?.size).toBe(1);
  });
});

describe("services and hours come from the business record", () => {
  it("a service the record removed or marked inactive stops being bookable", async () => {
    const { tenant } = fakeWorld();
    env("postgres");
    tenant.services[0]!.active = false;
    expect(await availability()).toEqual([]);
    const res = await postBooking(bookingRequest("10:00"));
    expect(res.status).toBe(400);
    tenant.services = [];
    tenant.services.push({ id: randomUUID(), name: "Other", durationMinutes: 60, active: true, externalRef: "svc-other" });
    expect(await availability()).toEqual([]);
  });

  it("the record's length wins over the site copy", async () => {
    const { tenant } = fakeWorld();
    env("postgres");
    tenant.services[0]!.durationMinutes = 90;
    h.services = [{ id: "svc-consult", name: "Consultation", duration: "30" }];
    const res = await postBooking(bookingRequest("10:00"));
    expect((await res.json()).booking).toMatchObject({ startTime: "10:00", endTime: "11:30" });
  });

  it("bookable hours narrow the record's hours but never open a closed time", async () => {
    const { fake, world } = fakeWorld();
    env("postgres");
    await upsertBookingSettings("t1", { ...STORE_SETTINGS, bookableHours: [{ day: 5, opens: "08:00", closes: "10:00" }, { day: 6, opens: "09:00", closes: "12:00" }] }, "native", fake.db);
    expect(await availability()).toEqual(["09:00", "09:30"]);
    expect(await availability("2026-11-07")).toEqual([]);
    await world.setFridayCloses("09:30");
    expect(await availability()).toEqual(["09:00"]);
  });

  it("an unconverted site (no record hours) keeps its own hours, as today", async () => {
    const { fake } = fakeWorld({ hours: null, services: [], workspaceId: null, systemId: null });
    env("postgres");
    await upsertBookingSettings("t1", { ...STORE_SETTINGS, bookableHours: [{ day: 5, opens: "13:00", closes: "14:00" }] }, "native", fake.db);
    expect(await availability()).toEqual(["13:00", "13:30"]);
  });
});

describe("owner notice and request mode", () => {
  it("sends one New booking notice to the owner recipient when the switch is on", async () => {
    fakeWorld();
    env("postgres");
    vi.stubEnv("STRELVA_BOOKING_OWNER_NOTICE", "1");
    await postBooking(bookingRequest("10:00"));
    expect(h.sendNewBookingOwnerEmail).toHaveBeenCalledTimes(1);
    expect(h.sendNewBookingOwnerEmail.mock.calls[0]![0]).toMatchObject({
      email: "owner-recipient@example.test",
      booking: { customerName: "Dana Reed", serviceName: "Consultation", when: "Fri, Nov 6, 10:00 AM" },
      dashboardUrl: "https://app.strelva.test/dashboard/schedule",
    });
  });

  it("sends nothing while the switch is off (today: no owner notice exists)", async () => {
    fakeWorld();
    env("legacy");
    await postBooking(bookingRequest("10:00"));
    expect(h.sendNewBookingOwnerEmail).not.toHaveBeenCalled();
  });

  it("a request holds the slot, sends no confirmation or notice, and reaches Needs you; approve confirms in both stores", async () => {
    const { fake, tenant } = fakeWorld();
    env("postgres");
    vi.stubEnv("STRELVA_BOOKING_OWNER_NOTICE", "1");
    vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "1");
    await upsertBookingSettings("t1", { ...STORE_SETTINGS, mode: "request" }, "native", fake.db);
    const res = await postBooking(bookingRequest("10:00"));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, requested: true, confirmationSent: false, booking: { status: "requested" } });
    expect(h.sendBookingConfirmation).not.toHaveBeenCalled();
    expect(h.sendNewBookingOwnerEmail).not.toHaveBeenCalled();
    expect(await availability()).not.toContain("10:00");

    const adapter = bookingRequestAdapter({
      requests: (ws) => readWorkspaceBookingRequests(ws),
      decide: (ws, id, decision, actor) => decideBookingRequest(ws, id, decision, actor),
      afterDecision: async (booking) => { await updateBooking(booking.legacyId!, { status: booking.status === "confirmed" ? "confirmed" : "cancelled" }, booking.tenantId!); },
    });
    const proposal = await adapter.propose({ workspaceId: tenant.workspaceId! });
    expect(proposal.items).toEqual([expect.objectContaining({ kind: "customer.commitment", route: "owner_decides", urgent: true, adminMayDecide: false, sourceLifecycle: "booking_request" })]);
    expect(proposal.items[0]!.title).toBe("Booking request: Dana Reed, Fri, Nov 6 10:00 AM");
    // Another business sees nothing and can't decide it.
    expect((await adapter.propose({ workspaceId: randomUUID() })).items).toEqual([]);
    const item = { id: randomUUID(), sourceId: proposal.items[0]!.sourceId } as never;
    expect(await adapter.resolve({ workspaceId: randomUUID() }, item, "approve", { kind: "owner_link", recipient: "x@example.test", actor: null })).toMatchObject({ outcome: "failed" });
    const resolved = await adapter.resolve({ workspaceId: tenant.workspaceId! }, item, "approve", { kind: "owner_link", recipient: "owner-recipient@example.test", actor: null });
    expect(resolved).toMatchObject({ outcome: "done" });
    expect(fake.rows[0]).toMatchObject({ status: "confirmed" });
    expect(legacyRows()[0]).toMatchObject({ status: "confirmed" });
    expect(await adapter.currentRevision({ workspaceId: tenant.workspaceId! }, proposal.items[0]!.sourceId)).toBeNull();
  });

  it("a lapse never confirms a request: it is declined and the slot is released", async () => {
    const { fake, tenant } = fakeWorld();
    env("postgres");
    await upsertBookingSettings("t1", { ...STORE_SETTINGS, mode: "request" }, "native", fake.db);
    await postBooking(bookingRequest("10:00"));
    const adapter = bookingRequestAdapter({ requests: (ws) => readWorkspaceBookingRequests(ws), decide: (ws, id, d, a) => decideBookingRequest(ws, id, d, a) });
    const [proposed] = (await adapter.propose({ workspaceId: tenant.workspaceId! })).items;
    const outcome = await adapter.resolve({ workspaceId: tenant.workspaceId! }, { id: randomUUID(), sourceId: proposed!.sourceId } as never, "approve", { kind: "expiry" });
    expect(outcome).toMatchObject({ outcome: "done", reason: "Expired, nothing confirmed" });
    expect(fake.rows[0]).toMatchObject({ status: "declined" });
    expect(await availability()).toContain("10:00");
  });
});

describe("Calendly imports", () => {
  it("records each invitee as an import booking, keeps an overlapping one, and cancels on invitee.canceled", async () => {
    const { fake } = fakeWorld();
    env("postgres");
    await postBooking(bookingRequest("10:00"));
    const payload = {
      event: "invitee.created",
      invitee: { uri: "https://api.calendly.com/scheduled_events/E1/invitees/I1", name: "Pat Example", email: "pat@example.test", timezone: "America/Chicago" },
      scheduledEvent: { name: "Intro call", start_time: "2026-11-06T15:00:00.000000Z", end_time: "2026-11-06T15:30:00.000000Z" },
    };
    expect(await recordCalendlyBooking("t1", payload)).toBe("recorded");
    expect(await recordCalendlyBooking("t1", payload)).toBe("unchanged");
    const imported = fake.rows.find((r) => r.origin === "import")!;
    expect(imported).toMatchObject({ externalSource: "calendly", status: "confirmed", timeZone: "America/New_York" });
    expect(await recordCalendlyBooking("t1", { ...payload, event: "invitee.canceled" })).toBe("updated");
    expect(imported.status).toBe("cancelled");
  });

  it("end to end through the signed webhook: an import blocks the site's time, and a cancel frees it (API v2 payload)", async () => {
    const { fake } = fakeWorld();
    env("postgres");
    vi.stubEnv("CALENDLY_WEBHOOK_SECRET", "calendly_e2e_secret");
    await redis.set("calendly-user-uri:https://api.calendly.com/users/HOST1", "t1");
    const { POST: calendlyWebhook } = await import("@/app/api/webhooks/calendly/route");
    const { createHmac } = await import("node:crypto");
    const send = async (event: "invitee.created" | "invitee.canceled") => {
      // The API v2 shape: the invitee resource is the payload; the host is an event membership.
      const body = JSON.stringify({
        event,
        payload: {
          uri: "https://api.calendly.com/scheduled_events/E9/invitees/I9", name: "Pat Example", email: "pat@example.test", timezone: "America/Chicago",
          status: event === "invitee.canceled" ? "canceled" : "active",
          scheduled_event: {
            uri: "https://api.calendly.com/scheduled_events/E9", name: "Intro call",
            start_time: "2026-11-06T16:30:00.000000Z", end_time: "2026-11-06T17:00:00.000000Z",
            event_memberships: [{ user: "https://api.calendly.com/users/HOST1" }],
          },
        },
      });
      const ts = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", "calendly_e2e_secret").update(`${ts}.${body}`).digest("hex");
      return calendlyWebhook(new Request("https://app.strelva.test/api/webhooks/calendly", {
        method: "POST", headers: { "Calendly-Webhook-Signature": `t=${ts},v1=${sig}`, "content-type": "application/json" }, body,
      }));
    };
    // 11:30 New York is 16:30Z on Friday Nov 6.
    expect(await availability()).toContain("11:30");
    expect((await send("invitee.created")).status).toBe(200);
    expect(fake.rows).toEqual([expect.objectContaining({ origin: "import", externalSource: "calendly", externalRef: "https://api.calendly.com/scheduled_events/E9/invitees/I9", status: "confirmed" })]);
    expect(h.addEvent).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", source: "calendly", title: "New booking: Pat Example" }));
    expect(await availability()).not.toContain("11:30");
    // The import shows in the owner's list.
    expect((await getBookings("t1")).map((b) => [b.clientName, b.startTime, b.status])).toContainEqual(["Pat Example", "11:30", "confirmed"]);
    // A replay changes nothing.
    expect((await send("invitee.created")).status).toBe(200);
    expect(fake.rows).toHaveLength(1);

    const activityBefore = h.addEvent.mock.calls.length;
    expect((await send("invitee.canceled")).status).toBe(200);
    expect(fake.rows[0]).toMatchObject({ status: "cancelled" });
    expect(await availability()).toContain("11:30");
    // A cancel changes the booking only; it writes no "New booking" activity.
    expect(h.addEvent).toHaveBeenCalledTimes(activityBefore);
  });

  it("is off without the write switch, and ignores events it doesn't know", async () => {
    fakeWorld();
    env("legacy", false);
    expect(await recordCalendlyBooking("t1", { event: "invitee.created", invitee: { uri: "u" }, scheduledEvent: {} })).toBe("off");
    env("legacy");
    expect(await recordCalendlyBooking("t1", { event: "routing_form_submission.created", invitee: { uri: "u" }, scheduledEvent: {} })).toBe("ignored");
    expect(await recordCalendlyBooking("t1", { event: "invitee.created", invitee: {}, scheduledEvent: { start_time: "x", end_time: "y" } })).toBe("invalid");
  });
});

describe("backfill and the 7-day compare", () => {
  function ports(): LegacyBookingPorts {
    return {
      bookings: async (t) => legacyRows(t),
      booking: async (t, id) => legacyRows(t).find((b) => b.id === id) ?? null,
      settings: async () => ({ config: { ...(DEFAULT_CONFIG), weeklySchedule: DEFAULT_CONFIG.weeklySchedule.map((d) => (d.day === 5 ? { ...d, start: "09:00", end: "15:00" } : d)), bufferTime: 0, bookingLeadTime: 0 }, overrides: [] }),
      services: async () => h.services,
      reservations: async () => [],
      reservation: async () => null,
    };
  }
  let DEFAULT_CONFIG: typeof import("@/lib/booking").DEFAULT_BOOKING_CONFIG;
  beforeEach(async () => {
    DEFAULT_CONFIG = (await import("@/lib/booking")).DEFAULT_BOOKING_CONFIG;
  });

  it("a dry run writes nothing; apply copies; a rerun is unchanged; parity then holds", async () => {
    const { fake } = fakeWorld();
    env("legacy", false);
    await postBooking(bookingRequest("10:00"));
    await postBooking(bookingRequest("11:30", "Second Client"));
    const dry = await backfillTenantBookings("t1", { apply: false, ports: ports(), db: fake.db });
    expect(dry).toMatchObject({ legacyBookings: 2, written: 0, settings: "would_write" });
    expect(fake.rows).toHaveLength(0);
    expect(fake.settings.size).toBe(0);

    const before = await checkTenantBookingParity("t1", { ports: ports(), db: fake.db, today: "2026-11-02", days: 7 });
    expect(before).toMatchObject({ ok: false, missing: expect.arrayContaining(legacyRows().map((b) => b.id)) });

    const applied = await backfillTenantBookings("t1", { apply: true, ports: ports(), db: fake.db });
    expect(applied).toMatchObject({ written: 2, settings: "written", conflicts: [], failed: [] });
    const rerun = await backfillTenantBookings("t1", { apply: true, ports: ports(), db: fake.db });
    expect(rerun).toMatchObject({ written: 0, unchanged: 2 });

    const after = await checkTenantBookingParity("t1", { ports: ports(), db: fake.db, today: "2026-11-02", days: 7 });
    // The record is open Fridays only, so the legacy Tuesday-Thursday hours are closed in the store: an explained difference.
    expect(after).toMatchObject({ ok: true, missing: [], mismatched: [], slotDifferencesExplained: true, recorded: true });
    expect(after.slotDifferences.map((d) => d.date)).not.toContain(FRIDAY);
    expect(after.slotDifferences.every((d) => d.store.length === 0)).toBe(true);
    expect(fake.parity.at(-1)).toMatchObject({ p_store: "bookings", p_tenant_id: "t1", p_missing: 0, p_mismatched: 0 });
  });

  it("an overlap the legacy store let through is refused by the store and listed", async () => {
    const { fake } = fakeWorld();
    env("legacy", false);
    await postBooking(bookingRequest("10:00"));
    const rows = legacyRows();
    devStore.set("t1", { __bookings_t1: [...rows, { ...rows[0]!, id: "bk_double", clientName: "Double Booked" }] });
    const applied = await backfillTenantBookings("t1", { apply: true, ports: ports(), db: fake.db });
    expect(applied.conflicts).toEqual(["bk_double"]);
  });

  it("reports legacy settings that aren't carried", async () => {
    const { fake } = fakeWorld();
    const withPayment: LegacyBookingPorts = { ...ports(), settings: async () => ({ config: { ...DEFAULT_CONFIG, requirePayment: true }, overrides: [] }) };
    const report = await backfillTenantBookings("t1", { apply: false, ports: withPayment, db: fake.db });
    expect(report.notes.join(" ")).toContain("requirePayment");
    expect(report.notes.join(" ")).toContain("outside the business record's hours");
  });
});

describe("public API on the store before the flip", () => {
  it("records each reservation without guarding; a store refusal is logged, not shown", async () => {
    const { fake, world } = fakeWorld();
    env("legacy");
    const api = publicApi("t1", world.stableId);
    const receipt = await api.service.reserve({ tenantId: "t1", capabilityId: "consult", capabilityVersion: 1, slotId: api.scheduleSlots[0]!.id, visitor, requestId: requestId() });
    expect(fake.rows).toEqual([expect.objectContaining({ publicReservationId: receipt.reservationId, status: "confirmed", origin: "site" })]);
    // Cancel through the receipt: the store follows.
    await api.service.cancel({ tenantId: "t1", reservationId: receipt.reservationId, managementToken: receipt.managementToken });
    expect(fake.rows[0]).toMatchObject({ status: "cancelled" });
  });

  it("a store outage never fails a reservation", async () => {
    const { fake, world } = fakeWorld();
    env("legacy");
    fake.state.down = true;
    const api = publicApi("t1", world.stableId);
    const receipt = await api.service.reserve({ tenantId: "t1", capabilityId: "consult", capabilityVersion: 1, slotId: api.scheduleSlots[0]!.id, visitor, requestId: requestId() });
    expect(receipt.status).toBe("confirmed");
    expect(redis.zsets.get(BOOKING_STORE_PENDING_KEY)?.has(`reservation|t1|${receipt.reservationId}`)).toBe(true);
  });

  it("refuses with the public conflict error once the store guards", async () => {
    const { world } = fakeWorld();
    env("postgres");
    await postBooking(bookingRequest("10:00"));
    const api = publicApi("t1", world.stableId);
    const error = await api.service.reserve({ tenantId: "t1", capabilityId: "consult", capabilityVersion: 1, slotId: api.scheduleSlots[0]!.id, visitor, requestId: requestId() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublicBookingError);
  });
});

describe("the wellness schedule and roster show the same bookings before and after the flip", () => {
  it("day and week views read identical bookings from the legacy store and the one store", async () => {
    const { fake } = fakeWorld();
    const { setReleaseFlagsDb } = await import("@/platform/release-flags/store");
    const { readWorkspaceBookings } = await import("@/products/bookings/server");
    const { DEFAULT_BOOKING_CONFIG } = await import("@/lib/booking");
    setReleaseFlagsDb({ rpc: async () => ({ data: [{ tenantId: "t1", tenantStableId: randomUUID(), linkedAt: "2026-10-01T00:00:00Z" }], error: null }) });
    try {
      env("legacy");
      for (const [time, name] of [["10:00", "Dana Reed"], ["10:45", "Sam Lee"], ["11:30", "Ana Ruiz"]] as const) {
        expect((await postBooking(bookingRequest(time, name))).status).toBe(200);
      }
      const sam = legacyRows().find((b) => b.clientName === "Sam Lee")!;
      await putBooking(new Request(`https://mooney.example/api/booking/${sam.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "completed" }) }), { params: Promise.resolve({ id: sam.id }) });
      const ports: LegacyBookingPorts = {
        bookings: async () => legacyRows(), booking: async (_t, id) => legacyRows().find((b) => b.id === id) ?? null,
        settings: async () => ({ config: DEFAULT_BOOKING_CONFIG, overrides: [] }), services: async () => h.services,
        reservations: async () => [], reservation: async () => null,
      };
      await backfillTenantBookings("t1", { apply: true, ports, db: fake.db });
      const actor = { userId: randomUUID(), verifiedEmail: "owner@example.test" };
      const workspaceId = randomUUID();

      env("legacy");
      const dayBefore = await readWorkspaceBookings(actor, workspaceId, { view: "day", date: FRIDAY });
      const weekBefore = await readWorkspaceBookings(actor, workspaceId, { view: "week", date: FRIDAY });
      const listBefore = await getBookings("t1");
      env("postgres");
      const dayAfter = await readWorkspaceBookings(actor, workspaceId, { view: "day", date: FRIDAY });
      const weekAfter = await readWorkspaceBookings(actor, workspaceId, { view: "week", date: FRIDAY });
      const listAfter = await getBookings("t1");

      expect(dayBefore.sites[0]!.bookings.map((b) => [b.clientName, b.startTime, b.status])).toEqual([["Dana Reed", "10:00", "confirmed"], ["Sam Lee", "10:45", "completed"], ["Ana Ruiz", "11:30", "confirmed"]]);
      expect(dayAfter.sites[0]!.bookings).toEqual(dayBefore.sites[0]!.bookings);
      expect(weekAfter.sites[0]!.bookings).toEqual(weekBefore.sites[0]!.bookings);
      const sortKey = (b: Booking) => `${b.date} ${b.startTime}`;
      expect([...listAfter].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))).toEqual([...listBefore].sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
    } finally {
      setReleaseFlagsDb(null);
    }
  });
});

describe("a connected calendar's busy times on the tenant routes", () => {
  function calendar(over: Partial<CalendarBusyPorts> = {}) {
    const ports: CalendarBusyPorts = {
      connection: vi.fn(async () => ({ provider: "google" as const, status: "connected" })),
      // Busy Friday 10:00-10:30 New York (15:00Z-15:30Z).
      busy: vi.fn(async () => [{ start: "2026-11-06T15:00:00.000Z", end: "2026-11-06T15:30:00.000Z" }]),
      cache: null,
      ...over,
    };
    setCalendarBusyPorts(ports);
    return ports;
  }
  afterEach(() => setCalendarBusyPorts(undefined));

  it("busy times are not offered and can't be booked; the read is for the business's own workspace and day", async () => {
    const { tenant } = fakeWorld();
    env("postgres");
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY", "1");
    const ports = calendar();
    const slots = await availability();
    expect(slots).not.toContain("10:00");
    expect(slots).toContain("10:45");
    expect(ports.busy).toHaveBeenCalledWith(tenant.workspaceId, "google", { start: "2026-11-06T05:00:00.000Z", end: "2026-11-07T05:00:00.000Z", timeZone: "America/New_York" });
    expect((await postBooking(bookingRequest("10:00"))).status).toBe(409);
    expect((await postBooking(bookingRequest("10:45"))).status).toBe(200);
  });

  it("an unreadable calendar never refuses a booking: slots are offered and an instant booking becomes a request", async () => {
    const { fake } = fakeWorld();
    env("postgres");
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY", "1");
    calendar({ busy: vi.fn(async () => { throw new Error("token revoked"); }) });
    expect(await availability()).toContain("10:00");
    const body = await (await postBooking(bookingRequest("10:00"))).json();
    expect(body).toMatchObject({ success: true, requested: true, booking: { status: "requested" } });
    expect(fake.rows[0]).toMatchObject({ status: "requested" });
  });

  it("an errored connection is treated as unreadable, no connection changes nothing, and the switch off reads nothing", async () => {
    fakeWorld();
    env("postgres");
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY", "1");
    const errored = calendar({ connection: vi.fn(async () => ({ provider: "outlook" as const, status: "error" })) });
    expect(await availability()).toContain("10:00");
    expect(errored.busy).not.toHaveBeenCalled();
    expect(await (await postBooking(bookingRequest("10:00"))).json()).toMatchObject({ requested: true });

    fakeWorld();
    calendar({ connection: vi.fn(async () => null) });
    expect(await (await postBooking(bookingRequest("10:00"))).json()).toMatchObject({ success: true, booking: { status: "confirmed" } });

    fakeWorld();
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY", "");
    const off = calendar();
    expect(await availability()).toContain("10:00");
    expect(off.connection).not.toHaveBeenCalled();
  });

  it("caches a day's busy times for 60 seconds", async () => {
    fakeWorld();
    env("postgres");
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY", "1");
    const store = new Map<string, unknown>();
    const set = vi.fn(async (key: string, value: unknown) => { store.set(key, value); });
    const ports = calendar({ cache: { get: async (key) => store.get(key) ?? null, set } });
    await availability();
    await availability();
    expect(ports.busy).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.stringMatching(/^reb:booking:busy:.+:2026-11-06$/), expect.any(Array), 60);
  });
});
