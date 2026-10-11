export type CalendarInterval = { start: string; end: string };
export type CalendarReservation = CalendarInterval & { requestId: string; title: string; status: string };

/** Availability is display data, never an authorization to reserve. Pending writes
 * also occupy the calendar until their existing recovery path resolves them. */
export function openCalendarIntervals(availability: readonly CalendarInterval[], reservations: readonly CalendarReservation[]): CalendarInterval[] {
  const occupied = reservations.filter(item => item.status !== "cancelled").map(item => [Date.parse(item.start), Date.parse(item.end)] as const).sort((a, b) => a[0] - b[0]);
  return availability.flatMap(window => {
    let cursor = Date.parse(window.start);
    const end = Date.parse(window.end);
    const open: CalendarInterval[] = [];
    for (const [start, stop] of occupied) {
      if (stop <= cursor || start >= end) continue;
      if (start > cursor) open.push({ start: new Date(cursor).toISOString(), end: new Date(Math.min(start, end)).toISOString() });
      cursor = Math.max(cursor, stop);
      if (cursor >= end) break;
    }
    if (cursor < end) open.push({ start: new Date(cursor).toISOString(), end: new Date(end).toISOString() });
    return open;
  });
}

export function calendarWallDate(iso: string, timeZone?: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso));
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute")));
}
