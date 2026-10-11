import { afterEach, beforeEach, expect, it, vi } from "vitest";
const redis = vi.hoisted(() => vi.fn());
const provider = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/redis", () => ({ getRedis: redis }));
vi.mock("resend", () => ({ Resend: class { batch = { send: provider }; } }));
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { sendBatchWithReceipt } from "@/platform/infra/email/send";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "test-key"); });
afterEach(() => vi.unstubAllEnvs());
it("keeps an unreadable tenant override gated even with global sending on", async () => {
  redis.mockReturnValue({ get: async () => { throw new Error("outage"); } });
  expect(await getClientEmailOverride("fixture")).toBe("inherit");
  expect(await getClientEmailOverride("fixture", { failClosed: true })).toBe("off");
  expect(await sendBatchWithReceipt({ audience: "customer", tenantId: "fixture", requireClientGate: true, fromName: "Newsletter", fromAddress: "newsletter@mail.strelva.com", messages: [{ to: "a@example.test", subject: "s", html: "h", text: "t" }] })).toMatchObject({ status: "suppressed", reason: "not sent: gated" });
  expect(provider).not.toHaveBeenCalled();
});
it("requires readable tenant policy for new newsletter delivery", async () => {
  redis.mockReturnValue(null); expect(await getClientEmailOverride("fixture", { failClosed: true })).toBe("off");
});
