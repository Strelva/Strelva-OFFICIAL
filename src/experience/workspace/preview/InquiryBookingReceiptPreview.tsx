"use client";
import { VisitorBookingShell } from "@/experience/bookings/VisitorBookingShell";
import { StrelvaInquiryForm } from "../../../../custom-repo-starter/StrelvaInquiryForm";
/** Fictional submission callback: no fetch, booking, signature or email. */
export function InquiryBookingReceiptFixture() {
  return <VisitorBookingShell siteName="The Mooney Firm">
    <StrelvaInquiryForm definition={{ schemaVersion: 1, capabilityId: "fixture", version: 1, name: "Consultation", form: { id: "fixture", component: "form", title: "Ask about a consultation", intro: "Tell The Mooney Firm how we can help.", disclosure: "Strelva", fields: [{ id: "name", kind: "text", component: "text_field", label: "Name", required: true }, { id: "email", kind: "email", component: "email_field", label: "Email", required: true }] } }} onSubmit={async () => ({ bookingOffer: { serviceName: "Initial consultation", slots: [0, 1, 2].map((index) => ({ label: `Fri, Nov 6, ${index === 0 ? "9:00" : index === 1 ? "9:30" : "10:00"} AM Eastern Time`, chooseUrl: `/preview/strelva/inquiry-booking?slot=${index}` })) } })} />
  </VisitorBookingShell>;
}
