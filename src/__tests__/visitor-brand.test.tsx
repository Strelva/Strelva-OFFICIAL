// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { visitorBrandForMail, visitorBrandFromAccent, visitorBrandFromRecord, visitorBrandFromSiteDocument, visitorBrandStyle, visitorContrast, visitorTypeFromTheme } from "@/products/websites/client";
import { visitorDeadlineWords } from "@/platform/bookings/public-admission-time";
import { actOnManageLink, loadManageState } from "@/platform/bookings/manage";
import { BookingConfirmation } from "@/experience/bookings/BookingConfirmation";
import { registerVisitorMailBrandReader, readVisitorMailBrand } from "@/platform/infra/email/visitor-brand-port";
import { VisitorBookingShell } from "@/experience/bookings/VisitorBookingShell";
import { VisitorTimeForm } from "@/experience/bookings/VisitorTimeForm";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { HERTEL, PREVIEW_NOW, genericVisitorEmails, harborBrand, harborSite, hertelBrand, manageState, offerState } from "@/experience/workspace/preview/xs-visitor-fixture";
import { renderXaMailHtml } from "@/platform/infra/email/xa-mail";
import { renderEmailHtml } from "@/platform/infra/email/layout";
import { bookingUpdateVisitorMail } from "@/platform/bookings/updates";
import { PaidNote } from "@/app/pay/[slug]/PaidNote";
import { receiptDoc } from "@/experience/workspace/preview/xs-money-fixture";

