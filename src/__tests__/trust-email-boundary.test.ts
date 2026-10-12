import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { EmailBusinessContext } from "@/platform/infra/email/business-context";
const mocks = vi.hoisted(() => ({ context: vi.fn(), override: vi.fn(), send: vi.fn(), batch: vi.fn(), brand: vi.fn(), agencyIdentity: vi.fn() }));
vi.mock("@/platform/infra/email/business-context", () => ({ resolveEmailBusinessContext: mocks.context }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: mocks.override }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: mocks.brand, resolveTenantBrand: mocks.brand, resolveAgencyEmailIdentity: mocks.agencyIdentity }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; batch = { send: mocks.batch }; } }));
import { sendEmailWithReceipt, sendBatchWithReceipt, readableBookingInstant, type SendEmailInput } from "@/platform/infra/email/send";
const workspaceId = "cc000000-0000-4000-8000-000000000003";
const context: EmailBusinessContext = { workspaceId, tenantIds: ["fixture", "second-site"], ownerAuthorship: "platform", businessName: "Lakeview Yoga", replyTo: "hello@lakeview.example", timeZone: "America/New_York" };
const owner: SendEmailInput = { audience: "client", workspaceId, to: "owner@example.test", subject: "A decision is waiting", options: { heading: "A decision is waiting", paragraphs: ["Open your workspace."] } };
const booking: SendEmailInput = { audience: "customer", workspaceId, tenantId: "fixture", fromAddress: "bookings@mail.strelva.com", fromName: "Unverified supplied name", businessName: "Unverified supplied name", to: "customer@example.test", subject: "Booking", options: { heading: "Booking", rows: [{ label: "Requested time", value: "2026-11-03T15:00:00Z" }] } };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "fictional-test-key");
  mocks.context.mockResolvedValue(context); mocks.override.mockResolvedValue("inherit");
  mocks.brand.mockResolvedValue({ agencyId: "agency", name: "North Studio", replyTo: "team@north.example" });
  mocks.agencyIdentity.mockResolvedValue({ name: "North Studio", replyTo: "team@north.example" });
  mocks.send.mockResolvedValue({ data: { id: "fixture" }, error: null }); mocks.batch.mockResolvedValue({ data: { data: [{ id: "fixture" }] }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("sends direct-owner notices as the platform, without an agency identity", async () => {
  expect(await sendEmailWithReceipt({ ...owner, fromName: "Cached agency name" })).toMatchObject({ status: "accepted" });
  expect(mocks.send.mock.calls[0]![0]).toMatchObject({ from: '"Strelva" <hello@updates.strelva.com>', replyTo: "hello@strelva.com" });
  expect(mocks.brand).not.toHaveBeenCalled(); expect(mocks.agencyIdentity).not.toHaveBeenCalled();
});
it("retains managed-agency identity and holds unavailable managed identity", async () => {
  mocks.context.mockResolvedValue({ ...context, ownerAuthorship: "agency" });
  expect(await sendEmailWithReceipt(owner)).toMatchObject({ status: "accepted" });
  expect(mocks.send.mock.calls[0]![0]).toMatchObject({ from: '"North Studio" <hello@updates.strelva.com>', replyTo: "team@north.example" });
  mocks.send.mockClear(); mocks.agencyIdentity.mockResolvedValue(null);
  expect(await sendEmailWithReceipt(owner)).toMatchObject({ status: "suppressed", reason: "agency_identity_unavailable" });
  expect(mocks.send).not.toHaveBeenCalled();
});
it("does not turn a failed relationship lookup into a platform author", async () => {
  mocks.context.mockResolvedValue(null);
  expect(await sendEmailWithReceipt(owner)).toMatchObject({ status: "suppressed" });
  expect(mocks.send).not.toHaveBeenCalled();
});
it("uses the verified business name, reply destination and readable local confirmation time", async () => {
  expect(await sendEmailWithReceipt(booking)).toMatchObject({ status: "accepted" });
  const payload = mocks.send.mock.calls[0]![0];
  expect(payload).toMatchObject({ from: '"Lakeview Yoga" <bookings@mail.strelva.com>', replyTo: "hello@lakeview.example" });
  for (const body of [payload.html, payload.text]) {
    expect(body).toContain("Lakeview Yoga"); expect(body).toContain("10:00 AM Eastern Time");
    expect(body).not.toContain("2026-11-03T"); expect(body).not.toContain("Unverified supplied name");
  }
});
it.each([null, { ...context, replyTo: null }, { ...context, businessName: null }])("holds booking mail without complete verified identity", async identity => {
  mocks.context.mockResolvedValue(identity);
  expect(await sendEmailWithReceipt(booking)).toMatchObject({ status: "suppressed" }); expect(mocks.send).not.toHaveBeenCalled();
});
it.each(["fixture", "second-site", `workspace:${workspaceId}`])("obeys exclusion %s for owner and customer mail", async silenced => {
  mocks.override.mockImplementation(async (key: string) => key === silenced ? "off" : "on");
  expect(await sendEmailWithReceipt(owner)).toMatchObject({ status: "suppressed" });
  expect(await sendEmailWithReceipt(booking)).toMatchObject({ status: "suppressed" }); expect(mocks.send).not.toHaveBeenCalled();
});
it("holds policy read failures even when every global gate is on", async () => {
  mocks.override.mockRejectedValue(new Error("unavailable"));
  expect(await sendEmailWithReceipt(booking)).toMatchObject({ status: "suppressed" }); expect(mocks.send).not.toHaveBeenCalled();
});
it("does not let customer arming bypass the customer global gate", async () => {
  mocks.override.mockResolvedValue("on"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "false");
  expect(await sendEmailWithReceipt(booking)).toMatchObject({ status: "suppressed" }); expect(mocks.send).not.toHaveBeenCalled();
});
it("holds a send if exclusions change while rendering", async () => {
  mocks.override.mockResolvedValueOnce("inherit").mockResolvedValueOnce("inherit").mockResolvedValueOnce("inherit").mockResolvedValue("off");
  expect(await sendEmailWithReceipt(booking)).toMatchObject({ status: "suppressed", reason: "email_policy_changed" }); expect(mocks.send).not.toHaveBeenCalled();
});
it("requires customer scope instead of silently skipping exclusions", async () => {
  expect(await sendEmailWithReceipt({ ...booking, tenantId: undefined, workspaceId: undefined })).toMatchObject({ status: "suppressed" }); expect(mocks.send).not.toHaveBeenCalled();
});
it("revalidates newsletter envelope identity and never falls back to Strelva replies", async () => {
  const batch = { audience: "customer" as const, tenantId: "fixture", workspaceId, fromName: "Newsletter", fromAddress: "newsletter@mail.strelva.com", messages: [{ to: "reader@example.test", subject: "Issue", html: "<p>Words</p>", text: "Words" }] };
  expect(await sendBatchWithReceipt(batch)).toMatchObject({ status: "accepted" });
  expect(mocks.batch.mock.calls[0]![0][0]).toMatchObject({ from: '"Lakeview Yoga" <newsletter@mail.strelva.com>', replyTo: "hello@lakeview.example" });
  mocks.context.mockResolvedValue({ ...context, replyTo: null }); mocks.batch.mockClear();
  expect(await sendBatchWithReceipt(batch)).toMatchObject({ status: "suppressed", reason: "business_reply_identity_unavailable" }); expect(mocks.batch).not.toHaveBeenCalled();
});
it("keeps local times explicit across daylight-saving offsets and an unavailable zone", () => {
  expect(readableBookingInstant("2026-03-08T07:00:00Z", "America/New_York")).toContain("3:00 AM Eastern Time");
  expect(readableBookingInstant("2026-11-01T06:00:00Z", "America/New_York")).toContain("1:00 AM Eastern Time");
  expect(readableBookingInstant("2026-11-03T15:00:00Z", "Invalid/Zone")).toContain("3:00 PM UTC");
  for (const zone of ["America/New_York", "America/Los_Angeles", "UTC", "Invalid/Zone"]) {
    const readable = readableBookingInstant("2026-11-03T15:00:00Z", zone);
    expect(readable).not.toContain("(");
    expect(readable).not.toContain("America/");
    expect(readable.match(/Eastern Time|Pacific Time|UTC/g)).toHaveLength(1);
  }
});

it("formats legacy local date and clock rows without shifting the business date", async () => {
  await sendEmailWithReceipt({ ...booking, options: { heading: "Booking", rows: [{ label: "Date", value: "2026-11-03" }, { label: "Time", value: "10:00" }] } });
  const payload = mocks.send.mock.calls[0]![0];
  expect(payload.text).toContain("Tue, Nov 3, 2026"); expect(payload.text).toContain("10:00 AM Eastern Time");
});
it("enforces workspace exclusions even when a legacy sender supplies only a tenant", async () => {
  mocks.override.mockImplementation(async (key: string) => key === `workspace:${workspaceId}` ? "off" : "inherit");
  expect(await sendEmailWithReceipt({ ...booking, workspaceId: undefined })).toMatchObject({ status: "suppressed" });
  expect(mocks.send).not.toHaveBeenCalled();
});

it("does not let an armed sibling site turn on client mail for another site", async () => {
  vi.stubEnv("EMAIL_SENDING_ENABLED", "false");
  mocks.override.mockImplementation(async (key: string) => key === "second-site" ? "on" : "inherit");
  expect(await sendEmailWithReceipt({ ...owner, tenantId: "fixture" })).toMatchObject({ status: "suppressed" });
  expect(mocks.send).not.toHaveBeenCalled();
});
