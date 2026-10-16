import type { InquiryBookingChoice as Choice } from "@/products/inquiries";
import { VisitorBookingShell, VisitorCall } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import { bookingReceiptLabel } from "@/products/scheduling/contracts";
import { VisitorSlotWeek } from "./VisitorSlotWeek";
import { safeZone } from "@/platform/bookings/visitor-week";
import { visitorDeadlineWords } from "@/platform/bookings/public-admission-time";
import type { VisitorBrand } from "@/products/websites/client";
import { VisitorTimeForm } from "./VisitorTimeForm";

/** "Wednesday, Nov 25 at 10:30 AM Eastern", the zone said once and short. */
function visitWords(iso: string, timeZone: string): string {
  const zone = safeZone(timeZone);
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(d);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longGeneric" }).formatToParts(d).find(p => p.type === "timeZoneName")?.value ?? "";
  return `${day} at ${time}${name ? ` ${name.replace(/ Time$/, "")}` : ""}`;
}

/**
 * Signed inquiry handoff (XA · E4). Read-only until the customer explicitly
 * posts one time. Every state says what is true and gives a way forward: the
 * office's phone as a tap-to-call link when the hours record has one.
 *
 * Choosing a time is the business's own booking page: its look, its name and
 * phone in the header, what to do on the left and the week of times as the one
 * object on the right (one column on a phone, the button riding at the bottom).
 */
export function InquiryBookingChoice({ choice, actionUrl, unavailable, error, businessName, businessPhone, now, brand, pick }: {
  now?: number; businessName?: string; choice: Choice | null; actionUrl: string; unavailable?: boolean; error?: string;
  /** The office phone, when the link could not load the choice (and so its record). */
  businessPhone?: string | null;
  /** The business's own look, from its website or recorded branding. */
  brand?: VisitorBrand | null;
  /** The time the visitor tapped in their email (its index, `?slot=`), checked when the page opens. */
  pick?: string | null;
}) {
  const booking = choice?.booking;
  const business = businessName?.trim() || choice?.businessName?.trim() || "";
  const who = business || "The business";
  const phone = choice?.businessPhone ?? businessPhone ?? null;
  const call = phone ? <VisitorCall name={business} phone={phone} /> : null;
  const confirmUntil = booking?.status === "held" && Number.isFinite(Date.parse(booking.createdAt)) ? new Date(Date.parse(booking.createdAt) + 15 * 60000).toISOString() : null;
  const expired = now !== undefined && confirmUntil && Date.parse(confirmUntil) <= now;
  const empty = Boolean(choice && !booking && choice.offer.slots.length === 0);
  const choosing = Boolean(choice && !booking && choice.offer.slots.length);
  const service = choice?.offer.services.find(s => s.id === choice.offer.serviceId)?.name ?? choice?.offer.serviceName.split(" · ")[0] ?? "";
  const errorWords = error === "rate" ? "Wait a minute before trying again."
    : error === "pick" ? "Pick a time first. Nothing was requested."
    : error ? `That time couldn't be requested, so nothing was booked. Reload for current times${call ? "" : `, or reply to ${who}`}.` : null;

  if (choosing && choice) {
    const length = choice.offer.serviceName.split(" · ")[1];
    return <VisitorBookingShell siteName={business} wide brand={brand} phone={phone}>
      <div className={styles.book}>
        <div className={styles.bookLead}>
          <h1 className={styles.title}>{business ? `Pick a time to see ${business}` : "Pick a time for your visit"}</h1>
          <p className={styles.intro}>Then confirm it from your email. {who} accepts it or suggests another, and nothing is booked before that.</p>
          {brand?.photo ? <img className={styles.bookPhoto} src={brand.photo.url} alt={brand.photo.alt} /> : null}
        </div>
        <section className={styles.bookCard} aria-labelledby="book-service">
          <p id="book-service" className={styles.cardTitle}>{service || "Your visit"}{length ? <span className={styles.cardMeta}> · {length}</span> : null}</p>
          <p className={styles.deadline}>Choose by {visitorDeadlineWords(choice.offer.expiresAt, choice.offer.timeZone, now)}.</p>
          {errorWords ? <p role="alert" className={styles.said} data-tone="problem">{errorWords}{error && error !== "rate" && error !== "pick" && call ? <> {call}</> : null}</p> : null}
          <VisitorTimeForm action={actionUrl} name="slot" submitLabel="Request this time" sticky>
            <VisitorSlotWeek slots={choice.offer.slots} timeZone={choice.offer.timeZone} closures={choice.closures ?? []} name="slot" value={(_slot, index) => String(index)} legend={`Open times for ${service || "your visit"}`} picked={pick != null && /^\d+$/.test(pick) ? choice.offer.slots[Number(pick)]?.start ?? null : null} />
          </VisitorTimeForm>
        </section>
      </div>
    </VisitorBookingShell>;
  }

  const heading = !choice ? unavailable ? "These times didn\u2019t load" : "This link expired"
    : expired ? "Confirmation time expired"
      : booking ? bookingReceiptLabel(booking.status, business)
        : "No open times right now";

  return <VisitorBookingShell siteName={business} brand={brand} phone={phone}>
    <div className={styles.page}>
      <h1 className={styles.title}>{heading}</h1>
      {!choice ? <p role={unavailable ? "alert" : undefined} className={styles.intro}>
        {unavailable ? "Nothing was booked. Reload in a minute." : "These times are no longer offered. Nothing was booked."}{call ? <> {call}, or reply to the email for fresh times.</> : unavailable ? " Or reply to the email you got." : " Reply to the email you got for fresh times."}
      </p> : <>
        {booking ? <p className={styles.intro}>
          {service ? `${service}, ` : ""}{visitWords(booking.start, booking.timeZone)}.{" "}
          {expired ? `This request was not confirmed. Reply to ${who} for a new time.`
            : booking.status === "held" ? "Open the confirmation email and confirm. Nothing is booked until you do."
              : booking.status === "requested" ? `${who} will reply to your email.`
                : booking.status === "confirmed" ? "You're booked. Use your booking email to change or cancel."
                  : "This appointment is no longer waiting for confirmation."}
        </p>
          : empty ? <p className={styles.intro}>{who} has nothing open in the days this link covers.{call ? <> {call} to find a time.</> : " Reply to the email you got and they will send fresh times."}</p> : null}
        {confirmUntil && !expired ? <p className={styles.deadline}>Confirm by {visitorDeadlineWords(confirmUntil, booking!.timeZone, now)}.</p> : null}
        {errorWords ? <p role="alert" className={`${styles.notice} ${styles.error}`}>{errorWords}{error !== "rate" && error !== "pick" && call ? <> {call}</> : null}</p> : null}
        {booking && booking.status !== "confirmed" && call ? <p className={styles.note}>{call}</p> : null}
      </>}
    </div>
  </VisitorBookingShell>;
}
