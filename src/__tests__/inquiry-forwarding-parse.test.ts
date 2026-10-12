import { describe, expect, it } from "vitest";
import { forwardingEmail, forwardingLocalPart } from "@/products/inquiry-forwarding/contracts";
import { FORWARDING_HOSTS, hostSteps } from "@/products/inquiry-forwarding/hosts";
import { forwardedLeadId, forwardedSubmissionHash, parseAddress, parseForwardedMessage } from "@/products/inquiry-forwarding/parse";
import { generateForwardingLocalPart } from "@/products/inquiry-forwarding/server";
import * as fixtures from "./fixtures/forwarded-emails";

const options = { inboundDomain: fixtures.INBOUND_DOMAIN };
const parse = (message: Parameters<typeof parseForwardedMessage>[0]) => parseForwardedMessage(message, options);

describe("forwarded message parsing", () => {
  it("finds the customer in a Gmail forward, not the owner who forwarded it", () => {
    expect(parse(fixtures.gmailForward)).toMatchObject({
      kind: "inquiry", format: "gmail", name: "Jane Doe", email: "jane.doe@customer.example.test",
      subject: "Wedding cake for June", forwardedBy: "pat@bakery.example.test", originalDate: "Mon, Oct 12, 2026 at 9:14 AM", holdReason: null,
      message: expect.stringContaining("three-tier wedding cakes"),
    });
    const parsed = parse(fixtures.gmailForward);
    expect(parsed.kind === "inquiry" && parsed.message).not.toContain("log this");
  });

  it("reads Outlook forwards, new style and Original Message", () => {
    expect(parse(fixtures.outlookForward)).toMatchObject({ kind: "inquiry", format: "outlook", name: "Sam Rivera", email: "sam@rivera-events.example.test", subject: "Catering quote", originalDate: "Monday, October 12, 2026 9:14 AM" });
    expect(parse(fixtures.outlookOriginalMessage)).toMatchObject({ kind: "inquiry", format: "outlook", name: "Lee Park", email: "lee.park@customer.example.test", message: "Are your loaves made in a nut-free kitchen?" });
  });

  it("reads an Apple Mail forward and an HTML-only Gmail forward", () => {
    expect(parse(fixtures.appleForward)).toMatchObject({ kind: "inquiry", format: "apple", name: "Morgan Lee", email: "morgan.lee@customer.example.test", subject: "Birthday order", message: "Can I pick up a chocolate cake with \"Happy 40th\" on Friday?" });
    expect(parse(fixtures.gmailHtmlOnly)).toMatchObject({ kind: "inquiry", format: "gmail", name: "Chris Kim", email: "chris.kim@customer.example.test", message: "Do you have gluten-free bread on Saturdays?" });
  });

  it("takes the customer from a form notice's labels, not the form's no-reply sender", () => {
    expect(parse(fixtures.plainBccFormNotice)).toMatchObject({
      kind: "inquiry", format: "form", name: "Riley Smith", email: "riley.smith@customer.example.test", phone: "(716) 555-0199",
      message: "Hi, do you deliver to Amherst?\nWe'd need two dozen cupcakes.\n\nView all submissions in your dashboard.", messageKey: "wix-notice-1@wixforms.example.test",
    });
  });

  it("falls back to the envelope for an auto-forward and keeps the original Message-ID", () => {
    const parsed = parse(fixtures.autoForwarded);
    expect(parsed).toMatchObject({ kind: "inquiry", format: "direct", name: "Alex Chen", email: "alex.chen@customer.example.test", forwardedBy: null, messageKey: "original-alex-1@customer.example.test" });
  });

  it("recognises Gmail's forwarding confirmation and keeps only Google's own link", () => {
    expect(parse(fixtures.gmailConfirmation)).toEqual({ kind: "provider_confirmation", provider: "gmail", code: "123456789", url: "https://mail-settings.google.com/mail/vf-%5BANGjdJ-fixture%5D-fixture", requestedBy: "pat.owner@gmail.example.test" });
    const spoofed = { ...fixtures.gmailConfirmation, from: "Gmail Team <forwarding-noreply@g00gle.example.test>" };
    expect(parse(spoofed).kind).toBe("inquiry");
    const phishingLink = { ...fixtures.gmailConfirmation, text: "Confirmation code: 123456789\nhttps://evil.example.test/mail/vf-1" };
    expect(parse(phishingLink)).toMatchObject({ kind: "provider_confirmation", url: null });
  });

  it("ignores out-of-office replies, bounces and Strelva's own mail; holds spam and list mail", () => {
    expect(parse(fixtures.outOfOffice)).toEqual({ kind: "ignored", reason: "auto_reply" });
    expect(parse(fixtures.bounce)).toEqual({ kind: "ignored", reason: "bounce" });
    expect(parse(fixtures.loop)).toEqual({ kind: "ignored", reason: "loop" });
    expect(parse(fixtures.spamFlagged)).toMatchObject({ kind: "inquiry", holdReason: "spam_header" });
    expect(parse(fixtures.newsletter)).toMatchObject({ kind: "inquiry", holdReason: "bulk_mail" });
  });

  it("dedupe keys are stable per message and per sender and words", () => {
    expect(forwardedLeadId("a@b")).toMatch(/^lead_fwd_[a-f0-9]{40}$/);
    expect(forwardedLeadId("a@b")).toBe(forwardedLeadId("a@b"));
    expect(forwardedLeadId("a@b")).not.toBe(forwardedLeadId("a@c"));
    expect(forwardedSubmissionHash("x@y.test", "Hello   there")).toBe(forwardedSubmissionHash("x@y.test", "hello there"));
    expect(forwardedSubmissionHash("x@y.test", "Hello")).toMatch(/^[a-f0-9]{16}$/);
  });

  it("parses display names in the shapes mail clients write", () => {
    expect(parseAddress("\"Doe, Jane\" <jane@customer.example.test>")).toEqual({ name: "Doe, Jane", email: "jane@customer.example.test" });
    expect(parseAddress("Jane Doe [mailto:jane@customer.example.test]")).toEqual({ name: "Jane Doe", email: "jane@customer.example.test" });
    expect(parseAddress("*Jane Doe* <jane@customer.example.test<mailto:jane@customer.example.test>>")).toEqual({ name: "Jane Doe", email: "jane@customer.example.test" });
    expect(parseAddress("jane@customer.example.test")).toEqual({ name: null, email: "jane@customer.example.test" });
  });
});

