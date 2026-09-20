"use client";

import { StrelvaConnectedBookingForm } from "./StrelvaBookingForm";
import { StrelvaConnectedInquiryForm } from "./StrelvaInquiryForm";
import type { PublicBookingRange } from "./booking-client";

/**
 * The generated-site composition for a public inquiry plus a native booking.
 * Each connection is explicit. The booking form also records the visitor
 * inquiry before the native calendar operation, so a site can render the two
 * surfaces together without passing provider or workspace identifiers.
 */
export function StrelvaInquiryBookingForm({
  baseUrl,
  tenant,
  inquiryCapabilityId,
  bookingCapabilityId,
  bookingRange,
}: {
  baseUrl: string;
  tenant: string;
  inquiryCapabilityId: string;
  bookingCapabilityId: string;
  bookingRange: PublicBookingRange;
}) {
  return (
    <section aria-label="Contact and booking">
      <StrelvaConnectedInquiryForm baseUrl={baseUrl} tenant={tenant} capabilityId={inquiryCapabilityId} />
      <StrelvaConnectedBookingForm baseUrl={baseUrl} tenant={tenant} capabilityId={bookingCapabilityId} range={bookingRange} />
    </section>
  );
}
