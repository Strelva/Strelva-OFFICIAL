/**
 * booking-store Postgres dual-path coverage (DATA_SOURCE=postgres).
 *
 * Validates the real snake_case<->camelCase mapping (mapPgBookingRow /
 * bookingToInsert) and that the Postgres branch is actually taken, with Sanity
 * disabled (env unset -> hasSanity false) and Redis null so only the PG path runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  lastTable: "",
  lastInsert: undefined as unknown,
}));

function builder(): unknown {
  const p = Promise.resolve(supa.result);
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "maybeSingle" || prop === "single")
          return () => Promise.resolve(supa.result);
        if (prop === "insert" || prop === "upsert")
          return (v: unknown) => {
            supa.lastInsert = v;
            return builder();
          };
        return () => builder();
      },
    }
  );
}

vi.mock("@/lib/db/client", async (orig) => ({
  ...(await orig()),
  getSupabase: () => ({
    from: (t: string) => {
      supa.lastTable = t;
      return builder();
    },
  }),
}));

// Redis null so the slot-lock layer is inert and never touches a real client.
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));

import { getBookings, createBooking } from "@/lib/storage/booking-store";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  // Unset Sanity env so hasSanity (read at import) and the runtime checks both
  // resolve false; keeps the test on the Postgres-only path.
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.lastTable = "";
  supa.lastInsert = undefined;
});

afterEach(() => vi.unstubAllEnvs());

describe("booking-store Postgres path", () => {
  it("maps a snake_case bookings row to the camelCase Booking shape (read)", async () => {
    supa.result = {
      data: [
        {
          id: "bk_1",
          tenant_id: "gldf",
          service_id: "svc_1",
          service_name: "Massage",
          date: "2026-07-01",
          start_time: "10:00",
          end_time: "11:00",
          client_name: "Ada",
          client_email: "ada@example.com",
          client_phone: "555-0100",
          notes: null,
          status: "confirmed",
          created_at: "2026-06-20T00:00:00.000Z",
          cancelled_at: null,
        },
      ],
      error: null,
    };

    const bookings = await getBookings("gldf");

    expect(supa.lastTable).toBe("bookings");
    expect(bookings).toEqual([
      {
        id: "bk_1",
        serviceId: "svc_1",
        serviceName: "Massage",
        date: "2026-07-01",
        startTime: "10:00",
        endTime: "11:00",
        clientName: "Ada",
        clientEmail: "ada@example.com",
        clientPhone: "555-0100",
        notes: undefined,
        status: "confirmed",
        createdAt: "2026-06-20T00:00:00.000Z",
        cancelledAt: undefined,
      },
    ]);
  });

  it("inserts into the bookings table with snake_case columns (write)", async () => {
    const created = await createBooking(
      {
        serviceId: "svc_9",
        serviceName: "Facial",
        date: "2026-08-15",
        startTime: "14:00",
        endTime: "15:00",
        clientName: "Grace",
        clientEmail: "grace@example.com",
        clientPhone: "555-0199",
        notes: "first visit",
      },
      "gldf"
    );

    // Returned shape stays camelCase + gets server-side fields.
    expect(created.serviceId).toBe("svc_9");
    expect(created.status).toBe("confirmed");
    expect(created.id).toMatch(/.+/);
    expect(typeof created.createdAt).toBe("string");

    // The Postgres branch was taken and wrote the right table + columns.
    expect(supa.lastTable).toBe("bookings");
    const insert = supa.lastInsert as Record<string, unknown>;
    expect(insert).toMatchObject({
      id: created.id,
      tenant_id: "gldf",
      service_id: "svc_9",
      service_name: "Facial",
      date: "2026-08-15",
      start_time: "14:00",
      end_time: "15:00",
      client_name: "Grace",
      client_email: "grace@example.com",
      client_phone: "555-0199",
      notes: "first visit",
      status: "confirmed",
      created_at: created.createdAt,
      cancelled_at: null,
    });
  });
});
