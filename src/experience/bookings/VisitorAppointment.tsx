import type { ReactNode } from "react";
import styles from "./visitor.module.css";

export type VisitorAppointmentTone = "waits" | "live" | "ended";

/**
 * The one object a visitor's booking page is about (xs-visitor, after XA · E4):
 * the day, the time in large figures, then what it is. State is a dot and a
 * word above it, and only when it says something the time can't: clay when it
 * waits on someone, moss once it is booked, quiet when it no longer holds.
 * A time that no longer holds is struck through, never grayed into a slab.
 */
export function VisitorAppointment({ day, time, zone, service, status, struck = false, children }: {
  day: string;
  time: string;
  zone?: string;
  /** What it is. Left out when the record doesn't say, never replaced with a placeholder. */
  service?: string;
  status?: { tone: VisitorAppointmentTone; label: string };
  struck?: boolean;
  /** One or two quiet lines under the time: a deadline, where to go, who booked it. */
  children?: ReactNode;
}) {
  return <section className={styles.appointment} aria-label="Your booking" data-struck={struck || undefined}>
    {status ? <p className={styles.state} data-tone={status.tone}><span className={styles.stateDot} aria-hidden="true" />{status.label}</p> : null}
    <p className={styles.apDay}>{day}</p>
    <p className={styles.apTime}>{struck ? <span className={styles.srOnly}>No longer booked: </span> : null}<span className={styles.apClock}>{time}</span>{zone ? <span className={styles.apZone}>{zone}</span> : null}</p>
    {service ? <p className={styles.apService}>{service}</p> : null}
    {children ? <div className={styles.apMore}>{children}</div> : null}
  </section>;
}

/** An ISO instant as the appointment's day and clock in the business's own zone. */
export function visitorAppointmentTime(iso: string, timeZone = "UTC"): { day: string; time: string; zone: string } {
  let zone = timeZone;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(); } catch { zone = "UTC"; }
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return { day: "Date unavailable", time: "Time unavailable", zone: "" };
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: zone === "UTC" ? "short" : "longGeneric" }).formatToParts(at).find(part => part.type === "timeZoneName")?.value ?? "";
  return { day, time, zone: name };
}
