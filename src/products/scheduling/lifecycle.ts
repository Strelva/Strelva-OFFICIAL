import type { z } from "zod";
import type { scheduleSchema, ScheduleLifecycle } from "./contracts";

type Schedule = z.infer<typeof scheduleSchema>;

export const SCHEDULE_PAUSED_MESSAGE = "Bookings are paused. Existing appointments are unchanged; resume bookings to take new ones.";

/** Intended operation only. Provider and verification health are separate. */
export function scheduleLifecycle(schedule: Pick<Schedule, "pause">): ScheduleLifecycle {
  return schedule.pause ? "paused" : "live";
}

export interface ScheduleHold {
  requestId: string;
  title: string;
  start: string;
  end: string;
}

export interface ScheduleObligations {
  /** Accepted, not cancelled, still ahead. Pause keeps every one of these. */
  upcoming: number;
  /** Local holds still ahead that have not reached the calendar yet. */
  openHolds: ScheduleHold[];
  /** Local holds whose time passed before they reached the calendar. Resume
   * never confirms or re-offers them; the owner reviews or cancels them. */
  expiredHolds: ScheduleHold[];
  /** A provider write whose outcome is unknown; needs recovery, not retry. */
  needsRecovery: ScheduleHold[];
}

/** What a pause keeps and what a resume has to review. */
export function scheduleObligations(schedule: Pick<Schedule, "reservations">, now: number): ScheduleObligations {
  const hold = (value: Schedule["reservations"][number]): ScheduleHold => ({ requestId: value.requestId, title: value.title, start: value.start, end: value.end });
  const active = schedule.reservations.filter(value => value.status !== "cancelled");
  return {
    upcoming: active.filter(value => value.status === "accepted" && Date.parse(value.end) > now).length,
    openHolds: active.filter(value => value.status === "reserved" && Date.parse(value.end) > now).map(hold),
    expiredHolds: active.filter(value => value.status === "reserved" && Date.parse(value.end) <= now).map(hold),
    needsRecovery: active.filter(value => value.status === "writing" || value.status === "unknown").map(hold),
  };
}
