import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { VisitorInquiriesPreview } from "@/experience/workspace/preview/VisitorInquiriesPreview";
import type { ManageBookingState } from "@/platform/bookings/manage";

const ready: Extract<ManageBookingState, { kind: "ready" }> = {
  kind: "ready", booking: { siteName: "Fixture business", title: "Consultation", day: "Friday", time: "9:00 AM", timeZoneLabel: "Eastern", status: "pending" },
  days: [{ day: "Monday", slots: [{ id: "open-slot", time: "11:00 AM" }] }], slotsUnavailable: false, changesClosed: false,
};
const renderManage = (state: ManageBookingState) => renderToStaticMarkup(createElement(ManageBooking, { state, actionUrl: "/b/fictional-token/action" }));

describe("visitor presentation preserves explicit booking actions", () => {
  it("keeps pending separate from confirmation and preserves exact native POST fields", () => {
    const html = renderManage(ready);
    expect(html).toContain("Waiting for the business to confirm");
    expect(html).not.toContain("You’re booked");
    expect(html).toContain('action="/b/fictional-token/action" method="post"');
    expect(html).toContain('name="action" value="reschedule"');
    expect(html).toMatch(/<input[^>]*name="slotId"[^>]*required=""|<input[^>]*required=""[^>]*name="slotId"/);
    expect(html).toContain('value="open-slot"');
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
    }
  });
});
