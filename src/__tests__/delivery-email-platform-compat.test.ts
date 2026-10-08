import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspacePorts, workspacePorts, type WorkspacePorts } from "@/lib/workspace-ports";
import { workspacePortLoaders } from "@/server/workspace-ports";
import { sendBookingConfirmation, sendNewBookingOwnerEmail } from "@/platform/bookings/notice-email";
import { sendNewIntakeLeadEmail, sendNewSignupEmail, sendPaymentFailedEmail } from "@/platform/operator-notices/email";

const h = vi.hoisted(() => ({ send: vi.fn(), activity: vi.fn() }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmail: h.send }));
vi.mock("@/platform/infra/tenant-crm", () => ({ addTenantActivity: h.activity }));

beforeEach(() => {
  vi.clearAllMocks();
  h.send.mockResolvedValue(true);
  h.activity.mockResolvedValue(undefined);
  vi.stubEnv("LEAD_NOTIFY_EMAILS", " ops@example.test, , triage@example.test ");
});
afterEach(() => {
  registerWorkspacePorts(workspacePortLoaders);
  vi.unstubAllEnvs();
});

const booking = { to: "customer@example.test", clientName: "Customer", serviceName: "Visit", date: "Oct 8", time: "2 PM", businessName: "Studio", tenantId: "studio" };
const owner = { email: "owner@example.test", siteName: "Studio", booking: { customerName: "Customer", serviceName: "Visit", when: "Oct 8, 2 PM" }, dashboardUrl: "https://studio.example.test/dashboard", tenantId: "studio" };
const cases = [
  { name: "customer confirmation", send: () => sendBookingConfirmation(booking), audience: "customer", to: booking.to, summary: "Sent: booking confirmation" },
  { name: "owner confirmation notice", send: () => sendNewBookingOwnerEmail(owner), audience: "client", to: owner.email, summary: "Sent: new-booking email" },
  { name: "intake operator notice", send: () => sendNewIntakeLeadEmail({ lead: { businessName: "Studio", email: "owner@example.test", planLabel: "Site" }, leadsUrl: "https://admin.example.test/leads" }), audience: "operator", to: ["ops@example.test", "triage@example.test"], summary: null },
  { name: "signup operator notice", send: () => sendNewSignupEmail({ businessName: "Studio", tenantUrl: "https://admin.example.test/studio" }), audience: "operator", to: ["ops@example.test", "triage@example.test"], summary: null },
  { name: "payment operator notice", send: () => sendPaymentFailedEmail({ businessName: "Studio", tenantUrl: "https://admin.example.test/studio" }), audience: "operator", to: ["ops@example.test", "triage@example.test"], summary: null },
];

describe.each(cases)("$name", ({ send, audience, to, summary }) => {
  it("keeps the audience, recipient and completed-send CRM contract", async () => {
    expect(await send()).toBe(true);
    expect(h.send).toHaveBeenCalledOnce();
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ audience, to }));
    if (summary) {
      expect(h.activity).toHaveBeenCalledExactlyOnceWith("studio", { kind: "email", summary, author: "Strelva" });
      expect(h.activity.mock.invocationCallOrder[0]).toBeGreaterThan(h.send.mock.invocationCallOrder[0]!);
    } else expect(h.activity).not.toHaveBeenCalled();
  });

  it("never records a suppressed or unavailable send as sent", async () => {
    h.send.mockResolvedValue(false);
    expect(await send()).toBe(false);
    expect(h.activity).not.toHaveBeenCalled();
  });

  it("fails soft on a transport exception without recording delivery", async () => {
    h.send.mockRejectedValue(new Error("provider failed"));
    expect(await send()).toBe(false);
    expect(h.activity).not.toHaveBeenCalled();
  });
});

it("preserves the distinct existing tenant scope of customer and owner envelopes", async () => {
  await sendBookingConfirmation(booking);
  expect(h.send.mock.calls[0]![0]).not.toHaveProperty("tenantId");
  await sendNewBookingOwnerEmail(owner);
  expect(h.send.mock.calls[1]![0]).toHaveProperty("tenantId", "studio");
});

it("keeps a completed booking send successful when CRM is unavailable", async () => {
  h.activity.mockRejectedValue(new Error("redis failed"));
  expect(await sendNewBookingOwnerEmail(owner)).toBe(true);
  expect(h.send).toHaveBeenCalledOnce();
  expect(h.activity).toHaveBeenCalledOnce();
});

it("preserves fail-soft legacy sender behavior when a workspace module cannot load", async () => {
  const registered = workspacePorts();
  registerWorkspacePorts({ ...registered, bookingEmails: async () => { throw new Error("module failed to load"); } });
  const legacy = await import("@/lib/delivery-email");
  expect(await legacy.sendBookingConfirmation(booking)).toBe(false);
  expect(await legacy.sendNewBookingOwnerEmail(owner)).toBe(false);
  expect(h.send).not.toHaveBeenCalled();
  expect(h.activity).not.toHaveBeenCalled();
});

it("loads the same completed send implementation for direct and legacy callers", async () => {
  const ports: WorkspacePorts = workspacePorts();
  expect((await ports.bookingEmails()).sendNewBookingOwnerEmail).toBe(sendNewBookingOwnerEmail);
  expect((await ports.operatorNotices()).sendNewIntakeLeadEmail).toBe(sendNewIntakeLeadEmail);
});
