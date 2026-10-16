import { readFileSync } from "node:fs";
import styles from "@/experience/bookings/visitor.module.css";
import { bookingOfferEmailOptions } from "@/platform/bookings/inquiry-offers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { DepositPreview } from "@/experience/workspace/preview/DepositPreview";
import { VisitorInquiriesPreview } from "@/experience/workspace/preview/VisitorInquiriesPreview";
import type { ManageBookingState } from "@/platform/bookings/manage";
import { parseStoreBooking } from "@/platform/bookings/store";
import { VisitorBookingShell } from "@/experience/bookings/VisitorBookingShell";
import { InquiryBookingReceiptFixture } from "@/experience/workspace/preview/InquiryBookingReceiptPreview";

const ready: Extract<ManageBookingState, { kind: "ready" }> = {
  kind: "ready", booking: { siteName: "Fixture business", title: "Consultation", day: "Friday", time: "9:00 AM", timeZoneLabel: "Eastern Time", status: "pending" },
  days: [{ day: "Monday", slots: [{ id: "open-slot", time: "11:00 AM" }] }], slotsUnavailable: false, changesClosed: false,
};
const renderManage = (state: ManageBookingState) => renderToStaticMarkup(createElement(ManageBooking, { state, actionUrl: "/b/fictional-token/action" }));
afterEach(() => vi.useRealTimers());

