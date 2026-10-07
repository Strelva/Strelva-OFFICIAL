import { Card } from "@/components/ui/Card";
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
  held: "Waiting for your confirmation",
  confirmed: "Confirmed",
  pending: "Waiting for the business to confirm",
  cancelled: "Cancelled",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-10 text-warm-black sm:px-6 md:py-16">
      <div className="mx-auto max-w-[560px]">{children}</div>
    </main>
  );
}

function Summary({ booking }: { booking: ManagedBookingView }) {
  const cancelled = booking.status === "cancelled";
  return (
    <Card padding="lg" className="mt-8">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-gray-muted">What</dt>
        <dd className={cancelled ? "text-gray-muted line-through" : "font-medium"}>{booking.title}</dd>
        <dt className="text-gray-muted">When</dt>
        <dd className={cancelled ? "text-gray-muted line-through" : "font-medium"}>
          {booking.day}, {booking.time}
          <span className="block text-xs font-normal text-gray-muted">{booking.timeZoneLabel}</span>
        </dd>
        <dt className="text-gray-muted">Status</dt>
        <dd>{STATUS[booking.status]}</dd>
      </dl>
    </Card>
  );
}

const buttonBase = "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function ManageBooking({ state, actionUrl }: { state: ManageBookingState; actionUrl: string }) {
  if (state.kind === "not_found") {
    return (
      <Shell>
        <h1 className="font-display text-[32px] font-medium leading-tight">This link doesn&apos;t open a booking</h1>
        <p className="mt-3 text-base leading-7 text-gray-muted">
          It may have been copied incompletely. Use the link in your most recent booking email, or reply to that email to reach the business.
        </p>
      </Shell>
    );
  }
  if (state.kind === "error") {
    return (
      <Shell>
        <h1 className="font-display text-[32px] font-medium leading-tight">Your booking couldn&apos;t load</h1>
        <p role="alert" className="mt-3 text-base leading-7 text-gray-muted">
          Nothing has changed, and your booking is kept. Reload this page in a minute, or reply to your booking email to reach the business.
        </p>
      </Shell>
    );
  }
  const { booking } = state;
  if (state.kind === "ended") {
    return (
      <Shell>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">{booking.siteName || "Your booking"}</p>
        <h1 className="mt-3 font-display text-[32px] font-medium leading-tight">This booking has passed</h1>
        <p className="mt-3 text-base leading-7 text-gray-muted">The link stops working once the appointment is over. To book again, visit the business&apos;s website.</p>
        <Summary booking={booking} />
      </Shell>
    );
  }
  const cancelled = booking.status === "cancelled";
  return (
    <Shell>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">{booking.siteName || "Your booking"}</p>
      <h1 className="mt-3 font-display text-[32px] font-medium leading-tight">{cancelled ? "Your booking is cancelled" : "Your booking"}</h1>

      {state.notice === "rescheduled" ? (
        <p role="status" className="mt-4 rounded-lg bg-gray-bg px-4 py-3 text-sm">Your new time is booked. A confirmation is on its way when email is on for this business.</p>
      ) : state.notice === "pending" ? (
        <p role="status" className="mt-4 rounded-lg bg-gray-bg px-4 py-3 text-sm">Your request is waiting for confirmation. This time is not confirmed yet.</p>
      ) : state.notice === "cancelled" ? (
        <p role="status" className="mt-4 rounded-lg bg-gray-bg px-4 py-3 text-sm">Cancelled. The time is open for someone else.</p>
      ) : null}
      {state.error ? <p role="alert" className="mt-4 rounded-lg border border-critical/40 px-4 py-3 text-sm text-critical">{state.error}</p> : null}

      <Summary booking={booking} />

      {booking.status === "held" ? (
        <section className="mt-10" aria-labelledby="confirm-booking">
          <h2 id="confirm-booking" className="text-lg font-medium">Confirm this request</h2>
          <p className="mt-2 text-sm leading-6 text-gray-muted">An assistant requested this time. It is held for 15 minutes. Confirm only if you asked for it; otherwise let the hold expire.</p>
          {booking.confirmationRequired ? <form method="post" action={actionUrl} className="mt-4">
            <input type="hidden" name="action" value="confirm" />
            <button type="submit" className={`${buttonBase} bg-accent text-on-accent`}>Confirm my request</button>
          </form> : null}
        </section>
      ) : cancelled ? null : (
        <>
          <section className="mt-10" aria-labelledby="change-time">
            <h2 id="change-time" className="text-lg font-medium">Change the time</h2>
            {state.changesClosed ? (
              <p className="mt-2 text-sm leading-6 text-gray-muted">The business isn&apos;t taking new times right now. You can still cancel, or reply to your booking email.</p>
            ) : state.slotsUnavailable ? (
              <p className="mt-2 text-sm leading-6 text-gray-muted">Open times couldn&apos;t be read right now. Your booking is unchanged. Reload to try again.</p>
            ) : state.days.length === 0 ? (
              <p className="mt-2 text-sm leading-6 text-gray-muted">No other times are open in the next two weeks. Reply to your booking email to ask about another time.</p>
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
                          <label key={slot.id} className="cursor-pointer">
                            <input type="radio" name="slotId" value={slot.id} required className="peer sr-only" />
                            <span className="inline-flex min-h-11 items-center rounded-full border border-gray-border px-4 text-sm tabular-nums peer-checked:border-warm-black peer-checked:bg-warm-black peer-checked:text-warm-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                              {slot.time}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </fieldset>
                <button type="submit" className={`${buttonBase} mt-6 bg-accent text-on-accent hover:bg-accent/85`}>Move my booking</button>
              </form>
            )}
          </section>

          <section className="mt-10 border-t border-gray-border pt-8" aria-labelledby="cancel-booking">
            <h2 id="cancel-booking" className="text-lg font-medium">Cancel</h2>
            <p className="mt-2 text-sm leading-6 text-gray-muted">The business is told and the time opens up for someone else. This can&apos;t be undone from here.</p>
            <form method="post" action={actionUrl} className="mt-4">
              <input type="hidden" name="action" value="cancel" />
              <button type="submit" className={`${buttonBase} border border-gray-border text-critical hover:bg-gray-bg`}>Cancel my booking</button>
            </form>
          </section>
        </>
      )}
    </Shell>
  );
}
