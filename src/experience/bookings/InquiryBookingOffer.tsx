import type { InquiryBookingOffer as Offer } from "@/platform/bookings/inquiry-offers";
import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import type { InquiryReceipt } from "@/products/scheduling/contracts";
import { formatVisitorTime } from "@/platform/bookings/public-admission-time";
import { VisitorSlotWeek } from "./VisitorSlotWeek";
import { VisitorBookingOutcome } from "./VisitorBookingOutcome";

/**
 * Times a business offered from an inquiry (/book-inquiry/[token]). One
 * reading column at every width: the week of times is the page's object, with
 * closures said in place. Plain customer form: keyboard usable, never
 * preselects a commitment. Without the offer there is no business to name, so
 * the page says what happened and how to get new times, nothing more.
 */
export function InquiryBookingOffer({ offer, actionUrl, error, unavailable, receipt, now }: { now?: number; offer: Offer | null; actionUrl: string; error?: boolean; unavailable?: boolean; receipt?: InquiryReceipt | null }) {
  const expired = Boolean(now !== undefined && receipt?.status === "held" && receipt.confirmUntil && Date.parse(receipt.confirmUntil) <= now);
  if (offer?.booked && receipt) return <VisitorBookingShell siteName={offer.businessName}>
    <VisitorBookingOutcome status={receipt.status} start={receipt.start} timeZone={receipt.timeZone} service={offer.serviceName} businessName={offer.businessName} confirmUntil={receipt.confirmUntil} expired={expired} />
  </VisitorBookingShell>;
  const headline = !offer ? unavailable ? "These times couldn’t load" : "These times have expired"
    : offer.booked ? "Booking status unavailable" : "Choose a time to request";
  const lede = !offer ? unavailable ? "Nothing has changed. Reload in a minute, or reply to the email these times came in." : "Reply to the email these times came in, and the business will send new ones."
    : offer.booked ? "Reload to read the current status, or use your latest booking email. Do not request this time again."
    : "Pick a time, then check your email to confirm. The business may then need to accept your request.";
  return <VisitorBookingShell siteName={offer?.businessName}><div className={styles.page}>
    <h1 className={styles.title}>{headline}</h1>
    <p className={styles.intro} role={unavailable ? "alert" : undefined}>{lede}</p>
    {error ? <p role="alert" className={styles.said} data-tone="problem">This time could not be requested. It may have just been taken. Pick another, or reply to the email these times came in.</p> : null}
    {offer && !offer.booked ? <form method="post" action={actionUrl} className={`${styles.card} ${styles.offerCard}`}>
      <p className={styles.cardTitle}>{offer.serviceName}</p>
      <p className={styles.deadline}>Choose by {formatVisitorTime(offer.expiresAt, offer.timeZone)}.</p>
      {offer.slots.length ? <VisitorSlotWeek slots={offer.slots} timeZone={offer.timeZone} name="start" value={slot => slot.start} legend="Open times" closed={offer.closedDays} />
        : <p className={styles.note}>No times are open. Reply to the email these times came in to ask for new ones.</p>}
      {offer.slots.length ? <div className={styles.actions}><button type="submit" data-xa-primary className={`${styles.button} ${styles.block}`}>Request this time</button></div> : null}
    </form> : null}
  </div></VisitorBookingShell>;
}