describe("visitor presentation preserves explicit booking actions", () => {
  it("shares one business header and a neutral identity failure without platform branding", () => {
    const business = renderToStaticMarkup(<VisitorBookingShell siteName="Lakeview Yoga">Booking</VisitorBookingShell>);
    expect(business).toContain("<header"); expect(business).toContain("Lakeview Yoga"); expect(business).not.toContain("Strelva");
    const missing = renderToStaticMarkup(<VisitorBookingShell>Unavailable</VisitorBookingShell>);
    expect(missing).toContain("Business details unavailable"); expect(missing).not.toContain("Strelva");
    const fixture = renderToStaticMarkup(createElement(InquiryBookingReceiptFixture));
    expect(fixture).toContain("The Mooney Firm"); expect(fixture).toContain("Ask about a consultation"); expect(fixture).not.toContain("form is unavailable");
  });
  it("uses one readable zone in the visitor deposit preview", () => {
    const html = renderToStaticMarkup(createElement(DepositPreview, { state: "ready" }));
    expect(html).toContain("10 AM – 4 PM Eastern Time");
    expect(html.match(/Eastern Time/g)).toHaveLength(1);
    expect(html).not.toContain("America/New_York");
    expect(html).not.toContain(" EST");
  });
  it("shows the actual inquiry receipt: email confirmation, waiting business, confirmed and expired", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T13:55:00Z"));
    const offer = { serviceId: "service", serviceName: "Consultation", services: [], timeZone: "America/New_York", chooseUrl: "/fictional", expiresAt: "2026-11-07T00:00:00Z", slots: [] };
    const render = (status: "held" | "requested" | "confirmed") => renderToStaticMarkup(createElement(InquiryBookingChoice, { now: Date.now(), businessName: "Lakeview Yoga", choice: { offer, booking: parseStoreBooking({ id: "fictional", status, serviceName: "Consultation", start: "2026-11-06T15:00:00Z", end: "2026-11-06T15:30:00Z", timeZone: "America/New_York", createdAt: "2026-11-06T13:50:00Z" }) }, actionUrl: "/fictional/action" }));
    expect(render("held")).toContain("Check your email to confirm"); expect(render("held")).toContain("Confirm by Friday, Nov 6 at 9:05 AM."); expect(render("held")).toContain("10:00 AM Eastern."); expect(render("held")).not.toContain("<form");
    expect(render("requested")).toContain("Waiting on Lakeview Yoga"); expect(render("requested")).not.toContain("Confirm by");
    expect(render("confirmed")).toContain("Confirmed"); expect(render("confirmed")).toContain("change or cancel");
    vi.setSystemTime(new Date("2026-11-06T14:06:00Z")); expect(render("held")).toContain("Confirmation time expired");
  });
  it("does not infer a booked offer's state from its consumed flag", () => {
    const offer = { businessName: "Lakeview Yoga", id: "fixture", serviceId: "service", serviceName: "Consultation", timeZone: "America/New_York", slots: [], expiresAt: "2026-11-07T00:00:00Z", url: "/fictional", token: "fixture", booked: true };
    const props = { offer, actionUrl: "/fictional/action" };
    const unknown = renderToStaticMarkup(createElement(InquiryBookingOffer, props)); expect(unknown).toContain("Booking status unavailable"); expect(unknown).not.toContain("<form");
    const waiting = renderToStaticMarkup(createElement(InquiryBookingOffer, { ...props, receipt: { status: "requested", start: "2026-11-06T15:00:00Z", timeZone: "America/New_York", confirmUntil: null } })); expect(waiting).toContain("Waiting on Lakeview Yoga");
  });
  it("puts readable deadlines in their own spaced paragraph and gives each offered time one zone", () => {
    const offer = { businessName: "Lakeview Yoga", id: "fixture", serviceId: "service", serviceName: "Consultation", timeZone: "America/New_York", slots: [{ start: "2026-11-06T14:00:00Z", end: "2026-11-06T14:30:00Z" }], expiresAt: "2026-11-05T14:00:00Z", url: "/fictional", token: "fixture", booked: false };
    const html = renderToStaticMarkup(createElement(InquiryBookingOffer, { offer, actionUrl: "/fictional/action" }));
    expect(html).toContain(`<p class="${styles.deadline}">Choose by Thursday, Nov 5, 2026, 9:00 AM Eastern Time.</p>`);
    expect(html).toContain("Friday, Nov 6, 2026, 9:00 AM Eastern Time");
    expect(html).not.toContain("America/New_York");
    expect(html).not.toContain(" EST");
    const deadlineStyle = readFileSync("src/experience/bookings/visitor.module.css", "utf8").match(/\.deadline\s*\{([^}]+)\}/)?.[1];
    expect(deadlineStyle).toContain("display: block");
    expect(deadlineStyle).toContain("margin: 16px 0");
    expect(bookingOfferEmailOptions(offer).rows?.[0]?.value).toBe("Friday, Nov 6, 2026, 9:00 AM Eastern Time");
  });
  it("keeps pending separate from confirmation and preserves exact native POST fields", () => {
    const html = renderManage(ready);
    expect(html).toContain("Waiting on Fixture business");
    expect(html).not.toContain("You’re booked");
    expect(html).toContain('action="/b/fictional-token/action" method="post"');
    expect(html).toContain('name="action" value="reschedule"');
    expect(html).toMatch(/<input[^>]*name="slotId"[^>]*required=""|<input[^>]*required=""[^>]*name="slotId"/);
    expect(html).toContain('value="open-slot"');
    expect(html).toContain("11:00 AM Eastern Time");
    expect(html).toContain('name="action" value="cancel"');
  });
  it("retains cancellation when availability cannot be read, with no offered change", () => {
    const html = renderManage({ ...ready, days: [], slotsUnavailable: true });
    expect(html).toContain("Open times couldn");
    expect(html).toContain('name="action" value="cancel"');
    expect(html).not.toContain('name="slotId"');
    expect(renderManage({ ...ready, booking: { ...ready.booking, status: "cancelled" } })).not.toContain('<form');
  });
  it("held requests offer confirmation only and missing/failed links expose no action", () => {
    const html = renderManage({ ...ready, booking: { ...ready.booking, status: "held", confirmationRequired: true } });
    expect(html).toContain('name="action" value="confirm"');
    expect(html).not.toContain('name="action" value="cancel"');
    expect(html).not.toContain('name="slotId"');
    for (const kind of ["not_found", "error"] as const) expect(renderManage({ kind })).not.toContain('<form');
  });
  it("expired inquiry choices and offers offer no write, and read failures remain visible", () => {
    expect(renderToStaticMarkup(createElement(InquiryBookingOffer, { offer: null, actionUrl: "/fictional/action" }))).not.toContain('<form');
    const html = renderToStaticMarkup(createElement(InquiryBookingChoice, { choice: null, unavailable: true, actionUrl: "/fictional/action" }));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('<form');
  });
  it("preview submission uses local state rather than token endpoints or external writes", () => {
    for (const initialView of ["request", "received", "inquiry", "instant", "manage"] as const) {
      const html = renderToStaticMarkup(createElement(VisitorInquiriesPreview, { initialView }));
      expect(html).toContain("Fictional preview");
      expect(html).not.toContain('method="post"');
      expect(html).not.toContain('/api/');
      expect(html).not.toContain("America/New_York");
    }
  });
});
