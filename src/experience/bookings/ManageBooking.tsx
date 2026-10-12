import { VisitorBookingShell } from "./VisitorBookingShell";
import styles from "./visitor.module.css";
import type { ManageBookingState, ManagedBookingView } from "@/platform/bookings/manage";

export type { ManageBookingState, ManagedBookingView };

/**
 * The customer's manage link (/b/[token], bookings spec "Manage link"): the
 * booking, Change time (same service, an open time, the same mode rules) and
 * Cancel. No sign-in: the link's token is the authorization, and GET never
 * changes anything (mail scanners open links). Server-rendered; both actions
 * are plain form posts.
 */

const STATUS: Record<ManagedBookingView["status"], string> = {
  held: "Check your email to confirm",
  confirmed: "Confirmed",
  pending: "Waiting on the business",
  cancelled: "Cancelled",
};

function Summary({ booking }: { booking: ManagedBookingView }) {
  const cancelled = booking.status === "cancelled";
  return (
    <div className={styles.section}>
      <dl className={styles.summary}>
        <dt >What</dt>
        <dd className={cancelled ? "line-through" : "font-medium"}>{booking.title}</dd>
        <dt >When</dt>
        <dd className={cancelled ? "line-through" : "font-medium"}>
          {booking.day}, {booking.time}
          <span className={styles.muted}>{booking.timeZoneLabel}</span>
        </dd>
        <dt >Status</dt>
        <dd>{booking.status === "pending" ? `Waiting on ${booking.siteName || "the business"}` : STATUS[booking.status]}</dd>
        {booking.agentSource ? <><dt >Source</dt><dd className="break-words">{booking.agentSource}</dd></> : null}
      </dl>
    </div>
  );
}

const buttonBase = styles.button;

export function ManageBooking({ state, actionUrl }: { state: ManageBookingState; actionUrl: string }) {
  if (state.kind === "not_found") {
    return (
      <VisitorBookingShell>
        <h1 className={styles.title}>This link doesn&apos;t open a booking</h1>
        <p className={styles.intro}>
          It may have been copied incompletely. Use the link in your most recent booking email, or reply to that email to reach the business.
        </p>
      </VisitorBookingShell>
    );
  }
  if (state.kind === "error") {
    return (
      <VisitorBookingShell>
        <h1 className={styles.title}>Your booking couldn&apos;t load</h1>
        <p role="alert" className={styles.intro}>
          Nothing has changed, and your booking is kept. Reload this page in a minute, or reply to your booking email to reach the business.
        </p>
      </VisitorBookingShell>
    );
  }
  const { booking } = state;
  if (state.kind === "ended") {
    return (
      <VisitorBookingShell siteName={booking.siteName}>
        <h1 className={styles.title}>This booking link has expired</h1>
        <p className={styles.intro}>The appointment has ended or the confirmation window has closed. To book again, visit the business&apos;s website.</p>
        <Summary booking={booking} />
      </VisitorBookingShell>
    );
  }
  const cancelled = booking.status === "cancelled";
  return (
    <VisitorBookingShell siteName={booking.siteName}>
      <h1 className={styles.title}>{cancelled ? "Your booking is cancelled" : booking.status === "confirmed" ? "Confirmed" : booking.status === "held" ? "Check your email to confirm" : `Waiting on ${booking.siteName || "the business"}`}</h1>

      {state.notice === "confirmed" ? (
        <p role="status" className={styles.notice}>Your booking is confirmed.</p>
      ) : state.notice === "rescheduled" ? (
        <p role="status" className={styles.notice}>Your new time is booked. A confirmation is on its way when email is on for this business.</p>
      ) : state.notice === "pending" ? (
        <p role="status" className={styles.notice}>Your request is waiting on {booking.siteName || "the business"}. This time is not confirmed yet.</p>
      ) : state.notice === "cancelled" ? (
        <p role="status" className={styles.notice}>Cancelled. The time is open for someone else.</p>
      ) : null}
      {state.error ? <p role="alert" className={`${styles.notice} ${styles.error}`}>{state.error}</p> : null}

      <Summary booking={booking} />

      {booking.status === "held" ? (
        <section className="mt-10" aria-labelledby="confirm-booking">
          <h2 id="confirm-booking" className={styles.label}>Confirm this request</h2>
          <p className={styles.note}>This time is held for 15 minutes after the request. Confirm only if you asked for it; otherwise let the hold expire.</p>
          {booking.confirmationRequired ? <form method="post" action={actionUrl} className="mt-4">
            <input type="hidden" name="action" value="confirm" />
            <button type="submit" className={buttonBase}>Confirm my request</button>
          </form> : null}
        </section>
      ) : cancelled ? null : (
        <>
          <section className="mt-10" aria-labelledby="change-time">
            <h2 id="change-time" className={styles.label}>Change the time</h2>
            {state.changesClosed ? (
              <p className={styles.note}>The business isn&apos;t taking new times right now. You can still cancel, or reply to your booking email.</p>
            ) : state.slotsUnavailable ? (
              <p className={styles.note}>Open times couldn&apos;t be read right now. Your booking is unchanged. Reload to try again.</p>
            ) : state.days.length === 0 ? (
              <p className={styles.note}>No other times are open in the next two weeks. Reply to your booking email to ask about another time.</p>
            ) : (
              <form method="post" action={actionUrl} className="mt-3">
                <input type="hidden" name="action" value="reschedule" />
                <fieldset>
                  <legend className="sr-only">Pick a new time</legend>
                  {state.days.map((day) => (
                    <div key={day.day} className="mt-4 first:mt-0">
                      <p className="text-sm font-medium">{day.day}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {day.slots.map((slot) => (
                          <label key={slot.id} className={styles.choice}>
                            <input type="radio" name="slotId" value={slot.id} required className="peer sr-only" />
                            <span>
                              {slot.time} {booking.timeZoneLabel}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </fieldset>
                <button type="submit" className={`${buttonBase} mt-6`}>Move my booking</button>
              </form>
            )}
          </section>

          <section className={styles.section} aria-labelledby="cancel-booking">
            <h2 id="cancel-booking" className="sr-only">Cancel</h2>
            <p className={styles.note}>The business is told and the time opens up for someone else. This can&apos;t be undone from here.</p>
            <form method="post" action={actionUrl} className="mt-4">
              <input type="hidden" name="action" value="cancel" />
              <button type="submit" className={`${buttonBase} ${styles.secondary} ${styles.block}`}>Cancel this booking</button>
            </form>
          </section>
        </>
      )}
    </VisitorBookingShell>
  );
}
