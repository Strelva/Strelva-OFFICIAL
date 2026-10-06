import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The newsletter goes through the one email path (email/send.ts), from
// mail.strelva.com, with RFC 8058 one-click unsubscribe and per-batch
// idempotency. The provider is mocked; nothing is sent.

const batchSend = vi.hoisted(() => vi.fn());
const mockGetSubscribers = vi.hoisted(() => vi.fn());
const mockGetContent = vi.hoisted(() => vi.fn());
const mockUnsubscribe = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({ Resend: class { batch = { send: batchSend }; emails = { send: vi.fn() }; } }));
vi.mock("@/lib/storage", () => ({ getSubscribers: mockGetSubscribers, getContent: mockGetContent }));
vi.mock("@/lib/storage/newsletter-store", () => ({ unsubscribeSubscriber: mockUnsubscribe }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedAsync: vi.fn(async () => false), rateLimitKey: () => "k" }));

import { sendNewsletter } from "@/lib/newsletter";
import { sendBatchWithReceipt } from "@/lib/email/send";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/newsletter-unsubscribe";
import { GET, POST } from "@/app/api/newsletter/unsubscribe/route";

const subscribers = (n: number, status: "active" | "unsubscribed" = "active") =>
  Array.from({ length: n }, (_, i) => ({ email: `reader${i}@example.test`, subscribedAt: "2026-09-01T00:00:00Z", status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
  vi.stubEnv("APPROVE_LINK_SECRET", "test-only-secret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.strelva.example");
  mockGetContent.mockResolvedValue({ siteName: "Good Life Daily Foods" });
  batchSend.mockImplementation(async (payload: unknown[]) => ({ data: { data: payload.map((_, i) => ({ id: `msg_${i}` })) }, error: null }));
});

afterEach(() => vi.unstubAllEnvs());

describe("sendNewsletter", () => {
  it("sends only to active subscribers, from mail.strelva.com, with one-click unsubscribe", async () => {
    mockGetSubscribers.mockResolvedValue([...subscribers(2), { email: "gone@example.test", subscribedAt: "x", status: "unsubscribed" }]);
    const result = await sendNewsletter("gldf", { subject: "New collection", body: "<p>Hello</p>", idempotencyKeyPrefix: "evt_1" });
    expect(result).toMatchObject({ success: true, subscriberCount: 2, receipt: { accepted: 2, failedBatches: 0, from: "newsletter@mail.strelva.com" } });
    const [payload, options] = batchSend.mock.calls[0]!;
    expect(payload.map((m: { to: string }) => m.to)).toEqual(["reader0@example.test", "reader1@example.test"]);
    expect(payload[0].from).toBe("Good Life Daily Foods <newsletter@mail.strelva.com>");
    expect(payload[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const url = /^<(https:\/\/app\.strelva\.example\/api\/newsletter\/unsubscribe\?token=[^>]+)>$/.exec(payload[0].headers["List-Unsubscribe"])![1]!;
    expect(verifyUnsubscribeToken(decodeURIComponent(new URL(url).searchParams.get("token")!))).toEqual({ tenantId: "gldf", email: "reader0@example.test" });
    expect(options.idempotencyKey).toMatch(/^evt_1:[0-9a-f]{32}$/);
  });

  it("is suppressed, with nothing sent, while customer email is off", async () => {
    vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "");
    mockGetSubscribers.mockResolvedValue(subscribers(3));
    const result = await sendNewsletter("gldf", { subject: "s", body: "b" });
    expect(result).toMatchObject({ success: false, reason: "paused", subscriberCount: 0, receipt: { suppressed: 3, accepted: 0 } });
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("keeps sending other batches after one fails, and a retry reuses each batch's key", async () => {
    mockGetSubscribers.mockResolvedValue(subscribers(150));
    batchSend
      .mockImplementationOnce(async (payload: unknown[]) => ({ data: { data: payload.map(() => ({ id: "ok" })) }, error: null }))
      .mockImplementationOnce(async () => ({ data: null, error: { message: "rate limited" } }));
    const first = await sendNewsletter("gldf", { subject: "s", body: "b", idempotencyKeyPrefix: "evt_9" });
    expect(first).toMatchObject({ success: false, reason: "send_failed", subscriberCount: 100, receipt: { acceptedBatches: 1, failedBatches: 1, failedRecipients: 50 } });
    const firstKeys = batchSend.mock.calls.map(([, options]) => options.idempotencyKey);
    const retry = await sendNewsletter("gldf", { subject: "s", body: "b", idempotencyKeyPrefix: "evt_9" });
    expect(retry.success).toBe(true);
    expect(batchSend.mock.calls.slice(2).map(([, options]) => options.idempotencyKey)).toEqual(firstKeys);
  });

  it("reports no subscribers without touching the provider", async () => {
    mockGetSubscribers.mockResolvedValue(subscribers(2, "unsubscribed"));
    expect(await sendNewsletter("gldf", { subject: "s", body: "b" })).toMatchObject({ success: false, reason: "no_subscribers" });
    expect(batchSend).not.toHaveBeenCalled();
  });
});

describe("sendBatchWithReceipt", () => {
  it("refuses the root domain and per-client domains", async () => {
    const base = { audience: "customer" as const, fromName: "X", messages: [{ to: "a@example.test", subject: "s", html: "h", text: "t" }] };
    await expect(sendBatchWithReceipt({ ...base, fromAddress: "news@strelva.com" })).rejects.toThrow("Refusing to send from strelva.com");
    await expect(sendBatchWithReceipt({ ...base, fromAddress: "news@gldf.example" })).rejects.toThrow("Refusing");
    expect(batchSend).not.toHaveBeenCalled();
  });
});

describe("one-click unsubscribe route", () => {
  const url = (token: string) => `https://app.strelva.example/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;

  it("GET only shows a button; it never unsubscribes", async () => {
    const res = await GET(new Request(url(signUnsubscribeToken({ tenantId: "gldf", email: "reader0@example.test" }))));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('method="post"');
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it("POST (what mail clients send) unsubscribes the signed address", async () => {
    const res = await POST(new Request(url(signUnsubscribeToken({ tenantId: "gldf", email: "reader0@example.test" })), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(res.status).toBe(200);
    expect(mockUnsubscribe).toHaveBeenCalledWith("reader0@example.test", "gldf");
  });

  it("refuses a changed token", async () => {
    const token = signUnsubscribeToken({ tenantId: "gldf", email: "reader0@example.test" });
    const forged = `${Buffer.from(JSON.stringify({ t: "rohlax", e: "reader0@example.test" })).toString("base64url")}.${token.split(".")[1]}`;
    const res = await POST(new Request(url(forged), { method: "POST" }));
    expect(res.status).toBe(400);
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });
});
