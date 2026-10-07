import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  add: vi.fn(), workspace: vi.fn(), released: vi.fn(), rpc: vi.fn(),
  tenant: vi.fn(), unsubscribe: vi.fn(), limited: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({ addSubscriber: mocks.add }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: mocks.tenant }));
vi.mock("@/platform/release-flags/store", () => ({
  releaseWorkspaceForTenant: mocks.workspace, workspaceReleaseFlagEnabled: mocks.released,
}));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: mocks.limited, rateLimitKey: () => "newsletter-test" }));
vi.mock("@/lib/storage/newsletter-store", () => ({ unsubscribeSubscriber: mocks.unsubscribe }));
vi.mock("@/lib/newsletter-unsubscribe", () => ({ verifyUnsubscribeToken: () => ({ tenantId: "gldf", email: "reader@example.test" }) }));

import { POST } from "@/app/api/newsletter/subscribe/route";
import { POST as unsubscribe } from "@/app/api/newsletter/unsubscribe/route";
import { backfillNewsletterContacts } from "@/platform/business-record/newsletter-contacts";

const workspace = "d8000000-0000-4000-8000-000000000010";
const request = (body: unknown = { email: " Reader@Example.Test ", name: " Reader " }) =>
  new Request("https://local.example/api/newsletter/subscribe", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", "");
  vi.stubEnv("DATA_SOURCE", "postgres");
  mocks.add.mockResolvedValue({ duplicate: false });
  mocks.tenant.mockResolvedValue("gldf");
  mocks.workspace.mockResolvedValue(workspace);
  mocks.released.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: { enabled: true, duplicate: false, contact: "linked" }, error: null });
  mocks.limited.mockResolvedValue(false);
});
afterEach(() => vi.unstubAllEnvs());

describe("newsletter contact bridge and frozen public response", () => {
  it.each(["gldf", "rohlax"])("keeps %s subscribe and duplicate bodies identical with flags off, without workspace reads", async (tenant) => {
    mocks.tenant.mockResolvedValue(tenant);
    const first = await POST(request());
    expect(first.status).toBe(200);
    expect(await first.text()).toBe('{"message":"Subscribed successfully"}');
    expect(mocks.add).toHaveBeenCalledWith("reader@example.test", "Reader", tenant);
    mocks.add.mockResolvedValue({ duplicate: true });
    expect(await (await POST(request())).text()).toBe('{"message":"You\'re already subscribed!"}');
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.released).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["", "0", "true", "typo"])("fails closed for newsletter env %s", async (env) => {
    vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", env);
    await POST(request());
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it("obeys the workspace master kill switch and keeps dev-file storage unchanged", async () => {
    vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", "1");
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    await POST(request());
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("DATA_SOURCE", "dev");
    await POST(request());
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.add).toHaveBeenCalledTimes(2);
  });

  it.each(["gldf", "rohlax"])("keeps %s success and duplicate bodies identical with the converted-workspace flag on", async (tenant) => {
    vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", "workspace");
    mocks.tenant.mockResolvedValue(tenant);
    expect(await (await POST(request())).text()).toBe('{"message":"Subscribed successfully"}');
    expect(mocks.rpc).toHaveBeenCalledWith("subscribe_newsletter_contact", {
      p_tenant_id: tenant, p_workspace_id: workspace, p_email: "reader@example.test", p_name: "Reader",
    });
    mocks.rpc.mockResolvedValue({ data: { enabled: true, duplicate: true, contact: "linked" }, error: null });
    expect(await (await POST(request())).text()).toBe('{"message":"You\'re already subscribed!"}');
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("leaves unconverted tenants, row-off businesses and failed linkage lookups on the original store", async () => {
    vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", "1");
    mocks.workspace.mockResolvedValueOnce(null);
    await POST(request());
    mocks.released.mockResolvedValueOnce(false);
    await POST(request());
    mocks.workspace.mockRejectedValueOnce(new Error("lookup failed"));
    await POST(request());
    expect(mocks.add).toHaveBeenCalledTimes(3);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rechecks row-off in SQL when an app cache still says on", async () => {
    vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", "1");
    mocks.rpc.mockResolvedValue({ data: { enabled: false, duplicate: false, contact: "disabled" }, error: null });
    expect(await (await POST(request())).json()).toEqual({ message: "Subscribed successfully" });
    expect(mocks.add).toHaveBeenCalledOnce();
  });

  it("keeps a saved subscription successful when contact repair is needed", async () => {
    vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", "workspace");
    mocks.rpc.mockResolvedValue({ data: { enabled: true, duplicate: false, contact: "failed" }, error: null });
    expect(await (await POST(request())).json()).toEqual({ message: "Subscribed successfully" });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { message: "database write failed" } },
    { data: { enabled: true, duplicate: "bad", contact: "linked" }, error: null },
  ])("does not double write or claim success when subscriber persistence fails", async (result) => {
    vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", "1");
    mocks.rpc.mockResolvedValue(result);
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong" });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("keeps invalid input and rate-limit failures identical without writes", async () => {
    vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", "1");
    expect((await POST(request({ email: "invalid" }))).status).toBe(400);
    mocks.limited.mockResolvedValue(true);
    expect((await POST(request())).status).toBe(429);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("never runs contact projection or subscribes an address on unsubscribe", async () => {
    vi.stubEnv("STRELVA_NEWSLETTER_CONTACTS_RELEASE", "1");
    const response = await unsubscribe(new Request("https://local.example/api/newsletter/unsubscribe?token=fixture", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mocks.unsubscribe).toHaveBeenCalledWith("reader@example.test", "gldf");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });
});

describe("newsletter backfill preparation", () => {
  const input = { operatorEmail: "operator@example.test", tenantId: "gldf", workspaceId: workspace };
  const summary = { workspaceId: workspace, tenantId: "gldf", dryRun: true, examined: 3,
    creates: 1, merges: 1, invalid: 1, unsubscribed: 1, linked: 0, failed: 0, nextAfter: null };

  it("defaults to a dry run while releases are off", async () => {
    mocks.rpc.mockResolvedValue({ data: summary, error: null });
    expect(await backfillNewsletterContacts(input)).toEqual(summary);
    expect(mocks.rpc).toHaveBeenCalledWith("backfill_newsletter_contacts", {
      p_operator_email: "operator@example.test", p_tenant_id: "gldf", p_workspace_id: workspace,
      p_apply: false, p_after: null, p_limit: 500,
    });
    expect(mocks.released).not.toHaveBeenCalled();
  });

  it("refuses an apply with env off even when a row resolver could return true", async () => {
    await expect(backfillNewsletterContacts({ ...input, apply: true })).rejects.toThrow("not released");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("surfaces failed reads and malformed reports", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(backfillNewsletterContacts(input)).rejects.toThrow("could not be read");
    mocks.rpc.mockResolvedValueOnce({ data: { creates: 5 }, error: null });
    await expect(backfillNewsletterContacts(input)).rejects.toThrow();
  });
});
