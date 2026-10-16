import type { InquiryBookingOffer as Offer } from "@/platform/bookings/inquiry-offers";
import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import type { InquiryReceipt } from "@/products/scheduling/contracts";
import { formatVisitorTime } from "@/platform/bookings/public-admission-time";
import { VisitorSlotWeek } from "./VisitorSlotWeek";
import { VisitorBookingOutcome } from "./VisitorBookingOutcome";
import { VisitorTimeForm } from "./VisitorTimeForm";
import type { VisitorBrand } from "@/products/websites/client";

/**
 * Times a business offered from an inquiry (/book-inquiry/[token]), as the
 * business's own booking page (XA · E4): what to do on the left, the offered
 * week as the one object on the right, closures said in place. One column on
 * a phone. Plain customer form: keyboard usable, never preselects a time, and
 * an empty pick is said in a sentence, never a browser bubble. Without the
 * offer there is no business to name, so the page says what happened and how
 * to get new times, nothing more.
 */
export function InquiryBookingOffer({ offer, actionUrl, error, unavailable, receipt, now, brand }: { now?: number; offer: Offer | null; actionUrl: string; error?: boolean | string; unavailable?: boolean; receipt?: InquiryReceipt | null; brand?: VisitorBrand | null }) {
  const expired = Boolean(now !== undefined && receipt?.status === "held" && receipt.confirmUntil && Date.parse(receipt.confirmUntil) <= now);
  if (offer?.booked && receipt) return <VisitorBookingShell siteName={offer.businessName} brand={brand}>
    <VisitorBookingOutcome status={receipt.status} start={receipt.start} timeZone={receipt.timeZone} service={offer.serviceName} businessName={offer.businessName} confirmUntil={receipt.confirmUntil} expired={expired} />
  </VisitorBookingShell>;
  const errorWords = error === "pick" ? "Pick a time first. Nothing was requested."
    : error ? "This time could not be requested. It may have just been taken. Pick another, or reply to the email these times came in." : null;
  if (offer && !offer.booked && offer.slots.length) {
    const business = offer.businessName?.trim();
    return <VisitorBookingShell siteName={offer.businessName} wide brand={brand}>
      <div className={styles.book}>
        <div className={styles.bookLead}>
          <h1 className={styles.title}>{business ? `Pick a time to see ${business}` : "Pick a time for your visit"}</h1>
          <p className={styles.intro}>Then check your email to confirm it. {business || "The business"} may still need to accept your request.</p>
          {brand?.photo ? <img className={styles.bookPhoto} src={brand.photo.url} alt={brand.photo.alt} /> : null}
        </div>
        <section className={`${styles.bookCard} ${styles.offerCard}`} aria-labelledby="offer-service">
          <p id="offer-service" className={styles.cardTitle}>{offer.serviceName}</p>
          <p className={styles.deadline}>Choose by {formatVisitorTime(offer.expiresAt, offer.timeZone)}.</p>
          {errorWords ? <p role="alert" className={styles.said} data-tone="problem">{errorWords}</p> : null}
          <VisitorTimeForm action={actionUrl} name="start" submitLabel="Request this time" sticky>
            <VisitorSlotWeek slots={offer.slots} timeZone={offer.timeZone} name="start" value={slot => slot.start} legend="Open times" closed={offer.closedDays} />
          </VisitorTimeForm>
        </section>
      </div>
    </VisitorBookingShell>;
  }
  const headline = !offer ? unavailable ? "These times couldn\u2019t load" : "These times have expired"
    : offer.booked ? "Booking status unavailable" : "No times are open";
  const lede = !offer ? unavailable ? "Nothing has changed. Reload in a minute, or reply to the email these times came in." : "Reply to the email these times came in, and the business will send new ones."
    : offer.booked ? "Reload to read the current status, or use your latest booking email. Do not request this time again."
    : "Reply to the email these times came in to ask for new ones.";
  return <VisitorBookingShell siteName={offer?.businessName} brand={brand}><div className={styles.page}>
    <h1 className={styles.title}>{headline}</h1>
    <p className={styles.intro} role={unavailable ? "alert" : undefined}>{lede}</p>
    {errorWords ? <p role="alert" className={styles.said} data-tone="problem">{errorWords}</p> : null}
  </div></VisitorBookingShell>;
}
