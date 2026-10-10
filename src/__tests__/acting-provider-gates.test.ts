import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
    batch = { send };
  },
}));

import { batchEmailSuppression, sendEmailWithReceipt } from "@/platform/infra/email/send";
import { senderDomain, setAgencyGateDb, type AgencyGateDb } from "@/platform/infra/email/provider-gate";
import { actingAgencyRefusal, assertActingAgency, type ActingAgencyDb } from "@/platform/workspaces/acting-provider";
import { WorkspaceStoreError } from "@/platform/workspaces/types";
import type { SendEmailInput } from "@/platform/infra/email/send";

const business = "11111111-1111-4111-8111-111111111111";
const agency = "22222222-2222-4222-8222-222222222222";
const person = { userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "staff@agency.example.test" };

function gateDb(allowed: boolean | "error"): AgencyGateDb & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    async rpc(name, args) {
      expect(name).toBe("provider_email_send_allowed");
      calls.push(args);
      return allowed === "error" ? { data: null, error: { message: "boom" } } : { data: allowed, error: null };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_DOMAIN", "");
  send.mockResolvedValue({ data: { id: "mail_1" }, error: null });
});

afterEach(() => {
  setAgencyGateDb(null);
  vi.unstubAllEnvs();
});

const mail = (over: Partial<SendEmailInput> = {}): SendEmailInput => ({
  audience: "client", to: "owner@example.test", subject: "Hello", html: "<p>Hi</p>", text: "Hi", ...over,
} as SendEmailInput);

describe("the acting-agency refusal words", () => {
  it("maps each SQL reason and nothing else", () => {
    expect(actingAgencyRefusal("P0001 acting_provider_not_staffed")).toMatch(/not on this business/);
    expect(actingAgencyRefusal("acting_provider_unverified")).toMatch(/isn't verified/);
    expect(actingAgencyRefusal("acting_provider_no_mandate")).toMatch(/owner hasn't given your agency permission/);
    expect(actingAgencyRefusal("workspace_access_denied")).toBeNull();
    expect(actingAgencyRefusal(undefined)).toBeNull();
  });
});

describe("assertActingAgency", () => {
  it("asks the database for this person, effect and resource, and returns the agency", async () => {
    const rpc = vi.fn(async () => ({ data: agency, error: null }));
    await expect(assertActingAgency(person, business, { effect: "google", kind: "google_location", ref: "loc1" }, { rpc } as ActingAgencyDb)).resolves.toBe(agency);
    expect(rpc).toHaveBeenCalledWith("assert_acting_provider", {
      p_workspace_id: business, p_user_id: person.userId, p_verified_email: person.verifiedEmail,
      p_effect: "google", p_resource_kind: "google_location", p_resource_ref: "loc1",
    });
  });

  it("refuses with the agency's words, and fails closed on anything else", async () => {
    const refused = { rpc: async () => ({ data: null, error: { message: "acting_provider_no_mandate" } }) };
    await expect(assertActingAgency(person, business, { effect: "publish", kind: "domain", ref: "www.example.test" }, refused))
      .rejects.toMatchObject({ name: "WorkspaceAccessError", message: expect.stringMatching(/permission/) });
    const broken = { rpc: async () => ({ data: null, error: { message: "connection reset" } }) };
    await expect(assertActingAgency(person, business, { effect: "email", kind: "sender", ref: "mail.example.test" }, broken)).rejects.toBeInstanceOf(WorkspaceStoreError);
    const garbage = { rpc: async () => ({ data: "not-a-uuid", error: null }) };
    await expect(assertActingAgency(person, business, { effect: "email", kind: "sender", ref: "mail.example.test" }, garbage)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(assertActingAgency({ ...person, userId: "nope" }, business, { effect: "email", kind: "sender", ref: "x.test" }, garbage)).rejects.toThrow();
  });
});

describe("email sent for a business by its agency", () => {
  it("leaves sends without an agency unchanged", async () => {
    const db = gateDb(false);
    setAgencyGateDb(db);
    expect((await sendEmailWithReceipt(mail())).status).toBe("accepted");
    expect(db.calls).toHaveLength(0);
  });

  it("needs the agency's gate for the actual sending domain", async () => {
    const db = gateDb(true);
    setAgencyGateDb(db);
    const result = await sendEmailWithReceipt(mail({ provider: { businessWorkspaceId: business, agencyWorkspaceId: agency }, fromAddress: "report@Mail.Strelva.com" }));
    expect(result.status).toBe("accepted");
    expect(db.calls).toEqual(Array(2).fill({ p_workspace_id: business, p_agency_workspace_id: agency, p_sender: "mail.strelva.com" }));
    await sendEmailWithReceipt(mail({ provider: { businessWorkspaceId: business } }));
    expect(db.calls[2]).toEqual({ p_workspace_id: business, p_agency_workspace_id: null, p_sender: "updates.strelva.com" });
  });

  it("rechecks revocation immediately before dispatch", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    setAgencyGateDb({ rpc });
    expect(await sendEmailWithReceipt(mail({ provider: { businessWorkspaceId: business } }))).toMatchObject({ status: "suppressed", reason: "provider_not_cleared" });
    expect(send).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("suppresses when the agency is not cleared, or the gate cannot answer", async () => {
    for (const answer of [false, "error"] as const) {
      setAgencyGateDb(gateDb(answer));
      expect(await sendEmailWithReceipt(mail({ provider: { businessWorkspaceId: business } }))).toEqual({ status: "suppressed", reason: "email_suppressed_or_unconfigured" });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("never asks the gate while the audience itself is off", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "");
    const db = gateDb(true);
    setAgencyGateDb(db);
    expect((await sendEmailWithReceipt(mail({ provider: { businessWorkspaceId: business } }))).status).toBe("suppressed");
    expect(db.calls).toHaveLength(0);
  });

  it("gates a batch on its from address", async () => {
    setAgencyGateDb(gateDb(false));
    expect(await batchEmailSuppression({ audience: "client", provider: { businessWorkspaceId: business }, fromAddress: "news@mail.strelva.com" })).toBe("not sent: provider not cleared");
    setAgencyGateDb(gateDb(true));
    expect(await batchEmailSuppression({ audience: "client", provider: { businessWorkspaceId: business }, fromAddress: "news@mail.strelva.com" })).toBeNull();
  });

  it("reads the sending domain from an address", () => {
    expect(senderDomain("Hello@Updates.Strelva.com")).toBe("updates.strelva.com");
  });
});
