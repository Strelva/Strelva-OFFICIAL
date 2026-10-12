import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ ownerBrand: vi.fn(), tenantBrand: vi.fn(), identity: vi.fn(), send: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
vi.mock("@/platform/agency-brand/server", () => ({
  resolveOwnerBrand: mock.ownerBrand,
  resolveTenantBrand: mock.tenantBrand,
  resolveAgencyEmailIdentity: mock.identity,
}));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: async () => "inherit" }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mock.send }; } }));

import { StrelvaSidebar } from "@/experience/app-frame/StrelvaSidebar";
import { StEntry } from "@/components/ui/strelva/Kit";
import { STRELVA_BRAND, type OwnerBrand } from "@/platform/infra/agency-brand";
import { renderPaperEmailHtml, renderPaperEmailText } from "@/platform/infra/email/paper";
import { morningNeedsYouEmail, urgentNeedsYouEmail } from "@/platform/infra/email/paper-templates";
import { sendEmailWithReceipt, type SendEmailInput } from "@/platform/infra/email/send";

const workspaceId = "b2640000-0000-4000-8000-000000000010";
const agency: OwnerBrand = {
  agencyId: "b2640000-0000-4000-8000-000000000020", name: "North Studio",
  logoUrl: "https://app.strelva.com/api/agency-brand/logo/fixture/digest",
  accentColor: "#447a4f", replyTo: "team@north.example", credit: "runs_on_strelva",
};
const unavailable: OwnerBrand = { ...STRELVA_BRAND, name: "Agency identity unavailable", accentColor: "#565d64" };
const ownerMessage: SendEmailInput = {
  audience: "client", workspaceId, to: "owner@example.test", subject: "New inquiry",
  options: { heading: "New inquiry", paragraphs: ["A customer reached The Mooney Firm."] },
};
const action = { label: "Open", url: "https://app.strelva.com/workspace" };
function payload(): { from: string; replyTo: string; html: string; text: string } {
  expect(mock.send).toHaveBeenCalledTimes(1);
  return mock.send.mock.calls[0]![0];
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "fictional-test-key");
  vi.stubEnv("RESEND_DOMAIN", "updates.strelva.com");
  vi.stubEnv("REPLY_TO_EMAIL", "hello@strelva.com");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
  vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
  mock.ownerBrand.mockResolvedValue(agency);
  mock.tenantBrand.mockResolvedValue(agency);
  mock.identity.mockResolvedValue({ name: agency.name, replyTo: agency.replyTo });
  mock.send.mockResolvedValue({ data: { id: "fictional-message" }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("brand and actor coherence at the shared mail boundary", () => {
  it("clears cached nested business and agency presentation before rendering platform paper", async () => {
    await sendEmailWithReceipt({ ...ownerMessage, authorship: "platform", businessName: "Stale business", fromName: "Strelva billing", options: {
      heading: "Platform charge", paper: { subject: "Platform charge", sender: "Strelva billing", senderDetail: "", brand: agency, businessName: "Stale business", blocks: [], footer: "Payment needs attention" },
    } });
    for (const body of [payload().html, payload().text]) {
      expect(body).toContain("Strelva"); expect(body).not.toContain("Stale business"); expect(body).not.toContain(agency.name);
    }
  });

  it("renders the workspace-only owner's verified agency in both bodies and the envelope", async () => {
    expect(await sendEmailWithReceipt(ownerMessage)).toMatchObject({ status: "accepted" });
    const sent = payload();
    expect(mock.ownerBrand).toHaveBeenCalledWith(workspaceId);
    expect(mock.identity).toHaveBeenCalledWith(agency.agencyId);
    expect(sent.from).toBe('"North Studio" <hello@updates.strelva.com>');
    expect(sent.replyTo).toBe(agency.replyTo);
    expect(sent.html).toContain(agency.logoUrl);
    expect(sent.html).toContain('alt="North Studio"');
    for (const body of [sent.html, sent.text]) {
      expect(body).toContain("North Studio");
      expect(body).toContain("Runs on Strelva.");
      expect(body).not.toContain('alt="Strelva"');
    }
  });

  it("holds an agency-authored send when business brand lookup is unavailable despite a cached brand", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mock.ownerBrand.mockResolvedValue(unavailable);
    expect(await sendEmailWithReceipt({ ...ownerMessage, options: { ...ownerMessage.options!, brand: agency } }))
      .toEqual({ status: "suppressed", reason: "agency_identity_unavailable" });
    expect(mock.identity).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("agency_identity_unavailable"));
  });

  it("holds an agency-authored send after email identity is revoked", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mock.identity.mockResolvedValue(null);
    expect(await sendEmailWithReceipt(ownerMessage)).toEqual({ status: "suppressed", reason: "agency_identity_unavailable" });
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("keeps explicit platform billing as Strelva even when a client has an agency brand", async () => {
    await sendEmailWithReceipt({ ...ownerMessage, authorship: "platform", fromName: "Strelva billing",
      options: { brand: agency, heading: "Your payment didn't go through", paragraphs: ["Strelva couldn't process your platform subscription payment."] } });
    const sent = payload();
    expect(sent.from).toBe('"Strelva billing" <hello@updates.strelva.com>');
    expect(sent.html).toContain('alt="Strelva"');
    expect(sent.text).toContain("Strelva couldn't process your platform subscription payment.");
    for (const body of [sent.html, sent.text]) expect(body).not.toContain(agency.name);
    expect(mock.ownerBrand).not.toHaveBeenCalled();
    expect(mock.identity).not.toHaveBeenCalled();
  });

  it("shows the business to an end customer in From, HTML and text", async () => {
    await sendEmailWithReceipt({ audience: "customer", authorship: "business", workspaceId,
      businessName: "The Mooney Firm", to: "customer@example.test", subject: "Booking confirmed",
      options: { brand: agency, heading: "You're booked", paragraphs: ["Your time is confirmed."] } });
    const sent = payload();
    expect(sent.from).toBe('"The Mooney Firm" <hello@mail.strelva.com>');
    for (const body of [sent.html, sent.text]) {
      expect(body).toContain("The Mooney Firm");
      expect(body).not.toContain(agency.name);
      expect(body).not.toContain('alt="Strelva"');
    }
    expect(mock.ownerBrand).not.toHaveBeenCalled();
    expect(mock.identity).not.toHaveBeenCalled();
  });
});

describe("paper mail uses recorded actors independently of sender identity", () => {
  const urgentInput = {
    sender: agency.name, senderDetail: "For The Mooney Firm", subject: "A reply needs you",
    person: "A customer", source: "Website", inquiry: "Can we meet?", draft: "Here are the available times.",
    send: action, notYet: action, change: action, policyNote: "You decide before this reply is sent.",
  };

  it("credits the recorded drafting agency rather than the sender", () => {
    const mail = urgentNeedsYouEmail({ ...urgentInput, actor: { kind: "agency", displayName: "Lakeview Works" } });
    for (const body of [renderPaperEmailHtml(mail), renderPaperEmailText(mail)]) {
      expect(body).toContain("Your reply, drafted by Lakeview Works");
      expect(body).toContain("Runs on Strelva");
      expect(body).not.toContain("drafted by North Studio");
    }
  });

  it("does not infer a missing draft actor from the sender", () => {
    const mail = urgentNeedsYouEmail({ ...urgentInput, actor: null });
    for (const body of [renderPaperEmailHtml(mail), renderPaperEmailText(mail)]) {
      expect(body).toContain("Actor not recorded");
      expect(body).not.toContain("drafted by North Studio");
      expect(body).not.toContain("drafted by Strelva");
    }
  });

  it("shows each morning receipt's recorded actor and preserves unknown actors", () => {
    const mail = morningNeedsYouEmail({ sender: agency.name, senderDetail: "For The Mooney Firm", subject: "What changed",
      items: [], handled: "Strelva handled everything", receipts: [
        { actor: { kind: "agency", displayName: "Lakeview Works" }, action: "updated the website" },
        { actor: { kind: "platform" }, action: "checked the platform" },
        { actor: null, action: "saved a reply" },
      ] });
    for (const body of [renderPaperEmailHtml(mail), renderPaperEmailText(mail)]) {
      expect(body).toContain("What changed yesterday");
      expect(body).toContain("Lakeview Works · updated the website · Runs on Strelva");
      expect(body).toContain("Strelva · checked the platform");
      expect(body).toContain("Actor not recorded · saved a reply");
      expect(body).not.toContain("Strelva handled");
    }
    // Each receipt is its own line, never run together into one paragraph.
    expect(renderPaperEmailHtml(mail)).not.toMatch(/Runs on Strelva\s+Strelva · checked/);
    expect(mail.blocks.filter(block => block.kind === "paragraph" && /· (updated the website|checked the platform|saved a reply)/.test(block.text))).toHaveLength(3);
  });
});

describe("entry branding", () => {
  it("renders the verified agency's logo and name without the platform mark", () => {
    const html = renderToStaticMarkup(<StEntry brand={agency}><p>Sign in to your workspace</p></StEntry>);
    expect(html).toContain(agency.logoUrl);
    expect(html).toContain('alt="North Studio"');
    expect(html).toContain("North Studio");
    expect(html).not.toContain('viewBox="0 0 48 48"');
  });

  it("renders neutral unavailable identity without a Strelva substitution", () => {
    const html = renderToStaticMarkup(<StEntry brand={unavailable}><p>Sign in to your workspace</p></StEntry>);
    expect(html).toContain("Agency identity unavailable");
    expect(html).not.toContain("Strelva");
    expect(html).not.toContain('viewBox="0 0 48 48"');
  });
});

describe("neutral owner navigation identity", () => {
  it("keeps the provided neutral identity instead of rendering the platform brand", () => {
    const html = renderToStaticMarkup(<StrelvaSidebar ownerBrand={unavailable} accountName="Owner" signedIn={false} />);
    expect(html).toContain('aria-label="Agency identity unavailable navigation"');
    expect(html).toContain('aria-label="Agency identity unavailable home"');
    expect(html).not.toContain('aria-label="Strelva home"');
    expect(html).not.toContain('>Strelva</span>');
  });
});
