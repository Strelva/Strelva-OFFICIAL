/**
 * Money periods in owner words: "October" for a whole calendar month, else
 * "Oct 1 to Nov 15". No time zone ids and no clock times for a period that
 * starts and ends on day boundaries; the stored instants stay exact.
 */
const UTC_MIDNIGHT = (value: Date) =>
  value.getUTCHours() === 0 &&
  value.getUTCMinutes() === 0 &&
  value.getUTCSeconds() === 0 &&
  value.getUTCMilliseconds() === 0;

const parse = (iso: string | null | undefined) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime()) ? value : null;
};

export function periodWords(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  now = new Date(),
): string | null {
  const start = parse(startIso),
    end = parse(endIso);
  if (!start || !end) return null;
  const boundary = UTC_MIDNIGHT(start) && UTC_MIDNIGHT(end);
  const timeZone = boundary ? "UTC" : undefined;
  const sameYear =
    start.getUTCFullYear() === now.getUTCFullYear() &&
    end.getUTCFullYear() === now.getUTCFullYear();
  if (
    boundary &&
    start.getUTCDate() === 1 &&
    end.getUTCDate() === 1 &&
    (end.getUTCMonth() - start.getUTCMonth() + 12) % 12 === 1 &&
    end.getTime() - start.getTime() < 32 * 86_400_000
  )
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      ...(sameYear ? {} : { year: "numeric" }),
      timeZone: "UTC",
    }).format(start);
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    ...(boundary ? {} : { hour: "numeric", minute: "2-digit" }),
    timeZone,
  });
  return `${day.format(start)} to ${day.format(end)}`;
}

/** One local day, for "agreed on Oct 1". */
export function shortLocalDay(iso: string | null | undefined): string {
  const value = parse(iso);
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(value)
    : "";
}

/** A local date and time the owner just typed, read back without a zone id. */
export function localMoment(iso: string | null | undefined): string {
  const value = parse(iso);
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(value)
    : "";
}
