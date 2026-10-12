import { Clock3 } from "lucide-react";
import type { InquiryBookingOffer as Offer } from "@/platform/bookings/inquiry-offers";
import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import { bookingReceiptLabel, type InquiryReceipt } from "@/products/scheduling/public-visitor-contracts";
import { formatVisitorTime } from "@/platform/bookings/public-admission-time";
/** Plain customer form: keyboard usable, never preselects a commitment. */
export function InquiryBookingOffer({ offer, actionUrl, error, unavailable, receipt, now }: { now?: number; offer: Offer | null; actionUrl: string; error?: boolean; unavailable?: boolean; receipt?: InquiryReceipt | null }) {
  const expired = now !== undefined && receipt?.status === "held" && receipt.confirmUntil && Date.parse(receipt.confirmUntil) <= now;
  const format = offer ? new Intl.DateTimeFormat("en-US", { timeZone: offer.timeZone, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return <VisitorBookingShell siteName={offer?.businessName}><div className={`${styles.surface} ${offer?.booked ? styles.receipt : ""}`}>
    {offer?.booked ? <div className={styles.clock}><Clock3 size={22} aria-hidden="true" /></div> : null}
    <h1 className={styles.title}>{!offer ? unavailable ? "These times couldn’t load" : "This suggestion has expired" : offer.booked ? expired ? "Confirmation time expired" : receipt ? bookingReceiptLabel(receipt.status, offer.businessName) : "Booking status unavailable" : "Choose a time to request"}</h1>
    <p className={styles.intro} role={unavailable ? "alert" : undefined}>{!offer ? unavailable ? "Nothing has changed. Reload in a minute, or reply to the business for help." : "Reply to the business to ask for new times." : offer.booked ? expired ? "Reply to the business for a new time. This request was not confirmed." : receipt?.status === "held" ? "Open the confirmation email and confirm your request. Nothing is booked until you do." : receipt?.status === "requested" ? `${offer.businessName || "The business"} will reply to accept this time or suggest another. Use your booking email to check or cancel your request.` : receipt?.status === "confirmed" ? "Your time is booked. Use your booking email to change or cancel it." : receipt ? "This appointment is no longer waiting for confirmation. Reply to the business for help." : "Reload to read the current status, or use your latest booking email. Do not request this time again." : "Pick a time below, then check your email to confirm. The business may then need to accept your request."}</p>
    {receipt ? <p className={styles.note}>Requested time: {formatVisitorTime(receipt.start, receipt.timeZone)}</p> : null}
    {receipt?.status === "held" && receipt.confirmUntil ? <p className={styles.note}>Confirm by {formatVisitorTime(receipt.confirmUntil, receipt.timeZone)}.</p> : null}
    {error ? <p role="alert" className={`${styles.notice} ${styles.error}`}>This time could not be requested. It may have just been taken. Reply to the business for new times.</p> : null}
    {offer && !offer.booked ? <form method="post" action={actionUrl} className={styles.section}>
      <fieldset className={styles.fieldset}><legend className={styles.label}>{offer.serviceName}</legend><p className={styles.note}>Times in {offer.timeZone}. Choose by {formatVisitorTime(offer.expiresAt, offer.timeZone)}.</p>
        <div className={`${styles.choices} mt-4`}>{offer.slots.map(slot => <label key={slot.start} className={styles.choice}><input type="radio" name="start" value={slot.start} required /><span>{format!.format(new Date(slot.start))}</span></label>)}</div>
        {offer.slots.length === 0 ? <p className={styles.note}>No times are open. Reply to the business to ask for new times.</p> : null}
      </fieldset>
      <div className={styles.actions}><button type="submit" disabled={offer.slots.length === 0} className={styles.button}>Request this time</button></div>
    </form> : null}
  </div></VisitorBookingShell>;
}
