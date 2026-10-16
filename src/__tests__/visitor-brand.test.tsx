// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { visitorBrandForMail, visitorBrandFromAccent, visitorBrandFromSiteDocument, visitorBrandStyle, visitorContrast } from "@/products/websites/client";
import { VisitorBookingShell } from "@/experience/bookings/VisitorBookingShell";
import { VisitorTimeForm } from "@/experience/bookings/VisitorTimeForm";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { harborBrand, harborSite, manageState, offerState } from "@/experience/workspace/preview/xs-visitor-fixture";
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
    expect(offer).toContain('src="/xa/photo-dentist.webp"');
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
  const render = () => act(async () => root.render(createElement(VisitorTimeForm, { action: "/a", name: "slot", submitLabel: "Request this time" },
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
