import type { InquiryBookingChoice as Choice } from "@/products/inquiries";
import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import { bookingReceiptLabel } from "@/products/scheduling/contracts";
import { VisitorSlotWeek } from "./VisitorSlotWeek";
import { safeZone } from "@/platform/bookings/visitor-week";

const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

/** "Wednesday, Nov 25 at 10:30 AM Eastern", the zone said once and short. */
function visitWords(iso: string, timeZone: string): string {
  const zone = safeZone(timeZone);
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(d);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longGeneric" }).formatToParts(d).find(p => p.type === "timeZoneName")?.value ?? "";
  return `${day} at ${time}${name ? ` ${name.replace(/ Time$/, "")}` : ""}`;
}

/** The deadline without a zone: the week already says which zone its times are in. */
function deadlineWords(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: safeZone(timeZone), weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(/, (\d+:\d\d)/, " at $1");
}

/**
 * Signed inquiry handoff (XA · E4). Read-only until the customer explicitly
 * posts one time. Every state says what is true and gives a way forward: the
 * office's phone as a tap-to-call link when the hours record has one.
 */
export function InquiryBookingChoice({ choice, actionUrl, unavailable, error, businessName, businessPhone, now }: {
  now?: number; businessName?: string; choice: Choice | null; actionUrl: string; unavailable?: boolean; error?: string;
  /** The office phone, when the link could not load the choice (and so its record). */
  businessPhone?: string | null;
}) {
  const booking = choice?.booking;
  const business = businessName?.trim() || choice?.businessName?.trim() || "";
  const who = business || "The business";
  const phone = choice?.businessPhone ?? businessPhone ?? null;
  const call = phone ? <a className={styles.call} href={telHref(phone)}>Call {business || "the office"} at <span className={styles.nowrap}>{phone}</span></a> : null;
  const confirmUntil = booking?.status === "held" && Number.isFinite(Date.parse(booking.createdAt)) ? new Date(Date.parse(booking.createdAt) + 15 * 60000).toISOString() : null;
  const expired = now !== undefined && confirmUntil && Date.parse(confirmUntil) <= now;
  const empty = Boolean(choice && !booking && choice.offer.slots.length === 0);
  const choosing = Boolean(choice && !booking && choice.offer.slots.length);
  const service = choice?.offer.services.find(s => s.id === choice.offer.serviceId)?.name ?? choice?.offer.serviceName.split(" · ")[0] ?? "";

  const heading = !choice ? unavailable ? "These times didn’t load" : "This link expired"
    : expired ? "Confirmation time expired"
      : booking ? bookingReceiptLabel(booking.status, business)
        : empty ? "No open times right now"
          : `Choose a time for your ${service ? service.charAt(0).toLowerCase() + service.slice(1) : "visit"}`;

  return <VisitorBookingShell siteName={business} wide={false}>
    <div className={`${styles.surface} ${choosing ? styles.choose : ""}`}>
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
          : empty ? <p className={styles.intro}>{who} has nothing open in the days this link covers.{call ? <> {call} to find a time.</> : " Reply to the email you got and they will send fresh times."}</p>
            : <p className={styles.intro}>Pick a time, then confirm it from your email. {who} accepts it or suggests another. Choose by {deadlineWords(choice.offer.expiresAt, choice.offer.timeZone)}.</p>}
        {confirmUntil && !expired ? <p className={styles.deadline}>Confirm by {deadlineWords(confirmUntil, booking!.timeZone)}.</p> : null}
        {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error === "rate" ? "Wait a minute before trying again." : `That time couldn't be requested, so nothing was booked. Reload for current times${call ? "" : `, or reply to ${who}`}.`}{error !== "rate" && call ? <> {call}</> : null}</p>}
        {booking && booking.status !== "confirmed" && call ? <p className={styles.note}>{call}</p> : null}
        {choosing ? <form method="post" action={actionUrl} className={styles.section}>
          <VisitorSlotWeek slots={choice.offer.slots} timeZone={choice.offer.timeZone} closures={choice.closures ?? []} name="slot" value={(_slot, index) => String(index)} legend={`Open times for ${service || "your visit"}`} />
          <div className={styles.actions}><button type="submit" className={styles.button}>Request this time</button></div>
        </form> : null}
      </>}
    </div>
  </VisitorBookingShell>;
}