describe("a business's own look on its visitor pages", () => {
  it("reads palette, accent and logo from the business's published website", () => {
    const brand = visitorBrandFromSiteDocument({ ...harborSite, theme: { ...harborSite.theme, logo: "logo" }, assets: { logo: { url: "https://cdn.example.test/harbor.png", alt: "Harbor Dental" } } } as typeof harborSite, "https://harbordental.example.test");
    expect(brand.colors.accent).toBe("#1f4e6b");
    expect(brand.colors.onAccent).toBe("#ffffff");
    expect(brand.colors.canvas).toBe("#f7fafc");
    expect(brand.logo).toEqual({ url: "https://cdn.example.test/harbor.png", alt: "Harbor Dental" });
    expect(brand.website).toBe("https://harbordental.example.test");
  });
  it("drops an accent that would not read on the page, and refuses unsafe links", () => {
    const pale = visitorBrandFromSiteDocument({ ...harborSite, theme: { ...harborSite.theme, palette: "light", accent: "#f5f5a0" } }, "javascript:alert(1)");
    expect(pale.colors.accent).not.toBe("#f5f5a0");
    expect(visitorContrast(pale.colors.accent, pale.colors.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(pale.website).toBeNull();
    expect(visitorBrandFromAccent("#f5f5a0")).toBeNull();
    expect(visitorBrandFromAccent("not a color")).toBeNull();
    expect(visitorBrandFromAccent("#7a2e8a")?.colors.accent).toBe("#7a2e8a");
  });
  it("fills the --visitor-* variables, puts the name home and the phone in the header, and credits Strelva once", () => {
    const html = renderToStaticMarkup(<VisitorBookingShell siteName="Harbor Dental" brand={harborBrand} phone="(716) 555-0142">Page</VisitorBookingShell>);
    expect(html).toContain("--visitor-accent:#1f4e6b");
    expect(html).toContain('href="https://harbordental.example.test"');
    expect(html).toContain('href="tel:7165550142"');
    expect(html.match(/Strelva/g)).toHaveLength(1);
    expect(visitorBrandStyle(null)).toEqual({});
  });
  it("wears the brand on the offer and manage pages, with one primary each", () => {
    const offer = renderToStaticMarkup(createElement(InquiryBookingOffer, { offer: offerState("choose").offer, actionUrl: "/book-inquiry/t/action", brand: harborBrand }));
    expect(offer).toContain("--visitor-accent:#1f4e6b"); expect(offer).toContain("noValidate"); expect(offer.match(/data-xa-primary/g)).toHaveLength(1);
    // Harbor's only photo is 300 px wide: too small for the wide page, so it is left out rather than shown soft.
    expect(offer).not.toContain("<img");
    const manage = renderToStaticMarkup(createElement(ManageBooking, { state: manageState("confirmed"), actionUrl: "/b/t/action", brand: harborBrand }));
    expect(manage).toContain("--visitor-accent:#1f4e6b"); expect(manage).toContain("noValidate"); expect(manage.match(/data-xa-primary/g)).toHaveLength(1);
  });
  it("says an empty pick in a sentence on the offer page after a no-JS post", () => {
    const html = renderToStaticMarkup(createElement(InquiryBookingOffer, { offer: offerState("choose").offer, actionUrl: "/a", error: "pick" }));
    expect(html).toContain("Pick a time first. Nothing was requested.");
  });
  it("carries the accent into the visitor's email and leaves XA ink without one", () => {
    const booking = { serviceName: "New-patient exam" };
    const mail = bookingUpdateVisitorMail({ title: "Booking confirmed", state: "confirmed", rescheduled: false, business: { name: "Harbor Dental" }, booking, when: { day: "Tue, Nov 24", time: "9:15 AM" }, url: "https://app.example.test/b/t" });
    const brand = visitorBrandForMail(harborBrand)!;
    const branded = renderXaMailHtml({ ...mail, brand });
    expect(branded).toContain("background:#1f4e6b"); expect(branded).not.toContain("background:#161715;border-radius:999px");
    expect(renderXaMailHtml(mail)).toContain("background:#161715");
    const options = renderEmailHtml({ businessName: "Harbor Dental", heading: "We received your message", paragraphs: ["Thanks."], button: { label: "Reply", url: "https://app.example.test/r" }, visitorBrand: brand });
    expect(options).toContain("#1f4e6b");
  });
});

describe("the visitor's time form", () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  const render = () => act(async () => root.render(createElement(VisitorTimeForm, { action: "/a", name: "slot", submitLabel: "Request this time" } as Parameters<typeof VisitorTimeForm>[0],
    createElement("label", null, createElement("input", { type: "radio", name: "slot", value: "0", required: true, "data-picked": "Tuesday, Nov 24 at 9:15 AM", "aria-label": "Tuesday" })))));
  it("never shows the browser bubble: an empty submit is a sentence and focus moves to the first time", async () => {
    await render();
    const form = container.querySelector("form")!;
    expect(form.noValidate).toBe(true);
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => { form.dispatchEvent(submit); });
    expect(submit.defaultPrevented).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Pick a time first. Nothing is requested until you do.");
    expect(document.activeElement?.getAttribute("name")).toBe("slot");
  });
  it("says the picked time back, then lets the post go", async () => {
    await render();
    const radio = container.querySelector<HTMLInputElement>("input[type=radio]")!;
    await act(async () => { radio.click(); });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("You picked Tuesday, Nov 24 at 9:15 AM.");
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => { container.querySelector("form")!.dispatchEvent(submit); });
    expect(submit.defaultPrevented).toBe(false);
  });
});

describe("what a payer sees once paid", () => {
  it("is a sentence with its reference and print, not a receipt form", () => {
    const html = renderToStaticMarkup(createElement(PaidNote, { doc: { ...receiptDoc, number: 4, snapshot: { ...receiptDoc.snapshot, billTo: "Harbor Dental", amountPaidCents: 125050 } }, back: { label: "Back to the payment link", href: "/pay/x" } }));
    expect(html).toContain("You paid");
    expect(html).toContain("$1,250.50");
    expect(html).toContain("Print or save as PDF");
    expect(html).not.toContain("<dl");
    expect(html).not.toContain("Billed to");
  });
});

