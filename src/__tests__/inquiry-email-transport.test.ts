import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  get: vi.fn(),
  receivingList: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send, get: mocks.get, receiving: { list: mocks.receivingList } };
  },
}));

import { createEmailInquiryTransport } from "@/products/inquiries/delivery-email";
import { getReceivedEmailReadback } from "@/lib/email/send";

const message = {
  tenantId: "acme",
  inquiryId: "lead-1",
  action: "reply" as const,
  audience: "customer" as const,
  to: "ada@example.test",
  replyTo: "inquiry+abc@reply.strelva.test",
  subject: "We received your message for Acme",
  options: { heading: "We received your message", paragraphs: ["Thanks"] },
  tags: { strelva_tenant_id: "acme", strelva_inquiry_id: "lead-1", strelva_action: "reply" },
  idempotencyKey: "inquiry:lead-1:reply",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
  mocks.send.mockResolvedValue({ data: { id: "provider-1" }, error: null });
  mocks.get.mockResolvedValue({
    data: {
      id: "provider-1",
      to: [message.to],
      subject: message.subject,
      last_event: "delivered",
    },
    error: null,
  });
  mocks.receivingList.mockResolvedValue({ data: { has_more: false, data: [] }, error: null });
});

afterEach(() => vi.unstubAllEnvs());

describe("inquiry email provider boundary", () => {
  it("returns the provider id and sends non-sensitive correlation tags", async () => {
    const transport = createEmailInquiryTransport({ allowExternalSends: true });
    const result = await transport.send(message);
    expect(result).toMatchObject({ status: "accepted", providerMessageId: "provider-1" });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: message.to,
      tags: expect.arrayContaining([
        { name: "strelva_tenant_id", value: "acme" },
        { name: "strelva_inquiry_id", value: "lead-1" },
      ]),
    }), { idempotencyKey: message.idempotencyKey });
  });

  it("maps provider read-back bounce evidence without sending again", async () => {
    const transport = createEmailInquiryTransport({ allowExternalSends: true });
    const accepted = await transport.send(message);
    const verification = await transport.verify(message, accepted as Extract<typeof accepted, { status: "accepted" }>);
    expect(verification).toMatchObject({ status: "verified" });

    mocks.get.mockResolvedValueOnce({
      data: { id: "provider-1", to: [message.to], subject: message.subject, last_event: "bounced" },
      error: null,
    });
    const bounced = await transport.verify(message, accepted as Extract<typeof accepted, { status: "accepted" }>);
    expect(bounced).toMatchObject({ status: "bounced", reason: "Resend reported a permanent bounce." });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("reports intentional suppression as a rejected outcome", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const transport = createEmailInquiryTransport({ allowExternalSends: true });
    await expect(transport.send(message)).resolves.toMatchObject({
      status: "rejected",
      outcome: "suppressed",
      retryable: true,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("uses complete provider receiving pages for a truthful no-reply result", async () => {
    mocks.receivingList.mockResolvedValueOnce({
      data: {
        has_more: false,
        data: [{ id: "inbound-1", from: "other@example.test", to: ["other@reply.strelva.test"], created_at: "2026-09-11T12:00:00.000Z" }],
      },
      error: null,
    });
    await expect(getReceivedEmailReadback({
      replyTo: message.replyTo,
      after: "2026-09-11T11:00:00.000Z",
    })).resolves.toMatchObject({ status: "available", received: false });
    expect(mocks.receivingList).toHaveBeenCalledWith({ limit: 100 });

    mocks.receivingList.mockResolvedValueOnce({
      data: {
        has_more: false,
        data: [{ id: "inbound-2", from: message.to, to: [message.replyTo], created_at: "2026-09-11T12:10:00.000Z" }],
      },
      error: null,
    });
    await expect(getReceivedEmailReadback({
      replyTo: message.replyTo,
      after: "2026-09-11T11:00:00.000Z",
      sender: message.to,
    })).resolves.toMatchObject({ status: "available", received: true, providerMessageId: "inbound-2" });
  });
});
