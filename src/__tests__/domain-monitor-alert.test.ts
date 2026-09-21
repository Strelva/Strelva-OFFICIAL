import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { sendDomainAlertEmail } from "@/products/domain-monitor/server";

const baseParams = {
  boardUrl: "https://admin.strelva.com/admin/uptime",
  down: [],
  expiring: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sendEmailMock.mockResolvedValue(true);
});

afterEach(() => vi.unstubAllEnvs());

describe("domain-monitor alert delivery", () => {
  it("sends a down alert to the default operator recipient", async () => {
    const sent = await sendDomainAlertEmail({
      ...baseParams,
      down: [{ siteName: "Orange Crate", host: "orangecrate.com", problem: "HTTP 503" }],
    });

    expect(sent).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: "operator",
        to: ["jacob@strelva.com"],
        subject: "Strelva ALERT: 1 site DOWN",
      }),
    );
    expect(sendEmailMock.mock.calls[0]![0]!.options).toMatchObject({
      heading: "1 Strelva site DOWN",
      rows: [{ label: "DOWN · Orange Crate", value: "orangecrate.com — HTTP 503" }],
      button: { label: "Open uptime board", url: baseParams.boardUrl },
    });
  });

  it("sends expiry alerts and uses the configured operator list", async () => {
    vi.stubEnv("LEAD_NOTIFY_EMAILS", "ops@strelva.com, owner@strelva.com");

    const sent = await sendDomainAlertEmail({
      ...baseParams,
      expiring: [{ siteName: "Rohlax", host: "rohlax.com", problem: "expires in 7d (2026-09-12)" }],
    });

    expect(sent).toBe(true);
    expect(sendEmailMock.mock.calls[0]![0]).toMatchObject({
      audience: "operator",
      to: ["ops@strelva.com", "owner@strelva.com"],
      subject: "Strelva: 1 domain expiring soon",
    });
  });

  it("sends an all-clear when the monitored set recovered", async () => {
    const sent = await sendDomainAlertEmail(baseParams);

    expect(sent).toBe(true);
    expect(sendEmailMock.mock.calls[0]![0]).toMatchObject({
      audience: "operator",
      subject: "Strelva: all monitored sites recovered",
      options: {
        heading: "Strelva sites recovered",
        paragraphs: ["All monitored sites are back up and no domains are within 30 days of expiry."],
        rows: undefined,
      },
    });
  });

  it("fails soft when the transport rejects", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("provider unavailable"));

    const sent = await sendDomainAlertEmail({
      ...baseParams,
      down: [{ siteName: "Acme", host: "acme.example", problem: "unreachable" }],
    });

    expect(sent).toBe(false);
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });
});
