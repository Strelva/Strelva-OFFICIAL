/**
 * The booking messages the `booking-reminders` cron sends (bookings spec,
 * "Notifications"): the customer's reminders 24 hours and 2 hours before, the
 * owner's one chase of a request unanswered after 24 hours, and the customer's
 * notice when a request lapses at 72 hours with new times to pick from.
 *
 * Pure builders. Sending goes through the one email path
 * (src/lib/email/send.ts) and its audience gates; customer mail comes from
 * mail.strelva.com with the business's name.
 */
import type { EmailOptions } from "@/platform/infra/email/layout";
import { cleanSubjectText } from "@/platform/infra/email/text";
import type { StoreBooking } from "./store";

/** "Tue, Nov 3" and "10:00 AM" in the booking's own zone. */
export function bookingWhen(booking: Pick<StoreBooking, "localDate" | "localStart">): { day: string; time: string } {
  const date = new Date(`${booking.localDate}T12:00:00Z`);
  const day = Number.isNaN(date.getTime())
    ? booking.localDate
    : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  const [h, m] = booking.localStart.split(":").map(Number);
  const hour = ((h ?? 0) % 12) || 12;
  return { day, time: `${hour}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"}` };
}

function first(name: string): string {
  return cleanSubjectText(name).split(" ")[0] || "there";
}

export interface ReminderEmail {
  subject: string;
  options: EmailOptions;
}

export function customerReminderEmail(input: {
  booking: StoreBooking;
  kind: "reminder_24h" | "reminder_2h";
  businessName: string;
  manageUrl: string | null;
}): ReminderEmail {
  const business = cleanSubjectText(input.businessName);
  const service = cleanSubjectText(input.booking.serviceName);
  const { day, time } = bookingWhen(input.booking);
  const soon = input.kind === "reminder_2h";
  const with_ = business ? ` with ${business}` : "";
  return {
    subject: soon ? `Today at ${time}: ${service}${with_}` : `Reminder: ${service}${with_}, ${day} at ${time}`,
    options: {
      preheader: `${service}${with_}, ${day} at ${time}.`,
      heading: soon ? "See you soon" : "See you tomorrow",
      paragraphs: [
        `Hi ${first(input.booking.customer.name)}, this is a reminder of your booking${with_}.`,
        input.manageUrl
          ? "Need to change the time or cancel? Use the link below."
          : "Need to change or cancel? Reply to this email and the business will help.",
      ],
      rows: [
        { label: "Service", value: service },
        { label: "Date", value: day },
        { label: "Time", value: time },
      ],
      ...(input.manageUrl ? { button: { label: "Change or cancel", url: input.manageUrl } } : {}),
      footerNote: business ? `For ${business}` : undefined,
    },
  };
}

export function ownerRequestReminderEmail(input: {
  booking: StoreBooking;
  businessName: string;
  openUrl: string;
}): ReminderEmail {
  const who = cleanSubjectText(input.booking.customer.name) || "A customer";
  const { day, time } = bookingWhen(input.booking);
  return {
    subject: `Still waiting on you: ${who}, ${day} ${time}`,
    options: {
      preheader: `${who} asked for ${day} at ${time}. It hasn't been confirmed.`,
      heading: "A booking request is still waiting",
      paragraphs: [
        `${who} asked for ${cleanSubjectText(input.booking.serviceName)} on ${day} at ${time}. Nobody has confirmed it yet.`,
        "Approve it or say not yet from the email we sent when it came in, or open Bookings. If nobody answers within 3 days of the request, Strelva tells the customer the time wasn't confirmed and offers other times. A booking is never confirmed by silence.",
      ],
      button: { label: "Open Bookings", url: input.openUrl },
      footerNote: input.businessName ? `For ${cleanSubjectText(input.businessName)}` : undefined,
    },
  };
}

export function requestLapsedEmail(input: {
  booking: StoreBooking;
  businessName: string;
  alternatives: string[];
  bookAgainUrl: string | null;
}): ReminderEmail {
  const business = cleanSubjectText(input.businessName);
  const { day, time } = bookingWhen(input.booking);
  const with_ = business ? ` with ${business}` : "";
  const paragraphs = [
    `Hi ${first(input.booking.customer.name)}, your request for ${day} at ${time}${with_} wasn't confirmed, so that time is not booked.`,
    input.alternatives.length
      ? "These times are open right now:"
      : "Pick another time on the website, or reply to this email to reach the business.",
  ];
  return {
    subject: `Your request for ${day} at ${time} wasn't confirmed`,
    options: {
      preheader: `${day} at ${time} is not booked. Pick another time.`,
      heading: "Your time wasn't confirmed",
      paragraphs,
      ...(input.alternatives.length ? { bullets: input.alternatives.slice(0, 3).map((title) => ({ title })) } : {}),
      ...(input.bookAgainUrl ? { button: { label: "Pick another time", url: input.bookAgainUrl } } : {}),
      footerNote: business ? `For ${business}` : undefined,
    },
  };
}
