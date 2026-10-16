import { bookingReceiptLabel, type InquiryReceipt } from "@/products/scheduling/contracts";
import { formatVisitorTime } from "@/platform/bookings/public-admission-time";
import { VisitorAppointment, visitorAppointmentTime } from "./VisitorAppointment";
import styles from "./visitor.module.css";

type Status = InquiryReceipt["status"];

/**
 * What a visitor sees once a time is requested (an inquiry handoff, an offer):
 * one sentence of what happens next, then the booking. The headline is the
 * state, so the time carries no second label. Expired holds say so and strike
 * the time; nothing here posts.
 */
export function VisitorBookingOutcome({ status, start, timeZone, service, businessName, confirmUntil, expired = false }: {
  status: Status; start: string; timeZone: string; service: string; businessName?: string; confirmUntil?: string | null; expired?: boolean;
}) {
  const business = businessName?.trim() || "The business";
  const when = visitorAppointmentTime(start, timeZone);
  const lede = expired ? "Reply to the business for a new time. This request was not confirmed."
    : status === "held" ? "Open the confirmation email and confirm your request. Nothing is booked until you do."
    : status === "requested" ? `${business} will reply to accept this time or suggest another. Use your booking email to check or cancel your request.`
    : status === "confirmed" ? "Use your booking email to change or cancel it."
    : "This appointment is no longer waiting for confirmation. Reply to the business for help.";
  const struck = expired || status === "cancelled" || status === "declined";
  return <div className={styles.page}>
    <h1 className={styles.title}>{expired ? "Confirmation time expired" : bookingReceiptLabel(status, businessName)}</h1>
    <p className={styles.intro}>{lede}</p>
    <VisitorAppointment day={when.day} time={when.time} zone={when.zone} service={service} struck={struck}>
      {!expired && status === "held" && confirmUntil ? <p className={styles.deadline}>Confirm by {formatVisitorTime(confirmUntil, timeZone)}.</p> : null}
    </VisitorAppointment>
  </div>;
}
