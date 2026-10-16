import type { InquiryBookingChoice as Choice } from "@/products/inquiries";
import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import { bookingReceiptLabel } from "@/products/scheduling/contracts";
import { formatVisitorTime } from "@/platform/bookings/public-admission-time";
import { VisitorSlotWeek } from "./VisitorSlotWeek";
/** Signed inquiry handoff. Read-only until the customer explicitly posts one time. */
export function InquiryBookingChoice({ choice, actionUrl, unavailable, error, businessName, now }: { now?: number; businessName?: string; choice: Choice | null; actionUrl: string; unavailable?: boolean; error?: string }) {
  const booking = choice?.booking;
  const confirmUntil = booking?.status === "held" && Number.isFinite(Date.parse(booking.createdAt)) ? new Date(Date.parse(booking.createdAt) + 15 * 60000).toISOString() : null;
  const expired = now !== undefined && confirmUntil && Date.parse(confirmUntil) <= now;
  const choosing = Boolean(choice && !booking && choice.offer.slots.length);
  return <VisitorBookingShell siteName={businessName} wide={choosing}>
    <div className={choosing ? styles.split : styles.surface}>
      <h1 className={styles.title}>{expired ? "Confirmation time expired" : booking ? bookingReceiptLabel(booking.status, businessName) : "Choose an appointment time"}</h1>
      {!choice ? <p role={unavailable ? "alert" : undefined} className={styles.intro}>{unavailable ? "These times couldn't load. Reload in a minute, or reply to the business for help." : "This link expired or these times are no longer available. Reply to the business for fresh times."}</p> : <>
        <p className={styles.intro}>{expired ? "Reply to the business for a new time. This request was not confirmed." : booking ? booking.status === "held" ? "Open the confirmation email and confirm your request. Nothing is booked until you do." : booking.status === "requested" ? `${businessName || "The business"} will reply to accept this time or suggest another. Use your booking email to check or cancel your request.` : booking.status === "confirmed" ? "Your time is booked. Use your booking email to change or cancel it." : "This appointment is no longer waiting for confirmation." : "Pick a time, then check your email to confirm. The business may then need to accept your request."}</p>
        {confirmUntil ? <p className={styles.deadline}>Confirm by {formatVisitorTime(confirmUntil, booking!.timeZone)}.</p> : null}
        {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error === "rate" ? "Wait a minute before trying again." : "That time couldn't be requested. Reload for current times, or reply to the business. Nothing was confirmed."}</p>}
        <div className={styles.section}>
          {booking ? <dl className={styles.summary}><dt>What</dt><dd>{choice.offer.serviceName}</dd><dt>When</dt><dd>{formatVisitorTime(booking.start, booking.timeZone)}</dd><dt>Status</dt><dd>{expired ? "Confirmation time expired" : bookingReceiptLabel(booking.status, businessName)}</dd></dl>
            : choice.offer.slots.length === 0 ? <><h2 className={styles.label}>{choice.offer.serviceName}</h2><p className={styles.note}>No times are open. Reply to the business for fresh times.</p></>
              : <form method="post" action={actionUrl} className={styles.card}>
                <p className={styles.cardTitle}>{choice.offer.serviceName}</p>
                <p className={styles.deadline}>Choose by {formatVisitorTime(choice.offer.expiresAt, choice.offer.timeZone)}.</p>
                <VisitorSlotWeek slots={choice.offer.slots} timeZone={choice.offer.timeZone} name="slot" value={(_slot, index) => String(index)} legend="Open times" />
                <div className={styles.actions}><button type="submit" className={`${styles.button} ${styles.block}`}>Request this time</button></div>
              </form>}
        </div>
      </>}
    </div>
  </VisitorBookingShell>;
}
