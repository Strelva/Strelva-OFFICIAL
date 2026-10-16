import { formatVisitorTime } from "@/platform/bookings/public-admission-time";
import { VisitorBookingShell } from "./VisitorBookingShell";
import { VisitorAppointment, visitorAppointmentTime } from "./VisitorAppointment";
import { visitorBookingTone } from "./VisitorBookingOutcome";
import styles from "./visitor.module.css";

/** What /booking-confirm/[token] reads: `readVisitorConfirmation`'s shape. */
export interface VisitorConfirmationView {
  businessName: string;
  start: string;
  end?: string;
  state: "held" | "confirming" | "placed" | "cancelled";
  bookingStatus: "held" | "requested" | "confirmed" | "declined" | "cancelled" | "completed" | null;
  timeZone: string;
  expiresAt?: string;
}

/**
 * The visitor confirms a booking request from their email link (XA visitor
 * language). Opening the page is read-only, including for mail scanners; only
 * the one ink button posts. Every outcome keeps the time as the page's object.
 */
export function BookingConfirmation({ identity, error, actionUrl, statusUrl, service }: {
  identity: VisitorConfirmationView | null;
  /** The redirect's error code, when the post did not complete. */
  error?: string | null;
  actionUrl: string;
  statusUrl: string;
  service?: string;
}) {
  const done = identity?.state === "placed";
  const confirmed = done && identity.bookingStatus === "confirmed";
  const cancelled = (done && (identity.bookingStatus === "cancelled" || identity.bookingStatus === "declined")) || identity?.state === "cancelled";
  const failed = Boolean(error) || !identity;
  const business = identity?.businessName || "the business";
  const headline = failed ? "This confirmation could not complete"
    : cancelled ? "Your booking is no longer active"
    : confirmed ? "You’re booked"
    : done ? `Waiting on ${business}`
    : identity.state === "confirming" ? "Outcome not confirmed"
    : "Confirm your booking request";
  const lede = failed
    ? error === "rate" ? "Too many tries. Wait a minute and try again." : "The link may have expired or the time may have been taken. Contact the business before requesting again."
    : cancelled ? "This booking was cancelled or declined. Contact the business about another time."
    : confirmed ? "Your time is booked. Use your booking email to change or cancel it."
    : done ? `Your email is confirmed. ${business} will reply to accept this time or suggest another. Use your booking email to check, change or cancel your request.`
    : identity.state === "confirming" ? "Your email was received, but the booking outcome is not confirmed. Read its current status, or contact the business."
    : `Nothing is booked until you confirm your email. ${business} may then need to accept your request.`;
  const when = identity ? visitorAppointmentTime(identity.start, identity.timeZone) : null;
  const tone = !identity ? undefined
    : cancelled ? { tone: "ended" as const, label: "No longer active" }
    : done && identity.bookingStatus ? visitorBookingTone(identity.bookingStatus, identity.businessName)
    : identity.state === "confirming" ? { tone: "waits" as const, label: "Outcome not confirmed" }
    : failed ? undefined
    : { tone: "waits" as const, label: "Waiting for you to confirm" };
  const canConfirm = !done && !failed && identity?.state === "held";

  return <VisitorBookingShell siteName={identity?.businessName}>
    <div className={styles.page}>
      <h1 className={styles.title}>{headline}</h1>
      <p role={failed ? "alert" : undefined} className={styles.intro}>{lede}</p>
      {identity && when ? <VisitorAppointment day={when.day} time={when.time} zone={when.zone} service={service ?? `With ${identity.businessName}`} status={tone} struck={cancelled}>
        {!done && identity.expiresAt ? <p className={styles.deadline}>Confirm by {formatVisitorTime(identity.expiresAt, identity.timeZone)}.</p> : null}
      </VisitorAppointment> : null}
      {canConfirm ? <form method="post" action={actionUrl} className={styles.actions}>
        <button type="submit" data-xa-primary className={`${styles.button} ${styles.block}`}>Confirm my email and request this time</button>
      </form> : null}
      {identity?.state === "confirming" || failed ? <div className={styles.actions}><a className={`${styles.button} ${styles.secondary}`} href={statusUrl}>Read current status</a></div> : null}
    </div>
  </VisitorBookingShell>;
}
