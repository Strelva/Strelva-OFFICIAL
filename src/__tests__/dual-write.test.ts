import { afterEach, describe, expect, it } from "vitest";
import {
  dualWritePgEnabled,
  eventToInsert,
  mailToInsert,
  buildPaymentToInsert,
} from "@/lib/db/dual-write";
import type { UnifiedEvent } from "@/lib/types";
import type { MailRecord } from "@/lib/storage/mail-log";

describe("dualWritePgEnabled", () => {
  const original = process.env.DUAL_WRITE_PG;
  afterEach(() => {
    if (original === undefined) delete process.env.DUAL_WRITE_PG;
    else process.env.DUAL_WRITE_PG = original;
  });

  it("defaults on when the flag is unset", () => {
    delete process.env.DUAL_WRITE_PG;
    expect(dualWritePgEnabled()).toBe(true);
  });

  it('is the kill-switch: off for "0" and "false"', () => {
    process.env.DUAL_WRITE_PG = "0";
    expect(dualWritePgEnabled()).toBe(false);
    process.env.DUAL_WRITE_PG = "false";
    expect(dualWritePgEnabled()).toBe(false);
  });

  it('stays on for any other value (e.g. "1")', () => {
    process.env.DUAL_WRITE_PG = "1";
    expect(dualWritePgEnabled()).toBe(true);
  });
});

describe("eventToInsert", () => {
  it("maps camelCase UnifiedEvent to the snake_case row", () => {
    const e: UnifiedEvent = {
      id: "evt_1",
      tenantId: "gldf",
      source: "ai",
      type: "content_update",
      title: "t",
      body: "b",
      status: "pending",
      metadata: { k: "v" },
      createdAt: "2026-06-20T00:00:00.000Z",
      resolvedAt: undefined,
    };
    expect(eventToInsert(e)).toEqual({
      id: "evt_1",
      tenant_id: "gldf",
      source: "ai",
      type: "content_update",
      title: "t",
      body: "b",
      status: "pending",
      metadata: { k: "v" },
      created_at: "2026-06-20T00:00:00.000Z",
      resolved_at: null,
    });
  });
});

describe("mailToInsert", () => {
  it("maps the record and converts epoch ms ts to ISO", () => {
    const r: MailRecord = {
      tenant: "gldf",
      kind: "weekly_report",
      ok: true,
      messageId: "m1",
      to: "owner@example.com",
      ts: Date.parse("2026-06-20T00:00:00.000Z"),
    };
    expect(mailToInsert(r)).toEqual({
      tenant_id: "gldf",
      kind: "weekly_report",
      ok: true,
      message_id: "m1",
      error: null,
      recipient_email: "owner@example.com",
      ts: "2026-06-20T00:00:00.000Z",
    });
  });
});

describe("buildPaymentToInsert", () => {
  it("maps the webhook record and defaults a null amount to 0", () => {
    expect(
      buildPaymentToInsert({
        sessionId: "cs_1",
        paySlug: "gldf",
        leadSlug: null,
        tenantId: "gldf",
        amountCents: null,
        currency: "USD",
        customerEmail: "owner@example.com",
        createdAt: "2026-06-20T00:00:00.000Z",
      })
    ).toEqual({
      session_id: "cs_1",
      amount_cents: 0,
      currency: "USD",
      customer_email: "owner@example.com",
      lead_slug: null,
      pay_slug: "gldf",
      tenant_id: "gldf",
      created_at: "2026-06-20T00:00:00.000Z",
    });
  });
});
