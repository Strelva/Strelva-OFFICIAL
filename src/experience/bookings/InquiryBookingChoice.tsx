import { Clock3 } from "lucide-react";
import type { InquiryBookingChoice as Choice } from "@/products/inquiries";
import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
/** Signed inquiry handoff. Read-only until the customer explicitly posts one time. */
export function InquiryBookingChoice({ choice, actionUrl, unavailable, error, businessName }: { businessName?: string; choice: Choice | null; actionUrl: string; unavailable?: boolean; error?: string }) {
  const booking = choice?.booking;
  return <VisitorBookingShell siteName={businessName}>
    <div className={`${styles.surface} ${booking ? styles.receipt : ""}`}>
      {booking?.status === "requested" ? <div className={styles.clock}><Clock3 size={22} aria-hidden="true" /></div> : null}
      <h1 className={styles.title}>{booking?.status === "confirmed" ? "Your appointment is confirmed" : booking?.status === "requested" ? "Requested, not booked yet" : booking ? "Your appointment" : "Choose an appointment time"}</h1>
      {!choice ? <p role={unavailable ? "alert" : undefined} className={styles.intro}>{unavailable ? "These times couldn't load. Reload in a minute, or reply to the business for help." : "This link expired or these times are no longer available. Reply to the business for fresh times."}</p> : <>
        <p className={styles.intro}>{booking ? booking.status === "requested" ? "The business will reply to confirm this date or suggest another." : booking.status === "confirmed" ? "The business confirmed your appointment." : "This appointment is no longer waiting for confirmation." : "Pick a time to request an appointment. The business must confirm it."}</p>
        {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error === "rate" ? "Wait a minute before trying again." : "That time couldn't be requested. Reload for current times, or reply to the business. Nothing was confirmed."}</p>}
        <div className={styles.section}>
          {booking ? <dl className={styles.summary}><dt>What</dt><dd>{choice.offer.serviceName}</dd><dt>When</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: booking.timeZone }).format(new Date(booking.start))}<span className={styles.muted}>{booking.timeZone}</span></dd><dt>Status</dt><dd>{booking.status === "requested" ? "Waiting for the business to confirm" : booking.status}</dd></dl>
            : <><h2 className={styles.label}>{choice.offer.serviceName}</h2>{choice.offer.slots.length === 0 ? <p className={styles.note}>No times are open. Reply to the business for fresh times.</p> : choice.offer.slots.map((slot, index) => <form key={slot.start} method="post" action={actionUrl} className={styles.row}><p className="text-sm">{slot.label}</p><input type="hidden" name="slot" value={index} /><button type="submit" className={`${styles.button} ${styles.secondary}`}>Request this time</button></form>)}</>}
        </div>
      </>}
    </div>
  </VisitorBookingShell>;
}
