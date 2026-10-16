import { VisitorBookingShell } from "./VisitorBookingShell";
import { VisitorAppointment } from "./VisitorAppointment";
import styles from "./visitor.module.css";
import type { ManageBookingState, ManagedBookingView } from "@/platform/bookings/manage";

export type { ManageBookingState, ManagedBookingView };

/**
 * The customer's manage link (/b/[token], bookings spec "Manage link"), in the
 * XA visitor language: the business's name, one sentence of state, then the
 * booking as the one object on the page. Change the time sits under it with
 * one primary; Cancel opens in place, never in a modal.
 *
 * No sign-in: the link's token is the authorization, and GET never changes
 * anything (mail scanners open links). Server-rendered; every action is a
 * plain form post with the same fields as before.
 */

function business(booking: ManagedBookingView): string {
  return booking.siteName || "the business";
}

/** The headline says the booking's state, so the time carries no second label: struck when it no longer holds. */
function Appointment({ booking }: { booking: ManagedBookingView }) {
  return <VisitorAppointment day={booking.day} time={booking.time} zone={booking.timeZoneLabel} service={booking.title} struck={booking.status === "cancelled"}>
    {booking.agentSource ? <p>Booked through <strong>{booking.agentSource}</strong></p> : null}
  </VisitorAppointment>;
}

const SAID: Record<NonNullable<Extract<ManageBookingState, { kind: "ready" }>["notice"]>, (b: ManagedBookingView) => string> = {
  confirmed: () => "Thanks for confirming. Change or cancel it here any time before your visit.",
  rescheduled: () => "Your new time is booked. A confirmation is on its way when email is on for this business.",
  pending: b => `Sent. You'll get an email when ${business(b)} accepts this time or suggests another.`,
  cancelled: b => `Done. The time is open for someone else, and ${business(b)} has been told.`,
};

export function ManageBooking({ state, actionUrl }: { state: ManageBookingState; actionUrl: string }) {
  if (state.kind === "not_found") {
    return <VisitorBookingShell>
      <div className={styles.page}>
        <h1 className={styles.title}>This link doesn&apos;t open a booking</h1>
        <p className={styles.intro}>It may have been copied incompletely. Use the link in your most recent booking email, or reply to that email to reach the business.</p>
      </div>
    </VisitorBookingShell>;
  }
  if (state.kind === "error") {
    return <VisitorBookingShell>
      <div className={styles.page}>
        <h1 className={styles.title}>Your booking couldn&apos;t load</h1>
        <p role="alert" className={styles.intro}>Nothing has changed, and your booking is kept. Reload this page in a minute, or reply to your booking email to reach the business.</p>
      </div>
    </VisitorBookingShell>;
  }
  const { booking } = state;
  if (state.kind === "ended") {
    return <VisitorBookingShell siteName={booking.siteName}>
      <div className={styles.page}>
        <h1 className={styles.title}>This booking link has expired</h1>
        <p className={styles.intro}>The appointment has ended or the confirmation window has closed, so this link can&apos;t change it. To book again, visit {business(booking)}&apos;s website.</p>
        <Appointment booking={booking} />
      </div>
    </VisitorBookingShell>;
  }

  const cancelled = booking.status === "cancelled";
  const errorBesideTimes = Boolean(state.error) && !cancelled && booking.status !== "held";
  const headline = cancelled ? "This booking is cancelled"
    : booking.status === "confirmed" ? "You’re booked"
    : booking.status === "held" ? "Check your email to confirm"
    : `Waiting on ${business(booking)}`;
  const lede = cancelled ? `The time is open for someone else. To book again, visit ${business(booking)}'s website.`
    : booking.status === "confirmed" ? "Need a different time? Pick one below, or cancel. The business is told either way."
    : booking.status === "held" ? "Nothing is booked until you confirm. This time is held for 15 minutes after your request."
    : "Your request is in. The business will accept this time or suggest another, and you will get an email either way.";

  return <VisitorBookingShell siteName={booking.siteName}>
    <div className={styles.page}>
      <h1 className={styles.title}>{headline}</h1>
      {/* After an action, what just happened replaces the standing sentence, so the two never say the same thing.
          A failed change says so beside the times it refers to, so the standing sentence steps aside then too. */}
      {state.notice || !errorBesideTimes ? <p className={styles.intro} role={state.notice ? "status" : undefined}>{state.notice ? SAID[state.notice](booking) : lede}</p> : null}
      {state.error && !errorBesideTimes ? <p role="alert" className={styles.said} data-tone="problem">{state.error}</p> : null}

      <Appointment booking={booking} />

      {booking.status === "held" ? (
        booking.confirmationRequired ? <form action={actionUrl} method="post" className={styles.actions}>
          <input type="hidden" name="action" value="confirm" />
          <button type="submit" data-xa-primary className={`${styles.button} ${styles.block}`}>Confirm my request</button>
          <p className={styles.note}>Confirm only if you asked for this time; otherwise let the hold run out.</p>
        </form> : <p className={styles.note}>Open the confirmation email we sent and confirm from there.</p>
      ) : cancelled ? null : <>
        <section aria-labelledby="change-time">
          <h2 id="change-time" className={styles.changeTitle}>Change the time</h2>
          {errorBesideTimes ? <p role="alert" className={styles.said} data-tone="problem">{state.error}</p> : null}
          {state.changesClosed ? (
            <p className={styles.note}>{business(booking)} isn&apos;t taking new times right now. You can still cancel, or reply to your booking email.</p>
          ) : state.slotsUnavailable ? (
            <p className={styles.note}>Open times couldn&apos;t be read right now. Your booking is unchanged. Reload to try again.</p>
          ) : state.days.length === 0 ? (
            <p className={styles.note}>No other times are open in the next two weeks. Reply to your booking email to ask about another time.</p>
          ) : (
            <form action={actionUrl} method="post">
              <input type="hidden" name="action" value="reschedule" />
              <p className={styles.note}>Open times in the next two weeks, in {booking.timeZoneLabel}.</p>
              <fieldset className={`${styles.fieldset} ${styles.dayRows}`}>
                <legend className={styles.srOnly}>Pick a new time</legend>
                {state.days.map(day => <div key={day.day} className={styles.dayRow}>
                  <p className={styles.dayName}>{day.day}</p>
                  <div className={styles.times}>
                    {day.slots.map(slot => <label key={slot.id} className={styles.time}>
                      <input type="radio" name="slotId" value={slot.id} required aria-label={`${day.day}, ${slot.time} ${booking.timeZoneLabel}`} />
                      <span aria-hidden="true">{slot.time}</span>
                    </label>)}
                  </div>
                </div>)}
              </fieldset>
              <div className={styles.actions}><button type="submit" data-xa-primary className={`${styles.button} ${styles.block}`}>Move my booking</button></div>
            </form>
          )}
        </section>

        <details className={styles.cancel}>
          <summary>Cancel this booking</summary>
          <div className={styles.cancelBody}>
            <p className={styles.note}>{business(booking)} is told and the time opens up for someone else. This can&apos;t be undone from here.</p>
            <form action={actionUrl} method="post" className={styles.actions}>
              <input type="hidden" name="action" value="cancel" />
              <button type="submit" className={`${styles.button} ${styles.danger}`}>Yes, cancel it</button>
            </form>
          </div>
        </details>
      </>}
    </div>
  </VisitorBookingShell>;
}
