import type { InquiryBookingOffer as Offer } from "@/platform/bookings/inquiry-offers";
import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import type { InquiryReceipt } from "@/products/scheduling/contracts";
import { formatVisitorTime } from "@/platform/bookings/public-admission-time";
import { VisitorSlotWeek } from "./VisitorSlotWeek";
import { VisitorBookingOutcome } from "./VisitorBookingOutcome";
/** Plain customer form: keyboard usable, never preselects a commitment. */
export function InquiryBookingOffer({ offer, actionUrl, error, unavailable, receipt, now }: { now?: number; offer: Offer | null; actionUrl: string; error?: boolean; unavailable?: boolean; receipt?: InquiryReceipt | null }) {
  const expired = Boolean(now !== undefined && receipt?.status === "held" && receipt.confirmUntil && Date.parse(receipt.confirmUntil) <= now);
  const choosing = Boolean(offer && !offer.booked && offer.slots.length);
  if (offer?.booked && receipt) return <VisitorBookingShell siteName={offer.businessName}>
    <VisitorBookingOutcome status={receipt.status} start={receipt.start} timeZone={receipt.timeZone} service={offer.serviceName} businessName={offer.businessName} confirmUntil={receipt.confirmUntil} expired={expired} />
  </VisitorBookingShell>;
  return <VisitorBookingShell siteName={offer?.businessName} wide={choosing}><div className={choosing ? styles.split : styles.page}>
    <h1 className={styles.title}>{!offer ? unavailable ? "These times couldn’t load" : "This suggestion has expired" : offer.booked ? "Booking status unavailable" : "Choose a time to request"}</h1>
    <p className={styles.intro} role={unavailable ? "alert" : undefined}>{!offer ? unavailable ? "Nothing has changed. Reload in a minute, or reply to the business for help." : "Reply to the business to ask for new times." : offer.booked ? "Reload to read the current status, or use your latest booking email. Do not request this time again." : "Pick a time below, then check your email to confirm. The business may then need to accept your request."}</p>
    {error ? <p role="alert" className={styles.said} data-tone="problem">This time could not be requested. It may have just been taken. Reply to the business for new times.</p> : null}
    {offer && !offer.booked ? <form method="post" action={actionUrl} className={choosing ? styles.card : styles.section}>
      <p className={styles.cardTitle}>{offer.serviceName}</p>
      <p className={styles.deadline}>Choose by {formatVisitorTime(offer.expiresAt, offer.timeZone)}.</p>
      {offer.slots.length ? <VisitorSlotWeek slots={offer.slots} timeZone={offer.timeZone} name="start" value={slot => slot.start} legend="Open times" />
        : <p className={styles.note}>No times are open. Reply to the business to ask for new times.</p>}
      <div className={styles.actions}><button type="submit" data-xa-primary disabled={offer.slots.length === 0} className={`${styles.button} ${styles.block}`}>Request this time</button></div>
    </form> : null}
  </div></VisitorBookingShell>;
}
