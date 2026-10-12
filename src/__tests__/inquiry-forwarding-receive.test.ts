import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceivedEmailMessageResult } from "@/platform/infra/email/send";
import { receiveForwardedInquiryEvent } from "@/products/inquiry-forwarding/server";
import { ForwardedMessageInvalidError, type ForwardedReceiveInput, type ForwardingStore } from "@/products/inquiry-forwarding/store";
import * as fixtures from "./fixtures/forwarded-emails";

const BAKERY = "24500000-0000-4000-8000-0000000000b1";
const FLORIST = "24500000-0000-4000-8000-0000000000b2";
const REVOKED = `fwd-${"revoked".padEnd(23, "0")}1`;

/** The SQL contract (tests/inquiry-forwarding-schema.sql) proves these rules in Postgres; this mirrors them. */
function memoryStore() {
  const addresses = new Map<string, { workspaceId: string; status: "active" | "revoked" }>([
    [fixtures.BAKERY_LOCAL, { workspaceId: BAKERY, status: "active" }],
    [fixtures.FLORIST_LOCAL, { workspaceId: FLORIST, status: "active" }],
    [REVOKED, { workspaceId: BAKERY, status: "revoked" }],
  ]);
  const rows: Array<{ id: string; workspaceId: string; input: Extract<ForwardedReceiveInput, { kind: "inquiry" }>; state: "kept" | "held_as_spam" }> = [];
  const confirmations: Array<{ workspaceId: string; code: string }> = [];
  const store: ForwardingStore = {
    issue: vi.fn(), revoke: vi.fn(), read: vi.fn(),
    resolve: vi.fn(async (local: string) => {
      const address = addresses.get(local);
      if (!address) return { status: "unknown" as const };
      if (address.status !== "active") return { status: "revoked" as const };
      return { status: "active" as const, addressId: `${local}-id`, workspaceId: address.workspaceId };
    }),
    receive: vi.fn(async (local: string, input: ForwardedReceiveInput) => {
      const address = addresses.get(local);
      if (!address) return { status: "refused" as const, reason: "unknown" as const };
      if (address.status !== "active") return { status: "refused" as const, reason: "revoked" as const };
      if (input.kind === "provider_confirmation") {
        confirmations.push({ workspaceId: address.workspaceId, code: input.code });
        return { status: "confirmation" as const, workspaceId: address.workspaceId };
      }
      const existing = rows.find((row) => row.workspaceId === address.workspaceId && (row.input.leadId === input.leadId || row.input.submissionHash === input.submissionHash));
      if (existing) return { status: "duplicate" as const, id: existing.id, workspaceId: address.workspaceId };
      const row = { id: `row-${rows.length + 1}`, workspaceId: address.workspaceId, input, state: input.spamReason ? "held_as_spam" as const : "kept" as const };
      rows.push(row);
      return { status: input.spamReason ? "held" as const : "recorded" as const, id: row.id, workspaceId: address.workspaceId };
    }),
  };
  return { store, rows, confirmations, addresses };
}

const environment = {
  STRELVA_INQUIRY_FORWARDING_RELEASE: "1", STRELVA_INQUIRIES_RELEASE: "1", STRELVA_INQUIRY_RECORDS: "1", INQUIRY_REPLY_TO_DOMAIN: fixtures.INBOUND_DOMAIN,
};

