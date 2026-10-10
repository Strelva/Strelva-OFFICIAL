import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The owner's "someone reached out" email is client mail. With client mail
// paused globally, only a per-client override can turn it on, and the override
// is keyed by tenant. No real mail is sent: Resend is mocked.

const send = vi.hoisted(() => vi.fn());
const override = vi.hoisted(() => vi.fn());
const addTenantActivity = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: override }));
vi.mock("@/lib/tenant-crm", () => ({ addTenantActivity }));

import { sendNewLeadEmail } from "@/lib/delivery-email";

const params = {
  email: "owner@example.test",
  siteName: "McClear's Cottage",
  lead: { name: "Ada Rivera", email: "ada@example.test", message: "June 3-5?" },
  dashboardUrl: "https://admin.mclears-cottage.strelva.com/dashboard",
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["EMAIL_SENDING_ENABLED", "OPERATOR_EMAILS_ENABLED", "PROSPECT_EMAILS_ENABLED", "CUSTOMER_EMAIL_ENABLED"]) vi.stubEnv(key, "");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  send.mockResolvedValue({ data: { id: "mail_1" }, error: null });
  override.mockResolvedValue("inherit");
  addTenantActivity.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("sendNewLeadEmail tenant", () => {
  it("a client armed with the override gets the notice while client mail is paused", async () => {
    override.mockResolvedValue("on");
    await expect(sendNewLeadEmail({ ...params, tenantId: "mclears-cottage" })).resolves.toBe(true);
    expect(override).toHaveBeenCalledWith("mclears-cottage");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: "owner@example.test", subject: "Someone reached out through your website" });
    expect(addTenantActivity).toHaveBeenCalledWith("mclears-cottage", expect.objectContaining({ summary: "Sent: new-lead email" }));
  });

  it("without the tenant the override can't apply, so paused stays paused", async () => {
    override.mockResolvedValue("on");
    await expect(sendNewLeadEmail(params)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(addTenantActivity).not.toHaveBeenCalled();
  });

  it("an override of off blocks it even with client mail on", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    override.mockResolvedValue("off");
    await expect(sendNewLeadEmail({ ...params, tenantId: "mclears-cottage" })).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
