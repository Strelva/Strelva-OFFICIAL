/**
 * The Sunday weekly report, for owners who never log in. One data shape feeds
 * both the picture message (picture card + bubbles) and the plain SMS
 * fallback. Unmeasured parts are left out, never written as zero.
 */

export interface WeeklyReport {
  /** Short place name: "Hertel Ave". */
  place: string;
  found: number | null;
  booked: number | null;
  earned: { amount: number; source: string } | null;
  messages: { total: number; answered: number; typicalMinutes: number | null } | null;
  /** One decision waiting on the owner, answerable by text. */
  needsYou: { what: string; replyWord: string; effect: string } | null;
}

const count = (value: number) => value.toLocaleString("en-US");
const dollars = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

/** "412 people found you." or null when found isn't measured. */
export function weeklyPictureLine(report: WeeklyReport): { value: number; unit: string; detail: string | null } | null {
  if (report.found === null) return null;
  return {
    value: report.found,
    unit: report.found === 1 ? "person found you." : "people found you.",
    detail: report.booked !== null ? `${count(report.booked)} of them booked.` : null,
  };
}

/** The bubbles that follow the picture, in order. */
export function weeklyReportBubbles(report: WeeklyReport): string[] {
  const bubbles: string[] = [];
  const money = report.earned ? `${dollars(report.earned.amount)} through ${report.earned.source}.` : "";
  let replies = "";
  if (report.messages && report.messages.total > 0) {
    const { total, answered, typicalMinutes } = report.messages;
    const speed = typicalMinutes !== null ? `, typically in ${Math.round(typicalMinutes)} min` : "";
    replies = answered >= total
      ? `All ${count(total)} ${total === 1 ? "message" : "messages"} answered${speed}.`
      : `${count(answered)} of ${count(total)} messages answered${speed}.`;
  }
  const combined = [money, replies].filter(Boolean).join(" ");
  if (combined) bubbles.push(combined);
  if (report.needsYou) bubbles.push(`One thing needs you: ${report.needsYou.what}. Reply ${report.needsYou.replyWord} to ${report.needsYou.effect}.`);
  return bubbles;
}

/** Plain-text SMS fallback for phones that don't show the picture. */
export function weeklyReportText(report: WeeklyReport): string {
  const head = `Your week at ${report.place}:`;
  const reach = report.found !== null && report.booked !== null
    ? `${count(report.found)} ${report.found === 1 ? "person" : "people"} found you, ${count(report.booked)} booked.`
    : report.found !== null ? `${count(report.found)} ${report.found === 1 ? "person" : "people"} found you.`
    : report.booked !== null ? `${count(report.booked)} booked.` : "";
  const rest = weeklyReportBubbles(report);
  if (!reach && !rest.length) return `${head} Strelva is still connecting your numbers. Nothing needs you.`;
  return [head, reach, ...rest].filter(Boolean).join(" ");
}
