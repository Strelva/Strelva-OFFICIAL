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
import { visitorTimeZoneLabel } from "./public-admission-time";
import { splitZone, visitorBookingMail } from "@/platform/infra/email/visitor-mail";
import type { XaMail } from "@/platform/infra/email/xa-mail";
import { BRAND_CREDIT } from "@/platform/infra/agency-brand";

/** "Tue, Nov 3" and "10:00 AM" in the booking's own zone. */
export function bookingWhen(booking: Pick<StoreBooking, "localDate" | "localStart"> & Partial<Pick<StoreBooking, "timeZone">>): { day: string; time: string } {
  const date = new Date(`${booking.localDate}T12:00:00Z`);
  const day = Number.isNaN(date.getTime())
    ? booking.localDate
    : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  const [h, m] = booking.localStart.split(":").map(Number);
  const hour = ((h ?? 0) % 12) || 12;
  return { day, time: `${hour}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"}${booking.timeZone ? ` ${visitorTimeZoneLabel(`${booking.localDate}T12:00:00Z`, booking.timeZone, "time zone unavailable")}` : ""}` };
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
  const subject = soon ? `Today at ${time}: ${service}${with_}` : `Reminder: ${service}${with_}, ${day} at ${time}`;
  return {
    subject,
    options: {
      xa: visitorBookingMail({
        business, subject, preheader: `${service}${with_}, ${day} at ${time}.`,
        headline: soon ? `See you today, ${first(input.booking.customer.name)}` : `See you tomorrow, ${first(input.booking.customer.name)}`,
        lede: soon ? `Your visit${with_} is in a couple of hours.` : `This is a reminder of your visit${with_}.`,
        when: { day: soon ? `Today, ${day}` : `Tomorrow, ${day}`, time, detail: service },
        note: input.manageUrl ? "Need a different time? Change or cancel it from your booking page." : "Need to change or cancel? Reply to this email and the business will help.",
        ...(input.manageUrl ? { primary: { label: "Change or cancel", url: input.manageUrl } } : {}),
      }),
      businessName: business,
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
  const subject = `Still waiting on you: ${who}, ${day} ${time}`;
  return {
    subject,
    options: {
      xa: ownerChaseMail({ who, day, time, service: cleanSubjectText(input.booking.serviceName), business: cleanSubjectText(input.businessName), openUrl: input.openUrl, subject }),
      preheader: `${who} asked for ${day} at ${time}. It hasn't been confirmed.`,
      heading: "A booking request is still waiting",
      paragraphs: [
        `${who} asked for ${cleanSubjectText(input.booking.serviceName)} on ${day} at ${time}. Nobody has confirmed it yet.`,
        "Confirm it or say not yet from the email we sent when it came in, or open Bookings. If nobody answers within 3 days of the request, the customer receives a notice saying the time wasn't confirmed, with an option to choose other times. A booking is never confirmed by silence.",
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
      : input.bookAgainUrl ? "Pick another time on the website, or contact the business for help." : "Contact the business to ask for another time.",
  ];
  const subject = `Your request for ${day} at ${time} wasn't confirmed`;
  const open = input.alternatives.slice(0, 3);
  return {
    subject,
    options: {
      xa: visitorBookingMail({
        business, subject, preheader: `${day} at ${time} is not booked. Pick another time.`,
        status: { tone: "ended", label: "Not booked" },
        headline: "Your time wasn't confirmed",
        lede: `Hi ${first(input.booking.customer.name)}, ${business || "the business"} didn't confirm your request in time, so this time is not booked.`,
        when: { day, time, detail: cleanSubjectText(input.booking.serviceName), struck: true },
        ...(open.length && input.bookAgainUrl ? { choices: { label: "Open right now", items: open.map(label => ({ label, url: input.bookAgainUrl! })) } }
          : open.length ? { note: `Open right now: ${open.join(", ")}. Reply to this email to ask for one.` }
          : { note: input.bookAgainUrl ? "Pick another time on the website, or reply to this email for help." : "Reply to this email to ask for another time." }),
        ...(input.bookAgainUrl ? { primary: { label: "Pick another time", url: input.bookAgainUrl } } : {}),
      }),
      businessName: business,
      preheader: `${day} at ${time} is not booked. Pick another time.`,
      heading: "Your time wasn't confirmed",
      paragraphs,
      ...(input.alternatives.length ? { bullets: input.alternatives.slice(0, 3).map((title) => ({ title })) } : {}),
      ...(input.bookAgainUrl ? { button: { label: "Pick another time", url: input.bookAgainUrl } } : {}),
      footerNote: business ? `For ${business}` : undefined,
    },
  };
}

/** The owner's one chase (XA · E1 language): what waits, the time it holds, one way in. */
function ownerChaseMail(input: { who: string; day: string; time: string; service: string; business: string; openUrl: string; subject: string }): XaMail {
  return {
    subject: input.subject,
    preheader: `${input.who} asked for ${input.day} at ${input.time}. It hasn't been confirmed.`,
    fromName: input.business || "Strelva",
    blocks: [
      ...(input.business ? [{ kind: "identity" as const, business: input.business }] : []),
      { kind: "waits", label: "Waits for you" },
      { kind: "headline", text: input.who === "A customer" ? `Confirm this request for ${input.day}?` : `Confirm ${input.who} for ${input.day}?`, lede: `${input.who} asked a day ago and nobody has answered. A booking is never confirmed by silence.` },
      { kind: "when", ...splitZone({ day: input.day, time: input.time, detail: `${input.service} · ${input.who}` }) },
      { kind: "primary", action: { label: "Open Bookings", url: input.openUrl }, note: "Confirm it or say not yet there." },
      { kind: "rule" },
      { kind: "sentence", text: `If nobody answers within 3 days of the request, ${input.who} is told the time wasn't confirmed and can pick another.`, muted: true },
    ],
    footer: [input.business, BRAND_CREDIT.replace(/\.$/, "")].filter(Boolean).join(" · "),
  };
}
