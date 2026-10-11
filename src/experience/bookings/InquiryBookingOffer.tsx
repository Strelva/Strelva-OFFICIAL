import { Clock3 } from "lucide-react";
import type { InquiryBookingOffer as Offer } from "@/platform/bookings/inquiry-offers";
import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
/** Plain customer form: keyboard usable, never preselects a commitment. */
export function InquiryBookingOffer({ offer, actionUrl, error, unavailable }: { offer: Offer | null; actionUrl: string; error?: boolean; unavailable?: boolean }) {
  const format = offer ? new Intl.DateTimeFormat("en-US", { timeZone: offer.timeZone, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return <VisitorBookingShell siteName={offer?.businessName}><div className={`${styles.surface} ${offer?.booked ? styles.receipt : ""}`}>
    {offer?.booked ? <div className={styles.clock}><Clock3 size={22} aria-hidden="true" /></div> : null}
    <h1 className={styles.title}>{!offer ? unavailable ? "These times couldn’t load" : "This suggestion has expired" : offer.booked ? "Requested, not booked yet" : "Choose a time to request"}</h1>
    <p className={styles.intro} role={unavailable ? "alert" : undefined}>{!offer ? unavailable ? "Nothing has changed. Reload in a minute, or reply to the business for help." : "Reply to the business to ask for new times." : offer.booked ? "The business will confirm your requested time. It is not confirmed yet." : "Pick a time below. The business will confirm your request."}</p>
    {error ? <p role="alert" className={`${styles.notice} ${styles.error}`}>This time could not be requested. It may have just been taken. Reply to the business for new times.</p> : null}
    {offer && !offer.booked ? <form method="post" action={actionUrl} className={styles.section}>
      <fieldset className={styles.fieldset}><legend className={styles.label}>{offer.serviceName}</legend><p className={styles.note}>Times in {offer.timeZone}</p>
        <div className={`${styles.choices} mt-4`}>{offer.slots.map(slot => <label key={slot.start} className={styles.choice}><input type="radio" name="start" value={slot.start} required /><span>{format!.format(new Date(slot.start))}</span></label>)}</div>
        {offer.slots.length === 0 ? <p className={styles.note}>No times are open. Reply to the business to ask for new times.</p> : null}
      </fieldset>
      <div className={styles.actions}><button type="submit" disabled={offer.slots.length === 0} className={styles.button}>Request this time</button></div>
    </form> : null}
  </div></VisitorBookingShell>;
}
