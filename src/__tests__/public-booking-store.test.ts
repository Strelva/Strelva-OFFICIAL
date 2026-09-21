import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ client: null as unknown as object | null, rows: [] as Record<string, unknown>[] }));

vi.mock("@/lib/db/client", () => ({ getSupabase: () => boundary.client }));

import { postgresPublicBookingTokenStore } from "@/products/scheduling/public-booking-store";

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fakeClient() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let upserted: Record<string, unknown> | null = null;
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { filters[column] = value; return query; },
        upsert(value: Record<string, unknown>) { upserted = value; return query; },
        async maybeSingle() {
          if (table === "tenants") return { data: { stable_id: "stable-tenant" }, error: null };
          if (table === "public_website_booking_grants") return { data: { tenant_stable_id: "stable-tenant" }, error: null };
          const row = boundary.rows.find(item => Object.entries(filters).every(([key, value]) => item[key] === value)) ?? null;
          return { data: row, error: null };
        },
        async single() {
          if (upserted) {
            const existing = boundary.rows.find(item => item.id === upserted?.id);
            if (existing) Object.assign(existing, upserted);
            else boundary.rows.push(upserted);
            return { data: upserted, error: null };
          }
          return { data: null, error: { message: "missing" } };
        },
      };
      return query;
    },
  };
}

describe("public booking durable receipt store", () => {
  beforeEach(() => {
    boundary.rows.length = 0;
    boundary.client = fakeClient();
    process.env.SECRETS_ENC_KEY = "public-booking-test-key";
  });

  it("hashes the public idempotency and management keys while retaining encrypted replay state", async () => {
    const value = {
      tenantId: "northstar",
      grantId: "grant-1",
      capabilityId: "consultations",
      version: 2,
      provider: "outlook" as const,
      reservationId: "reservation-12345678",
      requestId: "request-12345678",
      requestFingerprint: "a".repeat(64),
      slotId: "slot-12345678",
      slotStart: "2026-10-01T13:00:00+00:00",
      slotEnd: "2026-10-01T14:00:00+00:00",
      workspaceId: "workspace-1",
      workId: "work-1",
      inquiryId: "inquiry-1",
      managementToken: "management-12345678",
      expectedRevision: 3,
      title: "Consultation",
      start: "2026-10-01T13:00:00+00:00",
      end: "2026-10-01T14:00:00+00:00",
      timeZone: "America/New_York",
      status: "confirmed" as const,
    };
    const saved = await postgresPublicBookingTokenStore.save(value);
    expect(saved).toMatchObject(value);
    expect(boundary.rows).toHaveLength(1);
    const row = boundary.rows[0]!;
    expect(row.request_id_hash).toBe(hash(value.requestId));
    expect(row.request_fingerprint).toBe(value.requestFingerprint);
    expect(row.management_token_hash).toBe(hash(value.managementToken));
    expect(row.management_token_ciphertext).not.toBe(value.managementToken);
    expect(row).not.toHaveProperty("management_token");
  });

  it("replays by the public request key and token without exposing the stored ciphertext", async () => {
    const value = {
      tenantId: "northstar",
      grantId: "grant-1",
      capabilityId: "consultations",
      version: 2,
      provider: "outlook" as const,
      reservationId: "reservation-12345678",
      requestId: "request-12345678",
      requestFingerprint: "a".repeat(64),
      slotId: "slot-12345678",
      slotStart: "2026-10-01T13:00:00+00:00",
      slotEnd: "2026-10-01T14:00:00+00:00",
      workspaceId: "workspace-1",
      workId: "work-1",
      inquiryId: "inquiry-1",
      managementToken: "management-12345678",
      expectedRevision: 3,
      title: "Consultation",
      start: "2026-10-01T13:00:00+00:00",
      end: "2026-10-01T14:00:00+00:00",
      timeZone: "America/New_York",
      status: "confirmed" as const,
    };
    await postgresPublicBookingTokenStore.save(value);
    await expect(postgresPublicBookingTokenStore.findByRequest({ tenantId: value.tenantId, requestId: value.requestId })).resolves.toMatchObject(value);
    await expect(postgresPublicBookingTokenStore.findByToken({ tenantId: value.tenantId, managementToken: value.managementToken })).resolves.toMatchObject(value);
  });

  it("normalizes a renamed tenant slug for lookup while retaining the stored reservation slug", async () => {
    const value = {
      tenantId: "northstar",
      grantId: "grant-1",
      capabilityId: "consultations",
      version: 2,
      provider: "outlook" as const,
      reservationId: "reservation-rename-123",
      requestId: "request-rename-123456789012345678901234",
      requestFingerprint: "b".repeat(64),
      slotId: "slot-rename-123",
      slotStart: "2026-10-01T13:00:00+00:00",
      slotEnd: "2026-10-01T14:00:00+00:00",
      workspaceId: "workspace-1",
      workId: "work-1",
      inquiryId: "inquiry-1",
      managementToken: "management-rename-123",
      expectedRevision: 3,
      title: "Consultation",
      start: "2026-10-01T13:00:00+00:00",
      end: "2026-10-01T14:00:00+00:00",
      timeZone: "America/New_York",
      status: "confirmed" as const,
    };
    await postgresPublicBookingTokenStore.save(value);

    const renamed = await postgresPublicBookingTokenStore.findByToken({
      tenantId: "new-northstar",
      managementToken: value.managementToken,
    });
    expect(renamed).not.toBeNull();
    expect(renamed).toMatchObject({ tenantId: "new-northstar", tenantIdAtReservation: "northstar" });

    await postgresPublicBookingTokenStore.save({ ...renamed!, tenantId: "new-northstar", status: "cancelled" });
    expect(boundary.rows[0]?.tenant_id_at_reservation).toBe("northstar");
    expect(boundary.rows[0]?.request_fingerprint).toBe(value.requestFingerprint);
  });
});