describe("forwarding addresses", () => {
  it("are fwd- plus 24 random letters and digits, on the inbound domain only", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateForwardingLocalPart()));
    expect(seen.size).toBe(200);
    for (const local of seen) expect(local).toMatch(/^fwd-[a-z0-9]{24}$/);
    expect(forwardingLocalPart(`Strelva <${fixtures.BAKERY_LOCAL}@${fixtures.INBOUND_DOMAIN}>`, fixtures.INBOUND_DOMAIN)).toBe(fixtures.BAKERY_LOCAL);
    expect(forwardingLocalPart(`${fixtures.BAKERY_LOCAL.toUpperCase()}@${fixtures.INBOUND_DOMAIN.toUpperCase()}`, fixtures.INBOUND_DOMAIN)).toBe(fixtures.BAKERY_LOCAL);
    expect(forwardingLocalPart(`${fixtures.BAKERY_LOCAL}@other.example.test`, fixtures.INBOUND_DOMAIN)).toBeNull();
    expect(forwardingLocalPart(`inquiry+abc@${fixtures.INBOUND_DOMAIN}`, fixtures.INBOUND_DOMAIN)).toBeNull();
    expect(forwardingLocalPart(`fwd-short@${fixtures.INBOUND_DOMAIN}`, fixtures.INBOUND_DOMAIN)).toBeNull();
    expect(forwardingEmail(fixtures.BAKERY_LOCAL, null)).toBeNull();
  });

  it("host guides fill in the address in every host's steps", () => {
    expect(FORWARDING_HOSTS.map((host) => host.id)).toEqual(["gmail", "outlook", "microsoft_365", "icloud", "godaddy", "contact_form"]);
    for (const host of FORWARDING_HOSTS) {
      const steps = hostSteps(host, "fwd-x@reply.example.test");
      expect(steps.join(" ")).toContain("fwd-x@reply.example.test");
      expect(steps.join(" ")).not.toContain("{address}");
    }
    expect(FORWARDING_HOSTS.find((host) => host.id === "gmail")?.confirmsAddress).toBe(true);
  });
});
