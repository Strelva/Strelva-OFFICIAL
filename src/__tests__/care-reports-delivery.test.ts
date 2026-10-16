import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCareReportRelease, type CareReportDeliveryDeps, type CareReportSendInput } from "@/platform/care-reports/delivery";
import { careReportEmailEnabled, careReportShareLinksEnabled, careReportsMayBeOn } from "@/platform/care-reports/release";
import { mintCareReportToken, careReportTokenHash, careReportShareUrl, careReportWorkspaceUrl, requestOrigin } from "@/platform/care-reports/share";
import { AGENCY, BUSINESS, facts, RELEASE, REPORT } from "./care-reports-fixtures";

const actor = { userId: "7f000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const input: CareReportSendInput = {
  reportId: REPORT, agencyWorkspaceId: AGENCY, businessWorkspaceId: BUSINESS, businessName: "Harbor Dental", release: 1, releaseId: RELEASE,
  facts: facts(), link: "https://app.example.test/workspace/care-reports/x",
};

function deps(patch: Partial<CareReportDeliveryDeps> = {}) {
  const value = {
    resolveOwnerRecipient: vi.fn(async () => ({ email: "owner@harbor.example.test", verified: true })),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    send: vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "msg_1", acceptedAt: "2026-10-15T00:00:00Z" })),
    reserve: vi.fn(async () => ({ deliveryId: "d1", token: "t1" })),
    record: vi.fn(async () => ({ status: "accepted" as const })),
    agencyIdentity: vi.fn(async () => ({ name: "North Studio" })),
    ...patch,
  };
  return value as typeof value & CareReportDeliveryDeps;
}

