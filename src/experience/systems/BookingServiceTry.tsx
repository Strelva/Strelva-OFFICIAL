"use client";

import { StrelvaBookingForm } from "../../../custom-repo-starter/StrelvaBookingForm";
import type { AskBookingService, PublicBookingSchedule } from "@/products/scheduling/contracts";

/** The real booking widget with only isolated callbacks and proposed terms. */
export function BookingServiceTry({ service, schedule }: { service: AskBookingService; schedule: PublicBookingSchedule }) {
  return <section className="mt-6 space-y-4" aria-label="New booking service proposal">
    <div className="rounded-lg border border-gray-border bg-surface-inset p-4">
      <h2 className="font-display text-xl">{service.serviceName}</h2>
      <p className="mt-2 text-sm">Proposed duration: {service.durationMinutes} minutes. Time zone: {service.timeZone}.</p>
      <p className="mt-2 text-sm text-gray-muted">These are proposed test times. They have not been checked against your live calendar. The owner reviews these terms before the service can accept bookings.</p>
    </div>
    <StrelvaBookingForm schedule={schedule} testOnly submitLabel="Try booking this time" onReserve={async slot => ({ schemaVersion: 1, reservationId: "test-reservation", managementToken: "test-only-token", capabilityId: schedule.capabilityId, version: schedule.version, provider: schedule.provider, status: "pending", title: schedule.name, start: slot.start, end: slot.end, timeZone: schedule.timeZone })} />
  </section>;
}
