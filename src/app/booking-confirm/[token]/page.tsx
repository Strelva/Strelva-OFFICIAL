import { readPublicBookingIdentity } from "@/platform/bookings/public-identity";
import type { Metadata } from "next";
import { VisitorBookingShell } from "@/experience/bookings/VisitorBookingShell";
import styles from "@/experience/bookings/visitor.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your booking request", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Opening an email link is read-only, including automated mail scanners. */
export default async function BookingConfirmationPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const identity = await readPublicBookingIdentity(token).catch(() => null);
  const done = identity?.state === "placed";
  const confirmed = done && identity.bookingStatus === "confirmed";
  const cancelled = done && (identity.bookingStatus === "cancelled" || identity.bookingStatus === "declined");
  const error = typeof query.error === "string" || !identity;
  return <VisitorBookingShell siteName={identity?.businessName}>
    <div className={styles.surface}>
      <h1 className={styles.title}>{done ? cancelled ? "Your booking is no longer active" : confirmed ? "Your booking is confirmed" : "Your email is confirmed" : "Confirm your booking request"}</h1>
      <div className={styles.section}>
        <p role={error ? "alert" : undefined} className={styles.intro}>{error
          ? query.error === "rate" ? "Too many tries. Wait a minute and try again." : "This confirmation could not complete. The link may have expired or the time may have been taken. Contact the business before requesting again."
          : done ? cancelled ? "This booking was cancelled or declined. Contact the business about another time." : confirmed ? "Your time is booked. Use your booking email to change or cancel it." : "Your email is confirmed. Check your booking email for the current request status."
          : "Confirm within 15 minutes. Nothing is booked until you confirm your email. The business may still need to accept your request."}</p>
        {identity ? <p className={styles.note}>Requested time: {new Date(identity.start).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p> : null}
        {!done && !error ? <form method="post" action={`/booking-confirm/${encodeURIComponent(token)}/action`} className="mt-6">
          <button type="submit" className={styles.button}>Confirm my email and request this time</button>
        </form> : null}
      </div>
    </div>
  </VisitorBookingShell>;
}
