/**
 * Switch-on guarantees for owner email (design-notes/SWITCH-ON.md):
 * claim and Needs you mail go out only on their own stream switch, only to an
 * address confirmed for the business in data, only for things that happened
 * after the switch time, never past a per-tenant "off", and every attempt is
 * logged without the address.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailBusinessContext } from "@/platform/infra/email/business-context";

const mocks = vi.hoisted(() => ({ context: vi.fn(), override: vi.fn(), send: vi.fn() }));
vi.mock("@/platform/infra/email/business-context", () => ({ resolveEmailBusinessContext: mocks.context }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: mocks.override }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: vi.fn(), resolveTenantBrand: vi.fn(), resolveAgencyEmailIdentity: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));

import { sendEmailWithReceipt, type SendEmailInput, type SendEmailResult } from "@/platform/infra/email/send";
import { ownerEmailSince, ownerEmailStreamOn, recipientFingerprint, setOwnerEmailConfirmationDb } from "@/platform/infra/email/owner-streams";
import { createNeedsYouService } from "@/platform/needs-you/service";
import type { DeliveryRow, NeedsYouStore } from "@/platform/needs-you/repository";
import type { OwnerDecision } from "@/platform/needs-you/contracts";
import type { SourceAdapter } from "@/platform/needs-you/adapters";
import { emailOwnerClaim } from "@/products/agency-clients/claim-email";
import type { OwnerClaim } from "@/products/agency-clients/contracts";
import { deliverWorkspaceInvitation } from "@/platform/workspaces/invitation-delivery";

const WS = "5c000000-0000-4000-8000-000000000001";
const OWNER = "owner@bakery.example.test";
const CANDIDATE = "contact@bakery.example.test"; // on file from the site, never confirmed
const SINCE = "2026-10-16T14:00:00Z";
const AFTER = "2026-10-16T15:00:00Z";
const BEFORE = "2026-10-12T09:00:00Z";
const context: EmailBusinessContext = { workspaceId: WS, tenantIds: ["bakery"], ownerAuthorship: "platform", businessName: "Bakery", replyTo: null, timeZone: "America/New_York" };

const confirmed = new Set<string>([`${WS}:${OWNER}`]);
const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
  if (name !== "owner_email_confirmed") return { data: null, error: { message: "unknown rpc" } };
  return { data: confirmed.has(`${args.p_workspace_id}:${args.p_email}`), error: null };
});

function needsYouMail(over: Partial<SendEmailInput> = {}): SendEmailInput {
  return { audience: "client", workspaceId: WS, tenantId: "bakery", to: OWNER, subject: "1 decision needs you",
    options: { heading: "1 decision needs you", paragraphs: ["Open it."] },
    ownerStream: { stream: "needs_you", workspaceId: WS, eventAt: AFTER }, ...over } as SendEmailInput;
}

let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["EMAIL_SENDING_ENABLED", "CUSTOMER_EMAIL_ENABLED", "STRELVA_OWNER_EMAIL_STREAMS", "STRELVA_OWNER_EMAIL_SINCE"]) vi.stubEnv(key, "");
  vi.stubEnv("RESEND_API_KEY", "fictional-test-key");
  vi.stubEnv("APPROVE_LINK_SECRET", "fictional-approve-link-secret-for-tests");
  vi.stubEnv("STRELVA_OWNER_EMAIL_STREAMS", "owner_claim,needs_you");
  vi.stubEnv("STRELVA_OWNER_EMAIL_SINCE", SINCE);
  mocks.context.mockResolvedValue(context);
  mocks.override.mockResolvedValue("inherit");
  mocks.send.mockResolvedValue({ data: { id: "provider-1" }, error: null });
  setOwnerEmailConfirmationDb({ rpc });
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); setOwnerEmailConfirmationDb(null); info.mockRestore(); warn.mockRestore(); });

const logged = () => [...info.mock.calls, ...warn.mock.calls].map(call => call.join(" ")).join("\n");

describe("switches", () => {
  it("reads only listed, known streams, so a typo turns nothing on", () => {
    expect(ownerEmailStreamOn("needs_you", { STRELVA_OWNER_EMAIL_STREAMS: " owner_claim , needs_you " })).toBe(true);
    expect(ownerEmailStreamOn("needs_you_reminders", { STRELVA_OWNER_EMAIL_STREAMS: "owner_claim,needs_you" })).toBe(false);
    expect(ownerEmailStreamOn("needs_you", { STRELVA_OWNER_EMAIL_STREAMS: "needs-you" })).toBe(false);
    expect(ownerEmailStreamOn("needs_you", {})).toBe(false);
  });
  it("accepts only a zoned ISO switch time", () => {
    expect(ownerEmailSince({ STRELVA_OWNER_EMAIL_SINCE: SINCE })).toBe(Date.parse(SINCE));
    expect(ownerEmailSince({ STRELVA_OWNER_EMAIL_SINCE: "2026-10-16T10:00:00-04:00" })).toBe(Date.parse(SINCE));
    for (const bad of ["", "2026-10-16", "yesterday", "2026-10-16T14:00:00"]) expect(ownerEmailSince({ STRELVA_OWNER_EMAIL_SINCE: bad })).toBeNull();
  });
});

describe("transport", () => {
  it("sends a Needs you email to a confirmed owner after the switch and logs it without the address", async () => {
    expect(await sendEmailWithReceipt(needsYouMail())).toMatchObject({ status: "accepted", providerMessageId: "provider-1" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("owner_email_confirmed", { p_workspace_id: WS, p_email: OWNER });
    expect(logged()).toContain(`[email] owner-stream needs_you accepted workspace=${WS} recipient=${recipientFingerprint(OWNER)} message=provider-1`);
    expect(logged()).not.toContain(OWNER);
    expect(logged()).not.toContain("1 decision needs you");
  });

  it("never sends to an address that is only on file, and logs the hold", async () => {
    expect(await sendEmailWithReceipt(needsYouMail({ to: CANDIDATE }))).toEqual({ status: "suppressed", reason: "owner_email_unconfirmed" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(logged()).toContain("owner-stream needs_you suppressed");
    expect(logged()).toContain("reason=owner_email_unconfirmed");
    expect(logged()).not.toContain(CANDIDATE);
  });

  it("holds when the confirmation read fails or the migration is not applied", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "function owner_email_confirmed does not exist" } });
    expect(await sendEmailWithReceipt(needsYouMail())).toEqual({ status: "suppressed", reason: "owner_email_unconfirmed" });
    setOwnerEmailConfirmationDb({ rpc: async () => { throw new Error("network"); } });
    expect(await sendEmailWithReceipt(needsYouMail())).toEqual({ status: "suppressed", reason: "owner_email_unconfirmed" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("never mails something from before the switch time", async () => {
    expect(await sendEmailWithReceipt(needsYouMail({ ownerStream: { stream: "needs_you", workspaceId: WS, eventAt: BEFORE } }))).toEqual({ status: "suppressed", reason: "owner_email_before_switch" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends nothing on a stream while the switch time is unset, even with client email globally on", async () => {
    vi.stubEnv("STRELVA_OWNER_EMAIL_SINCE", "");
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    expect(await sendEmailWithReceipt(needsYouMail())).toEqual({ status: "suppressed", reason: "owner_email_since_unset" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(["bakery", `workspace:${WS}`])("respects a per-tenant off (%s) on the stream", async silenced => {
    mocks.override.mockImplementation(async (key: string) => key === silenced ? "off" : "inherit");
    expect(await sendEmailWithReceipt(needsYouMail())).toMatchObject({ status: "suppressed" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("opens only its own stream: other client mail stays off", async () => {
    // A weekly report has no stream and stays behind the global client switch.
    expect(await sendEmailWithReceipt(needsYouMail({ ownerStream: undefined }))).toMatchObject({ status: "suppressed", reason: "email_suppressed_or_unconfigured" });
    // Reminders are their own stream and are not in the switch-on list.
    expect(await sendEmailWithReceipt(needsYouMail({ ownerStream: { stream: "needs_you_reminders", workspaceId: WS, eventAt: AFTER } }))).toMatchObject({ status: "suppressed" });
    vi.stubEnv("STRELVA_OWNER_EMAIL_STREAMS", "owner_claim");
    expect(await sendEmailWithReceipt(needsYouMail())).toMatchObject({ status: "suppressed" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses a stream send to several recipients, another business, or a non-owner audience", async () => {
    expect(await sendEmailWithReceipt(needsYouMail({ to: [OWNER, CANDIDATE] }))).toEqual({ status: "suppressed", reason: "owner_stream_recipient_count" });
    expect(await sendEmailWithReceipt(needsYouMail({ ownerStream: { stream: "needs_you", workspaceId: "5c000000-0000-4000-8000-000000000009", eventAt: AFTER } }))).toEqual({ status: "suppressed", reason: "owner_stream_scope_mismatch" });
    vi.stubEnv("PROSPECT_EMAILS_ENABLED", "true");
    expect(await sendEmailWithReceipt(needsYouMail({ audience: "prospect" }))).toEqual({ status: "suppressed", reason: "owner_stream_audience" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("logs a provider failure on the stream and still throws to the caller", async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: "provider down" } });
    await expect(sendEmailWithReceipt(needsYouMail())).rejects.toThrow("provider down");
    expect(logged()).toContain("owner-stream needs_you failed");
  });
});

// Needs you delivery ---------------------------------------------------------

function row(id: string, openedAt: string, over: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    id, workspaceId: WS, systemId: null, kind: "content.change", route: "owner_decides", title: `Decision ${id}`, detail: null,
    approveEffect: "Strelva makes it live.", notYetEffect: "Nothing changes.", sourceLifecycle: "service_request", sourceId: `src-${id}`,
    revisionHash: `rev-${id}`, urgent: false, signInRequired: false, adminMayDecide: false, openHref: null, state: "open", outcome: null,
    outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "not_sent", operatorNote: null, openedAt,
    expiresAt: "2026-11-30T00:00:00Z", reminded1At: null, reminded2At: null, deliveries: [],
    businessName: "Bakery", timezone: "America/New_York", recipient: { email: OWNER, from: "record", tenantId: null, trusted: true }, ...over,
  } as DeliveryRow;
}

function chaseHarness(rows: DeliveryRow[], since: number | null) {
  const recorded: Array<{ id: string; kind: string; status: string; reason: string | null }> = [];
  const store = {
    linkedTenants: async () => [],
    dueForDelivery: async () => rows,
    recordDelivery: async (_ws: string, id: string, kind: string, status: string, _r: string | null, _p: string | null, reason: string | null) => {
      recorded.push({ id, kind, status, reason });
      return rows.find(item => item.id === id) as OwnerDecision;
    },
  } as unknown as NeedsYouStore;
  const adapter = {
    lifecycle: "service_request", needsMemberActor: false,
    propose: async () => ({ items: [], complete: true }),
    currentRevision: async (_ctx: unknown, sourceId: string) => rows.find(item => item.sourceId === sourceId)?.revisionHash ?? null,
    resolve: async () => ({ outcome: "done" as const }),
  } as unknown as SourceAdapter;
  const sendEmail = vi.fn<(input: SendEmailInput) => Promise<SendEmailResult>>(async () => ({ status: "accepted", providerMessageId: "p", acceptedAt: AFTER }));
  // 07:30 in New York on Oct 17: the morning email hour.
  const service = createNeedsYouService({ store, adapters: [adapter], sendEmail, appOrigin: "https://app.example.test", now: () => Date.parse("2026-10-17T11:30:00Z"), ownerEmailSince: () => since });
  return { service, sendEmail, recorded };
}

describe("Needs you on first enable", () => {
  it("mails only decisions opened after the switch, and records the older ones as never mailed", async () => {
    const h = chaseHarness([row("old", BEFORE), row("new", AFTER)], Date.parse(SINCE));
    const summary = await h.service.chase();
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const sent = h.sendEmail.mock.calls[0]![0];
    expect(sent.ownerStream).toEqual({ stream: "needs_you", workspaceId: WS, eventAt: new Date(AFTER).toISOString() });
    expect(sent.options?.decisions?.map(decision => decision.title)).toEqual(["Decision new"]);
    expect(h.recorded).toContainEqual({ id: "old", kind: "digest", status: "suppressed", reason: "opened_before_owner_email_on" });
    expect(h.recorded).toContainEqual(expect.objectContaining({ id: "new", kind: "digest", status: "sent" }));
    expect(summary.ownerNotTold).toBe(1);
  });

  it("sends nothing at all when every waiting decision predates the switch", async () => {
    const h = chaseHarness([row("a", BEFORE), row("b", "2026-10-01T09:00:00Z")], Date.parse(SINCE));
    await h.service.chase();
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.recorded.map(entry => entry.reason)).toEqual(["opened_before_owner_email_on", "opened_before_owner_email_on"]);
  });

  it("mails one decision as the XA Waits for you email with the signed yes link, and several as the list", async () => {
    const one = chaseHarness([row("new", AFTER)], Date.parse(SINCE));
    await one.service.chase();
    const single = one.sendEmail.mock.calls[0]![0].options!;
    expect(single.xa?.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "headline", text: "Decision new" }),
      expect.objectContaining({ kind: "primary", action: expect.objectContaining({ label: "Review and say yes", url: single.decisions![0]!.approve!.url }) }),
    ]));
    const two = chaseHarness([row("a", AFTER), row("b", AFTER)], Date.parse(SINCE));
    await two.service.chase();
    const list = two.sendEmail.mock.calls[0]![0].options!;
    expect(list.xa).toBeUndefined();
    expect(list.decisions).toHaveLength(2);
  });

  it("puts reminders on their own stream", async () => {
    const h = chaseHarness([row("r", "2026-10-13T16:00:00Z", { deliveryState: "sent" })], Date.parse("2026-10-13T00:00:00Z"));
    await h.service.chase();
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.sendEmail.mock.calls[0]![0].ownerStream).toMatchObject({ stream: "needs_you_reminders" });
  });

  it("without a switch time still marks every send as a stream send, which the transport then holds", async () => {
    const h = chaseHarness([row("new", AFTER)], null);
    await h.service.chase();
    expect(h.sendEmail.mock.calls[0]![0].ownerStream).toMatchObject({ stream: "needs_you" });
  });
});

// Owner claim ------------------------------------------------------------------

const claim: OwnerClaim = { claimId: "5c000000-0000-4000-8000-000000000003", customerWorkspaceId: WS, workspaceName: "Bakery", recipientEmail: CANDIDATE,
  claimPath: `/workspace/claim/${"t".repeat(43)}`, delivery: { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: true },
  expiresAt: "2099-01-01T00:00:00Z", createdAt: AFTER, replacedPending: false };
const agencyActor = { userId: "5c000000-0000-4000-8000-0000000000a1", verifiedEmail: "member@agency.example.test" };

describe("owner claim", () => {
  it("goes through the transport as an owner_claim stream send and says when the address is not confirmed", async () => {
    const claimRpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const delivery = await emailOwnerClaim(agencyActor, "5c000000-0000-4000-8000-000000000002", claim, { rpc: claimRpc, released: () => true, agencyName: "North Studio", send: sendEmailWithReceipt });
    expect(delivery).toMatchObject({ status: "not_sent", reason: "owner_email_unconfirmed" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(claimRpc).toHaveBeenLastCalledWith("record_agency_owner_claim_email", expect.objectContaining({ p_delivery: expect.objectContaining({ reason: "owner_email_unconfirmed" }) }));
  });

  it("emails a confirmed owner and logs it", async () => {
    const claimRpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const delivery = await emailOwnerClaim(agencyActor, "5c000000-0000-4000-8000-000000000002", { ...claim, recipientEmail: OWNER }, { rpc: claimRpc, released: () => true, agencyName: "North Studio", send: sendEmailWithReceipt });
    expect(delivery).toMatchObject({ status: "accepted" });
    expect(logged()).toContain("owner-stream owner_claim accepted");
  });

  it("never mails a claim issued before the switch", async () => {
    const claimRpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const delivery = await emailOwnerClaim(agencyActor, "5c000000-0000-4000-8000-000000000002", { ...claim, recipientEmail: OWNER, createdAt: BEFORE }, { rpc: claimRpc, released: () => true, agencyName: "North Studio", send: sendEmailWithReceipt });
    expect(delivery).toMatchObject({ status: "not_sent", reason: "email_suppressed" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("owner invitation", () => {
  const invitation = { id: "5c000000-0000-4000-8000-000000000004", workspaceId: WS, recipientEmail: OWNER, role: "owner" as const, createdAt: AFTER };
  const issue = (over: Partial<typeof invitation> = {}) => deliverWorkspaceInvitation({ invitation: { ...invitation, ...over }, acceptUrl: "https://app.example.test/accept", workspaceName: "Bakery", inviterLabel: "Strelva" });

  it("emails an owner invitation on the owner_claim stream to a confirmed owner only", async () => {
    vi.stubEnv("STRELVA_INVITATION_EMAIL_RELEASE", "1");
    expect(await issue()).toMatchObject({ status: "accepted" });
    expect(await issue({ recipientEmail: CANDIDATE })).toEqual({ status: "not_sent", reason: "owner_email_unconfirmed" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("keeps team invitations and an unreleased path off", async () => {
    expect(await issue()).toEqual({ status: "not_sent", reason: "release_off" });
    vi.stubEnv("STRELVA_INVITATION_EMAIL_RELEASE", "1");
    expect(await issue({ role: "member" as never })).toEqual({ status: "not_sent", reason: "email_off" });
    vi.stubEnv("STRELVA_OWNER_EMAIL_STREAMS", "needs_you");
    expect(await issue()).toEqual({ status: "not_sent", reason: "email_off" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
