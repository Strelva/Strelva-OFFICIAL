import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/email/send", () => ({ sendEmail: sendEmailMock }));

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
        subject: "orangecrate.com is down",
      }),
    );
    const paper = sendEmailMock.mock.calls[0]![0]!.options!.paper!;
    expect(paper.blocks).toContainEqual({ kind: "rows", rows: [{ label: "Orange Crate", value: "orangecrate.com · HTTP 503", tone: "need" }] });
    expect(paper.blocks).toContainEqual({ kind: "actions", full: true, actions: [{ label: "Open the uptime board", url: baseParams.boardUrl, style: "primary" }] });
    // Plain sentences: no capitals for alarm, no dashes standing in for words.
    expect(JSON.stringify(paper)).not.toMatch(/DOWN|ALERT|—/);
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
      subject: "rohlax.com expires within 30 days",
    });
  });

  it("sends an all-clear when the monitored set recovered", async () => {
    const sent = await sendDomainAlertEmail(baseParams);

    expect(sent).toBe(true);
    expect(sendEmailMock.mock.calls[0]![0]).toMatchObject({
      audience: "operator",
      subject: "Every monitored site is back up",
      options: {
        heading: "Every monitored site is back up",
        paper: { blocks: [{ kind: "paragraph", text: "Every monitored site answers again, and no domain expires within 30 days." }, { kind: "actions", full: true, actions: [{ label: "Open the uptime board", url: baseParams.boardUrl, style: "primary" }] }] },
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
