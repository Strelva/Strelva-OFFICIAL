import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ offer: vi.fn(async () => null as unknown) }));
vi.mock("@/platform/bookings/inquiry-offers", () => ({
  readInquiryBookingOfferForReceipt: mocks.offer,
  bookingOfferEmailOptions: () => ({ choices: { label: "Consultation", items: [{ label: "Tuesday, 10 AM", url: "https://app.strelva.com/book-inquiry/fictional?pick=t" }] }, button: { label: "See all open times", url: "https://app.strelva.com/book-inquiry/fictional" } }),
}));
import { createInquiryDeliveryMessage, prepareInquiryDeliveryMessage } from "@/products/inquiries/delivery-message";
const inquiry = { id: "inq1", tenantId: "fictional", name: "Dana", email: "dana@example.test", businessName: "Fictional Firm", receivedAt: "2026-11-01T12:00:00Z" };
const route = { tenantId: "fictional", businessName: "Fictional Firm", customerEmail: "dana@example.test", customerReplyTo: "firm@example.test", ownerEmail: "owner@example.test", ownerNotification: "legacy" as const, active: true };
beforeEach(() => { mocks.offer.mockReset(); mocks.offer.mockResolvedValue(null); });
it("keeps the original receipt exact when there is no enabled offer", async () => {
  expect(await prepareInquiryDeliveryMessage(inquiry, route, "reply")).toEqual(createInquiryDeliveryMessage(inquiry, route, "reply"));
});
it("reviews and delivers the same branded booking proposal in the captured receipt", async () => {
  mocks.offer.mockResolvedValue({ id: "offer1" });
  const message = await prepareInquiryDeliveryMessage(inquiry, route, "reply");
  expect(mocks.offer).toHaveBeenCalledWith("fictional", "inq1");
  expect(message).toMatchObject({ fromName: "Fictional Firm", tags: { strelva_booking_offer: "1" }, options: { heading: "Pick a time that works", button: { label: "See all open times" }, choices: { label: "Consultation", items: [{ label: "Tuesday, 10 AM", url: "https://app.strelva.com/book-inquiry/fictional?pick=t" }] } } });
});
it("never adds customer bearer links to an owner notification", async () => {
  mocks.offer.mockResolvedValue({ id: "offer1" });
  expect(await prepareInquiryDeliveryMessage(inquiry, route, "owner_notification")).toEqual(createInquiryDeliveryMessage(inquiry, route, "owner_notification"));
  expect(mocks.offer).not.toHaveBeenCalled();
});