describe("visitor lane fixes (October 16)", () => {
  it("keeps a site photo only when it is wide enough, and carries the site's type", () => {
    const withPhoto = (width?: number) => visitorBrandFromSiteDocument({ ...harborSite, nodes: { ...harborSite.nodes, hero: { ...harborSite.nodes.hero!, props: { ...harborSite.nodes.hero!.props, image: "photo" } } }, assets: { photo: { url: "https://cdn.example.test/office.jpg", alt: "The office", ...(width ? { width } : {}) } } } as typeof harborSite);
    expect(withPhoto(2400).photo).toEqual({ url: "https://cdn.example.test/office.jpg", alt: "The office" });
    expect(withPhoto(300).photo).toBeNull();
    expect(withPhoto().photo).toBeNull();
    expect(withPhoto(2400).type).toEqual({ displayWeight: 400 });
    expect(visitorTypeFromTheme({ fontDisplay: "Fraunces", fontBody: "Work_Sans" })).toEqual({ display: "Fraunces", body: "Work_Sans" });
    expect(visitorTypeFromTheme({ fontDisplay: "Comic Sans", fontBody: "" })).toBeNull();
    const record = visitorBrandFromRecord({ type: { display: "Fraunces" } });
    expect(record?.type).toEqual({ display: "Fraunces" });
    expect(visitorBrandFromRecord({})).toBeNull();
    const shell = renderToStaticMarkup(createElement(VisitorBookingShell, { siteName: HERTEL.name, brand: hertelBrand, phone: HERTEL.phone } as Parameters<typeof VisitorBookingShell>[0], "x"));
    expect(shell).toContain("--visitor-display:Fraunces"); expect(shell).toContain("--visitor-font:Work_Sans");
    expect(shell).toContain('src="/xa/fixture-logo-hertel.png"'); expect(shell).toContain('alt="Hertel Barbers"');
  });
  it("says every deadline one way and names the business's phone on bad news", () => {
    expect(visitorDeadlineWords("2026-11-23T01:00:00Z", "America/New_York", PREVIEW_NOW)).toBe("Sunday, Nov 22 at 8:00 PM");
    expect(visitorDeadlineWords("2026-11-20T14:20:00Z", "America/New_York", PREVIEW_NOW)).toBe("9:20 AM today");
    expect(visitorDeadlineWords("2027-01-04T14:20:00Z", "America/New_York", PREVIEW_NOW)).toBe("Monday, Jan 4, 2027 at 9:20 AM");
    const gone = renderToStaticMarkup(createElement(InquiryBookingOffer, { offer: null, actionUrl: "/a", brand: harborBrand, business: "Harbor Dental", phone: "(716) 555-0142" }));
    expect(gone).toContain("Call Harbor Dental at"); expect(gone).toContain('href="tel:7165550142"'); expect(gone).not.toContain("the business");
    const failed = renderToStaticMarkup(createElement(BookingConfirmation, { identity: null, actionUrl: "/a", statusUrl: "/s", business: "Harbor Dental", phone: "(716) 555-0142" }));
    expect(failed).toContain("See where my booking stands"); expect(failed).not.toContain("Read current status"); expect(failed).toContain("call Harbor Dental at");
  });
  it("says a move back with an Undo, names the business, and gives a way back after a cancel", () => {
    const moved = renderToStaticMarkup(createElement(ManageBooking, { state: manageState("rescheduled", { slot: "s4" }), actionUrl: "/b/t/action", brand: harborBrand, phone: "(716) 555-0142" }));
    expect(moved).toContain("Moved to Saturday, November 28"); expect(moved).toContain("Go back to Tue, Nov 24, 9:15 AM"); expect(moved).toContain('value="s0"');
    expect(moved).not.toContain("when email is on"); expect(moved).not.toContain("Your new time is booked");
    const confirmed = renderToStaticMarkup(createElement(ManageBooking, { state: manageState("confirmed"), actionUrl: "/b/t/action" }));
    expect(confirmed).toContain("Harbor Dental is told either way"); expect(confirmed).not.toContain("The business is told");
    const cancelled = renderToStaticMarkup(createElement(ManageBooking, { state: manageState("cancelled"), actionUrl: "/b/t/action", brand: harborBrand, phone: "(716) 555-0142" }));
    expect(cancelled).toContain('href="https://harbordental.example.test">Book another time'); expect(cancelled).toContain("Changed your mind?");
  });
  it("offers a lapsed move's old time as Undo only while it is still open", async () => {
    const reservation = { tenantId: "harbor", reservationId: "r", capabilityId: "c", siteName: "Harbor Dental", title: "Exam", start: "2026-11-28T14:00:00Z", end: "2026-11-28T15:00:00Z", timeZone: "America/New_York", status: "confirmed" as const, confirmationRequired: false };
    const deps = (slots: Array<{ id: string; start: string; end: string }>) => ({ find: async () => reservation, read: async () => ({ version: 1, timeZone: "America/New_York", slots }), change: async () => ({ status: "confirmed" as const }), cancel: async () => ({ status: "cancelled" as const }), now: () => Date.parse("2026-11-20T14:05:00Z") }) as unknown as Parameters<typeof loadManageState>[2];
    const open = await loadManageState("token-token", { done: "rescheduled", from: "2026-11-24T14:15:00Z" }, deps([{ id: "old", start: "2026-11-24T14:15:00Z", end: "2026-11-24T15:15:00Z" }]));
    expect(open.kind === "ready" && open.undo).toEqual({ slotId: "old", label: "Tue, Nov 24, 9:15 AM" });
    const taken = await loadManageState("token-token", { done: "rescheduled", from: "2026-11-24T14:15:00Z" }, deps([]));
    expect(taken.kind === "ready" && taken.undo).toBeUndefined();
    const result = await actOnManageLink("token-token", { action: "reschedule", slotId: "x" }, deps([]));
    expect(result).toEqual({ done: "rescheduled", from: "2026-11-28T14:00:00Z" });
  });
  it("mails each suggested time as its own link and the business as a wordmark, never a tile", () => {
    const html = renderEmailHtml({ ...genericVisitorEmails["inquiry-offer"]!, visitorBrand: visitorBrandForMail(harborBrand)! });
    expect(html).toContain("Pick a time that works"); expect(html).toContain("offer?pick=2026-11-28T14:00:00.000Z");
    expect(html).not.toContain("Request a time"); expect((html.match(/automatic reply/gi) ?? []).length).toBe(1);
    expect(html).toContain("color:#1f4e6b;\">Harbor Dental</p>"); expect(html).not.toContain("border-radius:7px");
    const logo = renderEmailHtml({ ...genericVisitorEmails["inquiry-offer"]!, visitorBrand: { accent: "#8a3b1c", onAccent: "#ffffff", logoUrl: "https://cdn.example.test/hertel.png" } });
    expect(logo).toContain('src="https://cdn.example.test/hertel.png" alt="Harbor Dental"');
  });
  it("keeps the payer's paid page to one reference and leaves Strelva to the credit", () => {
    const html = renderToStaticMarkup(createElement(PaidNote, { doc: { ...receiptDoc, number: 4, snapshot: { ...receiptDoc.snapshot, billTo: "Harbor Dental", amountPaidCents: 125050 } } }));
    expect(html).not.toContain("RCT-"); expect(html).not.toContain("Strelva");
  });
  it("brands a business's customer mail through the one send path's port", async () => {
    registerVisitorMailBrandReader(async ({ tenantId }) => tenantId === "harbor" ? { accent: "#1f4e6b", onAccent: "#ffffff", logoUrl: null } : null);
    expect(await readVisitorMailBrand({ tenantId: "harbor" })).toEqual({ accent: "#1f4e6b", onAccent: "#ffffff", logoUrl: null });
    registerVisitorMailBrandReader(async () => { throw new Error("down"); });
    expect(await readVisitorMailBrand({ tenantId: "harbor" })).toBeNull();
    registerVisitorMailBrandReader(null);
  });
});
