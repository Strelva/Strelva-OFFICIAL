import { afterEach, beforeEach, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => vi.fn());
const override = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { batch = { send: provider }; } }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: override }));
import { batchEmailSuppression, sendBatchWithReceipt } from "@/platform/infra/email/send";
const input = { audience: "customer" as const, tenantId: "fixture", requireClientGate: true, fromName: "Newsletter", fromAddress: "newsletter@mail.strelva.com", idempotencyKey: "stable-batch", messages: [{ to: "a@example.test", subject: "Approved", html: "Approved", text: "Approved" }] };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true"); vi.stubEnv("EMAIL_SENDING_ENABLED", "false"); vi.stubEnv("RESEND_API_KEY", "test-key");
  override.mockResolvedValue("inherit"); provider.mockResolvedValue({ data: { data: [{ id: "provider-1" }] }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("blocks customer newsletter sends while the inherited client gate is off", async () => {
  expect(await batchEmailSuppression(input)).toBe("not sent: gated");
  expect(await sendBatchWithReceipt(input)).toEqual({ status: "suppressed", reason: "not sent: gated" }); expect(provider).not.toHaveBeenCalled();
});
it("permits an armed tenant while the global client switch is paused", async () => {
  override.mockResolvedValue("on"); expect(await sendBatchWithReceipt(input)).toMatchObject({ status: "accepted", providerMessageIds: ["provider-1"] });
  expect(provider.mock.calls[0]![1]).toEqual({ idempotencyKey: "stable-batch" });
});
it("blocks a tenant override off even while the global switch is on", async () => {
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); override.mockResolvedValue("off");
  expect(await sendBatchWithReceipt(input)).toMatchObject({ status: "suppressed", reason: "not sent: gated" }); expect(provider).not.toHaveBeenCalled();
});
it("still requires the independent customer consent gate for an armed tenant", async () => {
  override.mockResolvedValue("on"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "false");
  expect(await sendBatchWithReceipt(input)).toMatchObject({ status: "suppressed", reason: "not sent: gated" }); expect(provider).not.toHaveBeenCalled();
});
it("rechecks a client gate flipped after preflight", async () => {
  override.mockResolvedValueOnce("on").mockResolvedValueOnce("off"); expect(await batchEmailSuppression(input)).toBeNull();
  expect(await sendBatchWithReceipt(input)).toMatchObject({ status: "suppressed", reason: "not sent: gated" }); expect(provider).not.toHaveBeenCalled();
});
it("does not fabricate acceptance when provider ids are missing", async () => {
  override.mockResolvedValue("on"); provider.mockResolvedValue({ data: { data: [] }, error: null });
  await expect(sendBatchWithReceipt(input)).rejects.toThrow("acceptance is unconfirmed");
});
