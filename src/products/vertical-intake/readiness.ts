/** What an office needs before Dental intake can go live, and what only makes it better. Pure. */

import type { IntakeReadinessRow } from "./contracts";

export type { IntakeReadinessRow };

function hasFact(facts: Record<string, unknown>, key: string): boolean {
  const value = facts[key];
  return value !== undefined && value !== null && value !== "";
}

export function intakeReadiness(input: {
  facts: Record<string, unknown>;
  verifiedSites: number;
  bookingServiceName: string | null;
  manualBookingsOn: boolean;
  emailOn: boolean;
}): IntakeReadinessRow[] {
  const { facts } = input;
  const carriers = (facts.insurance_accepted as { carriers?: unknown } | undefined)?.carriers;
  const hasInsurance = Array.isArray(carriers) && carriers.length > 0;
  const booking = Boolean(input.bookingServiceName) && input.manualBookingsOn;
  return [
    {
      id: "phone", blocking: true, state: hasFact(facts, "phone") ? "done" : "missing",
      label: "Office phone in Business details",
      detail: hasFact(facts, "phone") ? "Patients with tooth pain are told to call this number." : "Add and confirm your office phone. Patients with tooth pain are told to call it.",
    },
    {
      id: "site", blocking: true, state: input.verifiedSites >= 1 ? "done" : "missing",
      label: "Your website is connected",
      detail: input.verifiedSites >= 1 ? "The form shows on your connected website." : "Connect and verify your website first. The form shows there.",
    },
    {
      id: "insurance", blocking: false, state: hasInsurance ? "done" : "missing",
      label: "Insurance plans you accept",
      detail: hasInsurance ? "Patients choose from your list." : "Patients will only see No insurance and Other.",
    },
    {
      id: "hours", blocking: false, state: hasFact(facts, "hours") ? "done" : "missing",
      label: "Office hours",
      detail: hasFact(facts, "hours") ? "The pain message can say whether you're open now." : "The pain message can't say whether you're open now.",
    },
    {
      id: "booking", blocking: false, state: booking ? "done" : "missing",
      label: "Visit times from Bookings",
      detail: booking ? `Visits are proposed for ${input.bookingServiceName}.` : "Without it, Strelva won't propose times and the office books by phone.",
    },
    {
      id: "email", blocking: false, state: "note",
      label: "Patient email",
      detail: input.emailOn ? "Booking confirmations follow your Bookings email settings." : "Patients aren't emailed while customer email is off. The office calls them back.",
    },
  ];
}

export function intakeCanGoLive(rows: readonly IntakeReadinessRow[]): boolean {
  return rows.every(row => !row.blocking || row.state === "done");
}
