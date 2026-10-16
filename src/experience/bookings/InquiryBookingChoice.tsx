import type { InquiryBookingChoice as Choice } from "@/products/inquiries";
import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import { formatVisitorTime } from "@/platform/bookings/public-admission-time";
import { VisitorSlotWeek } from "./VisitorSlotWeek";
import { VisitorBookingOutcome } from "./VisitorBookingOutcome";
/** Signed inquiry handoff. Read-only until the customer explicitly posts one time. */
export function InquiryBookingChoice({ choice, actionUrl, unavailable, error, businessName, now }: { now?: number; businessName?: string; choice: Choice | null; actionUrl: string; unavailable?: boolean; error?: string }) {
  const booking = choice?.booking;
  const confirmUntil = booking?.status === "held" && Number.isFinite(Date.parse(booking.createdAt)) ? new Date(Date.parse(booking.createdAt) + 15 * 60000).toISOString() : null;
  const expired = Boolean(now !== undefined && confirmUntil && Date.parse(confirmUntil) <= now);
  const choosing = Boolean(choice && !booking && choice.offer.slots.length);
  if (choice && booking) return <VisitorBookingShell siteName={businessName}>
    <VisitorBookingOutcome status={booking.status} start={booking.start} timeZone={booking.timeZone} service={choice.offer.serviceName} businessName={businessName} confirmUntil={confirmUntil} expired={expired} />
  </VisitorBookingShell>;
  return <VisitorBookingShell siteName={businessName} wide={choosing}>
    <div className={choosing ? styles.split : styles.page}>
      <h1 className={styles.title}>{!choice ? unavailable ? "These times couldn’t load" : "This link has expired" : "Choose an appointment time"}</h1>
      {!choice ? <p role={unavailable ? "alert" : undefined} className={styles.intro}>{unavailable ? "These times couldn't load. Reload in a minute, or reply to the business for help." : "This link expired or these times are no longer available. Reply to the business for fresh times."}</p> : <>
        <p className={styles.intro}>Pick a time, then check your email to confirm. The business may then need to accept your request.</p>
        {error && <p role="alert" className={styles.said} data-tone="problem">{error === "rate" ? "Wait a minute before trying again." : "That time couldn't be requested. Reload for current times, or reply to the business. Nothing was confirmed."}</p>}
        <div className={styles.section}>
          {choice.offer.slots.length === 0 ? <><h2 className={styles.label}>{choice.offer.serviceName}</h2><p className={styles.note}>No times are open. Reply to the business for fresh times.</p></>
              : <form method="post" action={actionUrl} className={styles.card}>
                <p className={styles.cardTitle}>{choice.offer.serviceName}</p>
                <p className={styles.deadline}>Choose by {formatVisitorTime(choice.offer.expiresAt, choice.offer.timeZone)}.</p>
                <VisitorSlotWeek slots={choice.offer.slots} timeZone={choice.offer.timeZone} name="slot" value={(_slot, index) => String(index)} legend="Open times" />
                <div className={styles.actions}><button type="submit" data-xa-primary className={`${styles.button} ${styles.block}`}>Request this time</button></div>
              </form>}
        </div>
      </>}
    </div>
  </VisitorBookingShell>;
}