function event(to: string[], extra: Record<string, unknown> = {}) {
  return { type: "email.received", created_at: "2026-10-12T13:14:00.000Z", data: { email_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c", created_at: "2026-10-12T13:14:00.000Z", from: "pat@bakery.example.test", to, cc: [], bcc: [], message_id: "<x@y>", subject: "Fwd", attachments: [], ...extra } };
}
const to = (local: string) => [`${local}@${fixtures.INBOUND_DOMAIN}`];
const available = (message: (typeof fixtures)["gmailForward"]) => vi.fn(async (): Promise<ReceivedEmailMessageResult> => ({ status: "available", message }));

let memory: ReturnType<typeof memoryStore>;
beforeEach(() => { memory = memoryStore(); });
afterEach(() => vi.unstubAllEnvs());

describe("receiving forwarded inquiries", () => {
  it("flag off: ignored before any provider read or store call", async () => {
    const fetchMessage = available(fixtures.gmailForward);
    for (const off of [{ ...environment, STRELVA_INQUIRY_FORWARDING_RELEASE: "" }, { ...environment, STRELVA_INQUIRIES_RELEASE: "0" }, { ...environment, STRELVA_INQUIRY_RECORDS: "" }, { ...environment, INQUIRY_REPLY_TO_DOMAIN: "" }]) {
      expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, { store: memory.store, fetchMessage, environment: off, released: async () => true }))
        .toEqual({ status: "ignored", reason: "forwarding_off" });
    }
    expect(fetchMessage).not.toHaveBeenCalled();
    expect(memory.store.resolve).not.toHaveBeenCalled();
  });

  it("records a Gmail forward to the right business as a forwarded_email Inquiry, never sending anything", async () => {
    const result = await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, { store: memory.store, fetchMessage: available(fixtures.gmailForward), environment, released: async () => true });
    expect(result).toEqual({ status: "recorded", workspaceId: BAKERY, inquiryId: "row-1" });
    expect(memory.rows[0]!.input).toMatchObject({ kind: "inquiry", name: "Jane Doe", email: "jane.doe@customer.example.test", spamReason: null,
      fields: { format: "gmail", subject: "Wedding cake for June", forwardedBy: "pat@bakery.example.test", originalDate: "Mon, Oct 12, 2026 at 9:14 AM" } });
  });

  it("records each fixture format: Outlook, Apple, form BCC and auto-forward", async () => {
    for (const [message, email] of [[fixtures.outlookForward, "sam@rivera-events.example.test"], [fixtures.appleForward, "morgan.lee@customer.example.test"], [fixtures.plainBccFormNotice, "riley.smith@customer.example.test"], [fixtures.autoForwarded, "alex.chen@customer.example.test"]] as const) {
      const result = await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: message.messageId! }, { store: memory.store, fetchMessage: available(message), environment, released: async () => true });
      expect(result.status).toBe("recorded");
      expect(memory.rows.at(-1)!.input.email).toBe(email);
    }
  });

  it("refuses unknown and revoked addresses without reading the message or storing anything", async () => {
    const fetchMessage = available(fixtures.gmailForward);
    expect(await receiveForwardedInquiryEvent({ event: event(to(`fwd-${"z".repeat(24)}`)), eventId: "e1" }, { store: memory.store, fetchMessage, environment, released: async () => true })).toEqual({ status: "refused", reason: "unknown" });
    expect(await receiveForwardedInquiryEvent({ event: event(to(REVOKED)), eventId: "e2" }, { store: memory.store, fetchMessage, environment, released: async () => true })).toEqual({ status: "refused", reason: "revoked" });
    expect(fetchMessage).not.toHaveBeenCalled();
    expect(memory.store.receive).not.toHaveBeenCalled();
  });

  it("refuses a business whose inquiries release is off", async () => {
    const fetchMessage = available(fixtures.gmailForward);
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, { store: memory.store, fetchMessage, environment, released: async () => false })).toEqual({ status: "refused", reason: "released_off" });
    expect(fetchMessage).not.toHaveBeenCalled();
  });

  it("dedupes a redelivered event and the same inquiry forwarded twice", async () => {
    const deps = { store: memory.store, fetchMessage: available(fixtures.gmailForward), environment, released: async () => true };
    await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, deps);
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, deps)).toMatchObject({ status: "duplicate", inquiryId: "row-1" });
    const again = { ...fixtures.gmailForward, messageId: "<CAGmail-forward-2@mail.gmail.example.test>" };
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e2" }, { ...deps, fetchMessage: available(again) })).toMatchObject({ status: "duplicate", inquiryId: "row-1" });
    expect(memory.rows).toHaveLength(1);
  });

  it("holds spam for review with the existing held state", async () => {
    const result = await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, { store: memory.store, fetchMessage: available(fixtures.spamFlagged), environment, released: async () => true });
    expect(result.status).toBe("held");
    expect(memory.rows[0]).toMatchObject({ state: "held_as_spam", input: { spamReason: "spam_header" } });
  });

  it("keeps businesses apart: the same message to two addresses lands once in each", async () => {
    const deps = { store: memory.store, fetchMessage: available(fixtures.gmailForward), environment, released: async () => true };
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, deps)).toMatchObject({ status: "recorded", workspaceId: BAKERY });
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.FLORIST_LOCAL)), eventId: "e2" }, deps)).toMatchObject({ status: "recorded", workspaceId: FLORIST });
    expect(memory.rows.map((row) => row.workspaceId)).toEqual([BAKERY, FLORIST]);
  });

  it("records Gmail's confirmation on the address, not as an Inquiry", async () => {
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, { store: memory.store, fetchMessage: available(fixtures.gmailConfirmation), environment, released: async () => true }))
      .toEqual({ status: "confirmation", workspaceId: BAKERY });
    expect(memory.confirmations).toEqual([{ workspaceId: BAKERY, code: "123456789" }]);
    expect(memory.rows).toHaveLength(0);
  });

  it("ignores out-of-office replies and mail not for a forwarding address", async () => {
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, { store: memory.store, fetchMessage: available(fixtures.outOfOffice), environment, released: async () => true })).toEqual({ status: "ignored", reason: "forwarded_auto_reply" });
    const fetchMessage = available(fixtures.gmailForward);
    expect(await receiveForwardedInquiryEvent({ event: event([`inquiry+abc@${fixtures.INBOUND_DOMAIN}`]), eventId: "e2" }, { store: memory.store, fetchMessage, environment })).toEqual({ status: "ignored", reason: "not_forwarding_address" });
    expect(await receiveForwardedInquiryEvent({ event: { type: "email.delivered", data: { email_id: "x" } }, eventId: "e3" }, { store: memory.store, fetchMessage, environment })).toEqual({ status: "ignored", reason: "not_received_mail" });
    expect(fetchMessage).not.toHaveBeenCalled();
  });

  it("finds a BCC'd address in the delivery headers only when asked to inspect them", async () => {
    const fetchMessage = available(fixtures.plainBccFormNotice);
    const bccEvent = event(["pat@bakery.example.test"]);
    expect(await receiveForwardedInquiryEvent({ event: bccEvent, eventId: "e1" }, { store: memory.store, fetchMessage, environment, released: async () => true })).toEqual({ status: "ignored", reason: "not_forwarding_address" });
    expect(fetchMessage).not.toHaveBeenCalled();
    expect(await receiveForwardedInquiryEvent({ event: bccEvent, eventId: "e1" }, { store: memory.store, fetchMessage, environment, released: async () => true, inspectHeaders: true })).toMatchObject({ status: "recorded", workspaceId: BAKERY });
    expect(fetchMessage).toHaveBeenCalledTimes(1);
  });

  it("retries only when the message or the store cannot be read; a refused shape is final", async () => {
    const unreadable = vi.fn(async (): Promise<ReceivedEmailMessageResult> => ({ status: "unavailable", reason: "email_provider_receiving_unavailable" }));
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e1" }, { store: memory.store, fetchMessage: unreadable, environment, released: async () => true })).toEqual({ status: "unavailable", reason: "email_provider_receiving_unavailable" });
    memory.store.receive = vi.fn(async () => { throw new Error("db down"); });
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e2" }, { store: memory.store, fetchMessage: available(fixtures.gmailForward), environment, released: async () => true })).toEqual({ status: "unavailable", reason: "forwarding_store_unavailable" });
    memory.store.receive = vi.fn(async () => { throw new ForwardedMessageInvalidError(); });
    expect(await receiveForwardedInquiryEvent({ event: event(to(fixtures.BAKERY_LOCAL)), eventId: "e3" }, { store: memory.store, fetchMessage: available(fixtures.gmailForward), environment, released: async () => true })).toEqual({ status: "ignored", reason: "forwarded_invalid" });
  });
});
