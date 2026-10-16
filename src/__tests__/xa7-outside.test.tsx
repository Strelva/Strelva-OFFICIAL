import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { brandXaPage, identifyXaPage, xaDecisionPageHtml, xaDoneInput, xaKeepWith, xaYesLabel } from "@/app/api/approve/xa-page";
import { visitorWeek } from "@/platform/bookings/visitor-week";
import { mondayEmail, renderXaMailHtml, renderXaMailText, waitsForYouEmail } from "@/platform/infra/email/xa-mail";
import { renderPaperEmailHtml } from "@/platform/infra/email/paper";
import { EMAIL_PREVIEW_TEMPLATES } from "@/experience/workspace/preview/email-fixture";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { VisitorIntakeForm } from "@/experience/vertical-intake/VisitorIntakeForm";
import { OwnerPhoneToday } from "@/experience/workspace/OwnerPhoneToday";
import { E4_CLOSURES, E5_FILLED, HARBOR, SLOT_STARTS, e1Mail, e3Mail, e4Choice, e5Form, e6Decision, e6Systems } from "@/experience/workspace/preview/xa7-outside-fixture";

const SLOP = [/monospace|Geist Mono|font-mono/i, /text-transform:\s*uppercase/i, /linear-gradient|radial-gradient/i, /—/, /\$—/, /seamless|effortless|unlock|supercharge|AI-powered/i, /Actor not recorded/];
/** Builder words and placeholder wording an owner or visitor must never read, checked on visible text only. */
const SLOP_TEXT = [/(^|\s)\/[a-z][\w-]*(\s|\.|$)/m, /No times/, /\b\d{1,3}(,\d{3})+ checks\b/, /Nothing happens until you confirm/, /Nothing was done/];
const visible = (html: string) => html.replace(/<head>[\s\S]*?<\/head>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
const clean = (html: string) => [...SLOP.filter(pattern => pattern.test(html)), ...SLOP_TEXT.filter(pattern => pattern.test(visible(html)))];
const primaries = (html: string) => html.match(/data-xa-primary/g)?.length ?? 0;

describe("XA · E2 the yes on the phone (/api/approve pages)", () => {
  const w = visitorWeek(SLOT_STARTS.map(start => ({ start })), HARBOR.timeZone, E4_CLOSURES);
  const week = { address: "harbordental.com/book", days: w.days.map(d => ({ key: d.key, weekday: d.weekday, date: d.date, times: d.times.map(t => t.label), closed: d.closed })), notes: ["No one is booked on those days."] };
  const waiting = xaDecisionPageHtml({ status: 200, tone: "waits", statusLabel: "Waits for you", heading: "Close for <Thanksgiving>?", identity: { name: "Harbor Dental", owner: "Dr. Lin" }, by: "Maya at North Studio prepared this.", week, primary: { label: "Put it live", token: "tok&en" }, decline: { label: "Not now", token: "no-token" }, foot: "Undo any time from Today." });
  it("asks with one ink pill that posts the bound token, and Not now posts its own token as a text button", () => {
    expect(primaries(waiting)).toBe(1);
    expect(waiting.match(/method="POST" action="\/api\/approve"/g)).toHaveLength(2);
    expect(waiting).toContain('value="tok&amp;en"');
    expect(waiting).toContain('value="no-token"><button type="submit" class="text" data-xa-decline>Not now</button>');
    expect(waiting).toContain("Close for &lt;Thanksgiving&gt;?");
    expect(waiting).toContain("Undo any time from Today.");
    expect(clean(waiting)).toEqual([]);
  });
  it("heads the page with the business and its owner, never the platform's mark", () => {
    expect(waiting).toContain('<span class="mono" aria-hidden="true" style="width:28px;height:28px;flex:0 0 28px">H</span><b>Harbor Dental</b><small>For Dr. Lin</small>');
    expect(waiting).not.toContain("<svg");
    expect(waiting).not.toContain("<b>Strelva</b>");
    const later = xaDecisionPageHtml({ status: 200, tone: "quiet", heading: "Already handled" });
    expect(identifyXaPage(later, { name: "Harbor Dental" })).toContain("<b>Harbor Dental</b>");
    expect(later).not.toContain("<header");
  });
  it("shows the change as the visitor's week, Closed in place on Thursday and Friday", () => {
    expect(waiting.match(/<div class="day" data-closed><p><span>(Thu|Fri)<\/span><b>(26|27)<\/b><\/p><span class="x">Closed<\/span>/g)).toHaveLength(2);
    expect(waiting).toContain('<span class="t">10:30</span>');
    expect(waiting).toContain("After your yes");
    expect(waiting).not.toContain("<li>");
  });
  it("follows the phone's light or dark setting, balances the headline and keeps focus visible", () => {
    expect(waiting).toContain("prefers-color-scheme:dark");
    expect(waiting).toContain("text-wrap:balance");
    expect(waiting).toContain("focus-visible");
    expect(waiting).toContain('name="viewport"');
  });
  it("on a not-yet link, the decision is a text button beside the item, not the ink pill", () => {
    const notYet = xaDecisionPageHtml({ status: 200, tone: "waits", statusLabel: "Waits for you", heading: "Close for Thanksgiving?", week, decline: { label: xaKeepWith("Maya at North Studio"), token: "t" } });
    expect(primaries(notYet)).toBe(0);
    expect(notYet).toContain('class="text left" data-xa-decline>Keep it with Maya</button>');
    expect(notYet.indexOf("data-xa-decline")).toBeLessThan(notYet.indexOf('class="bottom"'));
    expect(notYet).toContain('class="week"');
  });
  it("says done once: one headline, who prepared it and who said yes, then See it · Undo", () => {
    const done = xaDecisionPageHtml(xaDoneInput({ changed: "Thanksgiving hours", verified: true, who: "Maya at North Studio prepared it", seeUrl: "/see", undoUrl: "/undo" }));
    expect(done).toContain("<h1>Thanksgiving hours went live</h1>");
    expect(done).toContain("Maya at North Studio prepared it. You said yes.");
    expect(done).toContain('<a href="/see">See it</a> · <a href="/undo">Undo</a>');
    expect(done).not.toMatch(/Approved|Confirmed live|class="status"/);
    expect(visible(done).match(/live/g)).toHaveLength(1);
    const pending = xaDecisionPageHtml(xaDoneInput({ changed: "Thanksgiving hours", verified: false, seeUrl: "/see" }));
    expect(pending).toContain("Your yes went through");
    expect(pending).toContain("Strelva is still checking that Thanksgiving hours shows.");
    expect(pending).not.toContain(">Undo<");
  });
  it("keeps Pebble in frame for bad news and offers no POST", () => {
    const bad = xaDecisionPageHtml({ status: 200, tone: "bad", statusLabel: "Nothing went live from this link", heading: "This link expired", body: "Open Strelva to see what's waiting.", primary: { label: "Open", url: "/workspace" } });
    expect(bad).toContain("/xa/pebble-avatar.webp");
    expect(bad).not.toContain('method="POST"');
  });
  it("brands an agency page with its initial, name, credit and accent; Strelva Agency gets no carve-out", () => {
    const branded = brandXaPage(waiting, { agencyId: "a", name: "Strelva Agency", logoUrl: null, accentColor: "#ffff00", replyTo: null, credit: "runs_on_strelva" });
    expect(branded).toContain("<b>Strelva Agency</b>");
    expect(branded).toContain("Runs on Strelva.");
    expect(branded).toContain("background:#ffff00;color:#000000");
    expect(branded).toContain("<b>Harbor Dental</b>");
    expect(branded).toContain('<p class="agency"><span class="mono" aria-hidden="true" style="width:18px;height:18px;flex:0 0 18px">S</span>');
    expect(branded).not.toContain("<svg");
    expect(brandXaPage(waiting, { agencyId: null, name: "Strelva", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" })).toBe(waiting);
  });
  it("names the consequence on the pill", () => {
    expect(xaYesLabel("system.change_live", "approve")).toBe("Make it live");
    expect(xaYesLabel("customer.message", "approve")).toBe("Send");
    expect(xaYesLabel("money", "approve")).toBe("Make it live");
    expect(xaYesLabel(undefined, "approve")).toBe("Make it live");
    expect(xaYesLabel("system.go_live", "not_yet")).toBe("Not yet");
    expect(xaKeepWith(undefined)).toBe("Not now");
  });
});

describe("XA · E1 and E3 emails (templates only)", () => {
  it("E1 names who prepared it, shows the page it changes and has one pill to the signed link", () => {
    const mail = e1Mail("ready");
    const html = renderXaMailHtml(mail);
    expect(html).toContain("Maya at North Studio prepared this for Harbor Dental. Nothing goes live until you say yes.");
    expect(html).toContain("harbordental.com/hours");
    expect(html).toContain(">H</span>Harbor Dental</p>");
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
  it("E3 leads with one sentence and the one change that mattered, names who acted, and says a quiet week plainly", () => {
    const html = renderXaMailHtml(e3Mail("ready"));
    expect(html).toContain("14 visits booked online this week.");
    expect(html).toContain("3 new patients, 11 returning, nothing went down.");
    expect(html).toContain("The change that mattered");
    expect(html).toContain("The Book a visit button moved to the top of the home page");
    expect(html).toContain(" · Maya at North Studio, Nov 20");
    expect(html).toMatch(/href="\/preview\/strelva\/xa\/xa4-systems\/website"[^>]*>See it</);
    expect(html).toContain("Also changed");
    expect(html).toContain(">Strelva<");
    // No hero figure and no clay beside it.
    expect(html).not.toContain("font-size:64px");
    expect(html).not.toMatch(/pose-[a-z]+\.webp/);
    expect(html).toContain("This comes every Monday. North Studio runs Harbor Dental&#39;s website with Strelva.");
    expect(html).toContain("Every check on harbordental.com passed. Your Services page was the slowest at 1.4 seconds.");
    expect(clean(html)).toEqual([]);
    expect(renderXaMailHtml(e3Mail("quiet"))).toContain("Nothing changed this week.");
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
  const render = (state: string) => renderToStaticMarkup(createElement(InquiryBookingChoice, { now: Date.parse("2026-11-20T14:05:00Z"), businessName: "Harbor Dental", businessPhone: HARBOR.phone, choice: e4Choice(state), actionUrl: "/inquiry-booking/t/action", unavailable: state === "error" }));
  it("shows the week as one radio group with one submit that posts the slot index, closures in place", () => {
    const html = render("choose");
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(html.match(/name="slot"/g)).toHaveLength(11);
    expect(html).toContain('value="10"');
    expect(html).toContain("November 23 to 28");
    expect(html.match(/Closed, Thanksgiving/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Monday, Nov 23, 2026, 8:00 AM Eastern Time"');
    expect(html).toContain("Choose a time for your new-patient exam");
    expect(html).toContain("Harbor Dental accepts it or suggests another. Choose by Sunday, Nov 22 at 8:00 PM.");
    expect(visible(html).match(/Eastern/g)).toHaveLength(1);
    expect(clean(html)).toEqual([]);
  });
  it("says what is true in every state and always leaves a way forward", () => {
    const empty = render("empty");
    expect(empty).toContain("No open times right now");
    expect(empty).toContain('href="tel:7165550142"');
    expect(empty).not.toContain("<form");
    expect(render("error")).toContain("These times didn’t load");
    expect(render("error")).toContain('href="tel:7165550142"');
    expect(render("expired-link")).toContain("This link expired");
    const requested = render("requested");
    expect(requested).toContain("Waiting on Harbor Dental");
    expect(requested).toContain("New-patient exam, Wednesday, Nov 25 at 10:30 AM Eastern. Harbor Dental will reply to your email.");
    expect(requested).not.toContain("<dl");
    expect(render("held")).not.toContain("<form");
    for (const state of ["empty", "error", "expired-link", "requested", "held", "confirmed"]) expect(clean(render(state))).toEqual([]);
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
    expect(html.match(/medical/gi)).toHaveLength(1);
    expect(html).toContain("Five questions need an answer; the rest are optional.");
    expect(clean(html)).toEqual([]);
  });
  it("repeats the patient's number back when sent, with the office's phone as a text link", () => {
    const html = renderToStaticMarkup(createElement(VisitorIntakeForm, { form: e5Form(), initial: E5_FILLED, initialState: { sent: "routine" }, onSend: async () => ({ ok: true as const, triage: "routine" as const }) }));
    expect(html).toContain("Harbor Dental will call (716) 555-0187 to book");
    expect(html).toContain('href="tel:7165550142"');
    expect(clean(html)).toEqual([]);
  });
  it("shows the triage beside the reason, with the office's number, when the reason is urgent", () => {
    const html = renderToStaticMarkup(createElement(VisitorIntakeForm, { form: e5Form(), initial: { ...E5_FILLED, reason: "urgent" }, onSend: async () => ({ ok: true as const, triage: "urgent" as const }) }));
    expect(html).toContain("Tooth pain, swelling or a broken tooth?");
    expect(html).toContain('href="tel:7165550142"');
  });
  it("cannot send as the owner's preview", () => {
    const html = renderToStaticMarkup(createElement(VisitorIntakeForm, { form: e5Form() }));
    expect(html).toContain("Preview. Patients send this from your website, so Send does nothing here.");
    expect(html).toMatch(/<button type="submit"[^>]*aria-disabled="true"/);
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
    expect(html).toContain("Ask Strelva for anything");
    expect(html).not.toMatch(/data-kind="(waits|live)"/);
    expect(clean(html)).toEqual([]);
  });
  it("shows an exception only where a System differs from normal", () => {
    const systems = e6Systems().map(system => system.id === "form" ? { ...system, lifecycle: "draft" as const } : system);
    const html = renderToStaticMarkup(createElement(OwnerPhoneToday, { ...base, systems, needs: { status: "ready", role: "owner", items: [], complete: true, handled: [], handledAvailable: true } }));
    expect(html.match(/<span>Draft<\/span>/g)?.length).toBe(1);
    expect(html).toContain("Nothing needs you.");
  });
  it("keeps Pebble in frame when the morning cannot load", () => {
    const html = renderToStaticMarkup(createElement(OwnerPhoneToday, { ...base, onRetry: () => undefined, needs: { status: "error", message: "Your decisions could not be checked." } }));
    expect(html).toContain("pose-fixing");
    expect(html).toContain('data-bare="true"');
    expect(html).toContain("Harbor Dental didn’t load, but your Systems are still running.");
    expect(html).not.toContain("could not be checked");
    expect(html).toContain("Try again");
    expect(html).toContain("Ask Strelva for anything");
  });
});

describe("XA · E6 empty", () => {
  it("says nothing is running once and keeps Pebble on the canvas, doing the website job", () => {
    const html = renderToStaticMarkup(createElement(OwnerPhoneToday, { greetingName: "Dr. Lin", business: "Harbor Dental", systems: [], hour: 8, onReview: () => undefined, onAsk: () => undefined, onOpenSystem: () => undefined, onBringInWebsite: () => undefined, needs: { status: "ready", role: "owner", items: [], complete: true, handled: [], handledAvailable: true } }));
    expect(visible(html).match(/Nothing is running yet/g)).toHaveLength(1);
    expect(html).toContain('data-bare="true"');
    expect(html).toContain("Pebble reads your website first");
  });
});
