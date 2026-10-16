import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { brandXaPage, xaDecisionPageHtml, xaYesLabel } from "@/app/api/approve/xa-page";
import { mondayEmail, renderXaMailHtml, renderXaMailText, waitsForYouEmail } from "@/platform/infra/email/xa-mail";
import { renderPaperEmailHtml } from "@/platform/infra/email/paper";
import { EMAIL_PREVIEW_TEMPLATES } from "@/experience/workspace/preview/email-fixture";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { VisitorIntakeForm } from "@/experience/vertical-intake/VisitorIntakeForm";
import { OwnerPhoneToday } from "@/experience/workspace/OwnerPhoneToday";
import { E5_FILLED, e1Mail, e3Mail, e4Choice, e5Form, e6Decision, e6Systems } from "@/experience/workspace/preview/xa7-outside-fixture";

const SLOP = [/monospace|Geist Mono|font-mono/i, /text-transform:\s*uppercase/i, /linear-gradient|radial-gradient/i, /—/, /\$—/, /seamless|effortless|unlock|supercharge|AI-powered/i, /Actor not recorded/];
const clean = (html: string) => SLOP.filter(pattern => pattern.test(html));
const primaries = (html: string) => html.match(/data-xa-primary/g)?.length ?? 0;

describe("XA · E2 the yes on the phone (/api/approve pages)", () => {
  const waiting = xaDecisionPageHtml({ status: 200, tone: "waits", statusLabel: "Waits for you", heading: "Close for <Thanksgiving>?", body: "Nothing happens until you confirm.", by: "Prepared by Maya at North Studio.", lines: ["Thu: closed"], primary: { label: "Put it live", token: "tok&en" }, secondary: { label: "Open your workspace instead", url: "/workspace" } });
  it("asks with one ink pill that posts the bound token and never decides on GET", () => {
    expect(primaries(waiting)).toBe(1);
    expect(waiting).toContain('method="POST" action="/api/approve"');
    expect(waiting).toContain('value="tok&amp;en"');
    expect(waiting).toContain("Close for &lt;Thanksgiving&gt;?");
    expect(waiting).toContain("Prepared by Maya at North Studio.");
    expect(clean(waiting)).toEqual([]);
  });
  it("follows the phone's light or dark setting and keeps focus visible", () => {
    expect(waiting).toContain("prefers-color-scheme:dark");
    expect(waiting).toContain("focus-visible");
    expect(waiting).toContain('name="viewport"');
  });
  it("keeps Pebble in frame for bad news and offers no POST", () => {
    const bad = xaDecisionPageHtml({ status: 200, tone: "bad", statusLabel: "Nothing went live from this link", heading: "This link expired", body: "Nothing was done.", primary: { label: "Open", url: "/workspace" } });
    expect(bad).toContain("/xa/pebble-avatar.webp");
    expect(bad).not.toContain('method="POST"');
  });
  it("brands an agency page with its name, credit and accent, and Strelva Agency gets no carve-out", () => {
    const branded = brandXaPage(waiting, { agencyId: "a", name: "Strelva Agency", logoUrl: null, accentColor: "#ffff00", replyTo: null, credit: "runs_on_strelva" });
    expect(branded).toContain("<b>Strelva Agency</b>");
    expect(branded).toContain("Runs on Strelva.");
    expect(branded).toContain("background:#ffff00;color:#000000");
    expect(brandXaPage(waiting, { agencyId: null, name: "Strelva", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" })).toBe(waiting);
  });
  it("names the consequence on the pill", () => {
    expect(xaYesLabel("system.change_live", "approve")).toBe("Put it live");
    expect(xaYesLabel("customer.message", "approve")).toBe("Send it");
    expect(xaYesLabel("money", "approve")).toBe("Approve");
    expect(xaYesLabel("system.go_live", "not_yet")).toBe("Not yet");
  });
});

describe("XA · E1 and E3 emails (templates only)", () => {
  it("E1 names who prepared it, shows the page it changes and has one pill to the signed link", () => {
    const mail = e1Mail("ready");
    const html = renderXaMailHtml(mail);
    expect(html).toContain("Maya at North Studio prepared this for Harbor Dental. Nothing goes live until you say yes.");
    expect(html).toContain("harbordental.com/hours");
    expect(html).toContain("Review and say yes");
    expect(html.match(/border-radius:999px;"><a /g)).toHaveLength(1);
    expect(html).toContain('color-scheme" content="light"');
    expect(clean(html)).toEqual([]);
    expect(renderXaMailText(mail)).toContain("Review and say yes: /preview/strelva/xa/xa7-outside/phone-yes?state=confirm");
  });
  it("E1 says when a decision needs sign-in and never claims an undo the source lacks", () => {
    const html = renderXaMailHtml(e1Mail("sign-in"));
    expect(html).toContain("This one needs you signed in.");
    expect(renderXaMailHtml(e1Mail("no-undo"))).not.toContain("undo");
  });
  it("E1 without a recorded actor does not invent one", () => {
    const html = renderXaMailHtml(waitsForYouEmail({ business: "Harbor Dental", question: "Close for Thanksgiving?", actor: null, review: "https://app.example.test/api/approve?token=x", signInRequired: false, settingsUrl: "https://app.example.test/settings" }));
    expect(html).toContain("This is ready for Harbor Dental.");
    expect(html).not.toContain("prepared this");
  });
  it("E3 leads with one number, names who acted on each change, and says a quiet week plainly", () => {
    const html = renderXaMailHtml(e3Mail("ready", "https://app.example.test"));
    expect(html).toContain(">14<");
    expect(html).toContain("You said yes");
    expect(html).toContain(">Strelva<");
    expect(html).toContain("This comes every Monday. North Studio runs Harbor Dental&#39;s website with Strelva.");
    expect(clean(html)).toEqual([]);
    expect(renderXaMailHtml(e3Mail("quiet", "https://app.example.test"))).toContain("Nothing changed this week.");
    expect(mondayEmail({ business: "Harbor Dental", period: "Nov 9–15", weekOf: "Week of Nov 9", figure: { value: 2016, label: "checks passed" }, changes: [], open: { label: "Open", url: "/x" }, settingsUrl: "/s" }).subject).toBe("Harbor Dental, week of Nov 9: 2,016 checks passed");
  });
  it("refuses an active URL scheme", () => {
    expect(() => renderXaMailHtml(waitsForYouEmail({ business: "B", question: "Q?", actor: null, review: "javascript:alert(1)", signInRequired: false, settingsUrl: "/s" }))).toThrow("Unsafe email URL");
  });
  it("paper emails no longer set a monospace face", () => {
    for (const { email } of Object.values(EMAIL_PREVIEW_TEMPLATES)) expect(renderPaperEmailHtml(email)).not.toMatch(/monospace|Geist Mono/);
  });
});

describe("XA · E4 the public booking page", () => {
  const render = (state: string) => renderToStaticMarkup(createElement(InquiryBookingChoice, { now: Date.parse("2026-11-20T14:05:00Z"), businessName: "Harbor Dental", choice: e4Choice(state), actionUrl: "/inquiry-booking/t/action", unavailable: state === "error" }));
  it("shows the week as one radio group with one submit that posts the slot index", () => {
    const html = render("choose");
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(html.match(/name="slot"/g)).toHaveLength(11);
    expect(html).toContain('value="10"');
    expect(html).toContain("November 23 to 28");
    expect(html.match(/No times/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Monday, Nov 23, 2026, 8:00 AM Eastern Time"');
    expect(clean(html)).toEqual([]);
  });
  it("keeps every state honest: no times, could not load, expired, waiting", () => {
    expect(render("empty")).toContain("No times are open.");
    expect(render("empty")).not.toContain("<form");
    expect(render("error")).toContain("These times couldn&#x27;t load.");
    expect(render("expired-link")).toContain("This link expired");
    expect(render("requested")).toContain("Waiting on Harbor Dental");
    expect(render("held")).not.toContain("<form");
  });
});

describe("XA · E5 the patient form", () => {
  it("renders the office's real questions without any clinical or identity field", () => {
    const html = renderToStaticMarkup(createElement(VisitorIntakeForm, { form: e5Form(), initial: E5_FILLED, visitLine: "For your visit on Wednesday, Nov 25 at 10:30 AM.", onSend: async () => ({ ok: true as const, triage: "routine" as const }) }));
    expect(html).toContain("Before your first visit");
    expect(html).toContain("Delta Dental PPO");
    expect(html).toContain("Member ID");
    expect(html).not.toMatch(/Date of birth|>Medications|>Allergies/i);
    expect(e5Form().fields.map(field => field.label).join(" ")).not.toMatch(/birth|medication|allerg|diagnos/i);
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(clean(html)).toEqual([]);
  });
  it("shows the triage beside the reason, with the office's number, when the reason is urgent", () => {
    const html = renderToStaticMarkup(createElement(VisitorIntakeForm, { form: e5Form(), initial: { ...E5_FILLED, reason: "urgent" }, onSend: async () => ({ ok: true as const, triage: "urgent" as const }) }));
    expect(html).toContain("Tooth pain, swelling or a broken tooth?");
    expect(html).toContain('href="tel:7165550142"');
  });
  it("cannot send as the owner's preview", () => {
    const html = renderToStaticMarkup(createElement(VisitorIntakeForm, { form: e5Form() }));
    expect(html).toContain("Preview. Patients send this from your website.");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
  });
});

describe("XA · E6 Today on the phone", () => {
  const base = { greetingName: "Dr. Lin", business: "Harbor Dental", systems: e6Systems(), hour: 8, onReview: () => undefined, onAsk: () => undefined, onOpenSystem: () => undefined };
  it("puts the one waiting item in the composer with who prepared it, then what is running", () => {
    const html = renderToStaticMarkup(createElement(OwnerPhoneToday, { ...base, needs: { status: "ready", role: "owner", items: [e6Decision()], complete: true, handled: [], handledAvailable: true }, facts: { book: "2 booked today" } }));
    expect(html).toContain("Good morning, Dr. Lin.");
    expect(html).toContain("One thing waits for you. Everything else is running.");
    expect(html).toContain("Waits for you · from Maya at North Studio");
    expect(html).toContain("2 booked today");
    expect(html).not.toContain(">Live<");
    expect(clean(html)).toEqual([]);
  });
  it("shows an exception only where a System differs from normal", () => {
    const systems = e6Systems().map(system => system.id === "form" ? { ...system, lifecycle: "draft" as const } : system);
    const html = renderToStaticMarkup(createElement(OwnerPhoneToday, { ...base, systems, needs: { status: "ready", role: "owner", items: [], complete: true, handled: [], handledAvailable: true } }));
    expect(html.match(/<span>Draft<\/span>/g)?.length).toBe(1);
    expect(html).toContain("Nothing needs you.");
  });
  it("keeps Pebble in frame when the morning cannot load", () => {
    const html = renderToStaticMarkup(createElement(OwnerPhoneToday, { ...base, needs: { status: "error", message: "Your decisions could not be checked." } }));
    expect(html).toContain("pose-fixing");
    expect(html).toContain("Harbor Dental did not load just now.");
  });
});
