import type { InquiryBookingOffer as Offer } from "@/platform/bookings/inquiry-offers";
import { VisitorBookingShell, VisitorCall } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import type { InquiryReceipt } from "@/products/scheduling/contracts";
import { visitorDeadlineWords } from "@/platform/bookings/public-admission-time";
import { VisitorSlotWeek } from "./VisitorSlotWeek";
import { VisitorBookingOutcome } from "./VisitorBookingOutcome";
import { VisitorTimeForm } from "./VisitorTimeForm";
import type { VisitorBrand } from "@/products/websites/client";

/**
 * Times a business offered from an inquiry (/book-inquiry/[token]), as the
 * business's own booking page (XA · E4): what to do on the left, the offered
 * week as the one object on the right, closures said in place. One column on
 * a phone. Plain customer form: keyboard usable, and an empty pick is said in
 * a sentence, never a browser bubble. A time is picked ahead only when the
 * visitor tapped that time in their email (`pick`).
 *
 * Bad news still names the business and gives one way to reach it: the
 * business's phone when it is known, otherwise a reply to the email. When the
 * link no longer resolves to a business (`offer` is null and no `business` was
 * read), the page says what happened without inventing a name.
 */
export function InquiryBookingOffer({ offer, actionUrl, error, unavailable, receipt, now, brand, phone, business: known, pick }: {
  now?: number; offer: Offer | null; actionUrl: string; error?: boolean | string; unavailable?: boolean; receipt?: InquiryReceipt | null;
  /** The business's own look, from its website or recorded branding. */
  brand?: VisitorBrand | null;
  /** The business's phone, for the header and the way forward. */
  phone?: string | null;
  /** Who the link belongs to when the offer itself no longer reads (expired). */
  business?: string | null;
  /** The time the visitor tapped in their email, as its ISO start. */
  pick?: string | null;
}) {
  const name = offer?.businessName?.trim() || known?.trim() || "";
  const call = phone ? <VisitorCall name={name} phone={phone} /> : null;
  const expired = Boolean(now !== undefined && receipt?.status === "held" && receipt.confirmUntil && Date.parse(receipt.confirmUntil) <= now);
  if (offer?.booked && receipt) return <VisitorBookingShell siteName={name} brand={brand} phone={phone}>
    <VisitorBookingOutcome status={receipt.status} start={receipt.start} timeZone={receipt.timeZone} service={offer.serviceName} businessName={name} confirmUntil={receipt.confirmUntil} expired={expired} now={now} phone={phone} />
  </VisitorBookingShell>;
  const errorWords = error === "pick" ? "Pick a time first. Nothing was requested."
    : error ? "This time could not be requested. It may have just been taken. Pick another, or reply to the email these times came in." : null;
  if (offer && !offer.booked && offer.slots.length) {
    const picked = pick && offer.slots.some(slot => Date.parse(slot.start) === Date.parse(pick)) ? offer.slots.find(slot => Date.parse(slot.start) === Date.parse(pick))!.start : null;
    return <VisitorBookingShell siteName={name} wide brand={brand} phone={phone}>
      <div className={styles.book}>
        <div className={styles.bookLead}>
          <h1 className={styles.title}>{name ? `Pick a time to see ${name}` : "Pick a time for your visit"}</h1>
          <p className={styles.intro}>Then check your email to confirm it. {name || "The business"} may still need to accept your request.</p>
          {brand?.photo ? <img className={styles.bookPhoto} src={brand.photo.url} alt={brand.photo.alt} /> : null}
        </div>
        <section className={`${styles.bookCard} ${styles.offerCard}`} aria-labelledby="offer-service">
          <p id="offer-service" className={styles.cardTitle}>{offer.serviceName}</p>
          <p className={styles.deadline}>Choose by {visitorDeadlineWords(offer.expiresAt, offer.timeZone, now)}.</p>
          {errorWords ? <p role="alert" className={styles.said} data-tone="problem">{errorWords}</p> : null}
          <VisitorTimeForm action={actionUrl} name="start" submitLabel="Request this time" sticky>
            <VisitorSlotWeek slots={offer.slots} timeZone={offer.timeZone} name="start" value={slot => slot.start} legend="Open times" closed={offer.closedDays} picked={picked} />
          </VisitorTimeForm>
        </section>
      </div>
    </VisitorBookingShell>;
  }
  const headline = !offer ? unavailable ? "These times couldn’t load" : "These times have expired"
    : offer.booked ? "Booking status unavailable" : "No times are open";
  const reach = call ? <> {call} for new times, or reply to the email they came in.</>
    : <> Reply to the email these times came in{name ? ` and ${name} will send new ones` : ""}.</>;
  const lede = !offer ? unavailable ? <>Nothing has changed. Reload in a minute.{call ? <> Or {call}.</> : " Or reply to the email these times came in."}</>
    : <>Nothing was booked.{reach}</>
    : offer.booked ? <>Reload to see where it stands, or use your latest booking email. Do not request this time again.{call ? <> Or {call}.</> : null}</>
    : <>{name || "The business"} has nothing open in these days.{reach}</>;
  return <VisitorBookingShell siteName={name} brand={brand} phone={phone}><div className={styles.page}>
    <h1 className={styles.title}>{headline}</h1>
    <p className={styles.intro} role={unavailable ? "alert" : undefined}>{lede}</p>
    {errorWords ? <p role="alert" className={styles.said} data-tone="problem">{errorWords}</p> : null}
  </div></VisitorBookingShell>;
}