beforeEach(() => { vi.stubEnv("STRELVA_CARE_REPORT_EMAIL", ""); vi.stubEnv("EMAIL_SENDING_ENABLED", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("Care plan report email", () => {
  it("is held by default and records one suppressed row without touching a provider", async () => {
    const d = deps();
    await expect(sendCareReportRelease(actor, input, d)).resolves.toEqual({ status: "suppressed", reason: "email_off" });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.resolveOwnerRecipient).not.toHaveBeenCalled();
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.record).toHaveBeenCalledTimes(1);
    expect(d.record).toHaveBeenCalledWith(actor, RELEASE, null, "suppressed", "email_off", null);
  });

  it("needs both switches", () => {
    expect(careReportEmailEnabled({ STRELVA_CARE_REPORT_EMAIL: "1" })).toBe(false);
    expect(careReportEmailEnabled({ EMAIL_SENDING_ENABLED: "true" })).toBe(false);
    expect(careReportEmailEnabled({ STRELVA_CARE_REPORT_EMAIL: "1", EMAIL_SENDING_ENABLED: "true" })).toBe(true);
  });

  describe("with email on", () => {
    beforeEach(() => { vi.stubEnv("STRELVA_CARE_REPORT_EMAIL", "1"); vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); });

    it("holds when there is no trusted owner address", async () => {
      for (const recipient of [null, { email: "a@b.test", verified: false }]) {
        const d = deps({ resolveOwnerRecipient: vi.fn(async () => recipient) });
        await expect(sendCareReportRelease(actor, input, d)).resolves.toMatchObject({ reason: "no_trusted_owner_recipient" });
        expect(d.send).not.toHaveBeenCalled();
      }
      const d = deps({ resolveOwnerRecipient: vi.fn(async () => { throw new Error("down"); }) });
      await expect(sendCareReportRelease(actor, input, d)).resolves.toMatchObject({ reason: "no_trusted_owner_recipient" });
    });

    it("holds a staff address and an unchecked one", async () => {
      const staff = deps({ rpc: vi.fn(async () => ({ data: "agency_staff", error: null })) });
      await expect(sendCareReportRelease(actor, input, staff)).resolves.toMatchObject({ reason: "owner_recipient_is_staff" });
      const broken = deps({ rpc: vi.fn(async () => ({ data: null, error: { message: "x" } })) });
      await expect(sendCareReportRelease(actor, input, broken)).resolves.toMatchObject({ reason: "owner_recipient_check_unavailable" });
      expect(staff.send).not.toHaveBeenCalled();
      expect(broken.send).not.toHaveBeenCalled();
    });

    it("reserves, sends under the agency's name and settles accepted", async () => {
      const d = deps();
      await expect(sendCareReportRelease(actor, input, d)).resolves.toEqual({ status: "accepted" });
      expect(d.rpc).toHaveBeenCalledWith("owner_contact_staff_reason", { p_customer_workspace_id: BUSINESS, p_email: "owner@harbor.example.test" });
      const sent = (d.send as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(sent).toMatchObject({
        audience: "client", authorship: "agency", workspaceId: BUSINESS, idempotencyKey: `care-report:${RELEASE}`,
        provider: { businessWorkspaceId: BUSINESS, agencyWorkspaceId: AGENCY }, subject: "North Studio: Harbor Dental · October 2026 report",
      });
      expect(d.record).toHaveBeenCalledWith(actor, RELEASE, { deliveryId: "d1", token: "t1" }, "accepted", null, "msg_1");
    });

    it("names the agency as it is now, not as the snapshot froze it, and carries the agency's note", async () => {
      const stale = { ...input, facts: { ...input.facts, agency: { ...input.facts.agency, name: "Old Studio Name" } }, agencyNote: "We moved the booking button above the fold." };
      const d = deps({ agencyIdentity: vi.fn(async () => ({ name: "North Studio" })) });
      await sendCareReportRelease(actor, stale, d);
      const sent = (d.send as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { subject: string; html: string; text: string };
      expect(d.agencyIdentity).toHaveBeenCalledWith(AGENCY);
      expect(sent.subject).toBe("North Studio: Harbor Dental · October 2026 report");
      expect(sent.subject).not.toContain("Old Studio Name");
      expect(sent.text).toContain("We moved the booking button above the fold.");
      expect(sent.html).toContain("We moved the booking button above the fold.");
    });

    it("holds the send when the agency's name can't be read now", async () => {
      const d = deps({ agencyIdentity: vi.fn(async () => null) });
      await expect(sendCareReportRelease(actor, input, d)).resolves.toEqual({ status: "suppressed", reason: "agency_identity_unavailable" });
      expect(d.reserve).not.toHaveBeenCalled();
      expect(d.send).not.toHaveBeenCalled();
    });

    it("settles a provider hold with its reason", async () => {
      const d = deps({ send: vi.fn(async () => ({ status: "suppressed" as const, reason: "client_email_off" })) });
      await expect(sendCareReportRelease(actor, input, d)).resolves.toEqual({ status: "suppressed", reason: "client_email_off" });
      expect(d.record).toHaveBeenCalledWith(actor, RELEASE, { deliveryId: "d1", token: "t1" }, "suppressed", "client_email_off", null);
    });

    it("settles unknown and rethrows when the send throws", async () => {
      const d = deps({ send: vi.fn(async () => { throw new Error("timeout"); }) });
      await expect(sendCareReportRelease(actor, input, d)).rejects.toThrow("timeout");
      expect(d.record).toHaveBeenCalledWith(actor, RELEASE, { deliveryId: "d1", token: "t1" }, "unknown", null, null);
    });
  });
});

describe("Care plan report switches and links", () => {
  it("is off without both release switches", () => {
    expect(careReportsMayBeOn({})).toBe(false);
    expect(careReportsMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1" })).toBe(false);
    expect(careReportsMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_CARE_REPORTS_RELEASE: "workspace" })).toBe(true);
    expect(careReportShareLinksEnabled({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_CARE_REPORTS_RELEASE: "workspace" })).toBe(false);
    expect(careReportShareLinksEnabled({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_CARE_REPORTS_RELEASE: "workspace", STRELVA_CARE_REPORT_SHARE_LINKS: "1" })).toBe(true);
    expect(careReportShareLinksEnabled({ STRELVA_CARE_REPORT_SHARE_LINKS: "1" })).toBe(false);
  });

  it("mints unguessable tokens and hashes them", () => {
    const { token, tokenHash } = mintCareReportToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(careReportTokenHash(token)).toBe(tokenHash);
    expect(careReportTokenHash("short")).toBeNull();
    expect(mintCareReportToken().token).not.toBe(token);
    expect(careReportShareUrl("https://x.test", token)).toBe(`https://x.test/care-reports/${token}`);
    expect(careReportWorkspaceUrl("https://x.test", REPORT, BUSINESS, 2)).toBe(`https://x.test/workspace/care-reports/${REPORT}?workspaceId=${BUSINESS}&release=2`);
  });

  it("derives the origin from the request when no app URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const headers = new Headers({ host: "localhost:3000" });
    expect(requestOrigin(headers)).toBe("http://localhost:3000");
    expect(requestOrigin(new Headers({ "x-forwarded-host": "app.test", "x-forwarded-proto": "https" }))).toBe("https://app.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://strelva.test/");
    expect(requestOrigin(headers)).toBe("https://strelva.test");
    vi.unstubAllEnvs();
  });
});
