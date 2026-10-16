import type { BusinessOutcomeMonth } from "@/platform/business-outcomes";
import { formatOutcomeLine } from "@/platform/business-outcomes";
import { releaseLabel } from "@/platform/app-releases/catalog";
import type { CareCheck, CareReportFacts, CareSiteCheck } from "./contracts";

/** Pure wording and arithmetic for a Care plan report. Browser-safe: no I/O. */

const monthStart = (month: string): Date => new Date(`${month}-01T00:00:00.000Z`);

export function careMonthLabel(month: string): string {
  return monthStart(month).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

const monthKey = (date: Date): string => date.toISOString().slice(0, 7);
export function currentCareMonth(now: Date = new Date()): string { return monthKey(now); }
export function previousCareMonth(now: Date = new Date()): string {
  return monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

/** "Oct 15", in UTC. */
export const careShortDate = (iso: string): string => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = careShortDate;

export function careReportTitle(facts: Pick<CareReportFacts, "month" | "through">): string {
  const start = monthStart(facts.month);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const label = careMonthLabel(facts.month);
  return Date.parse(facts.through) < end.getTime() ? `${label} so far · through ${shortDate(facts.through)}` : `${label} report`;
}

export const CARE_CHECK_LABEL: Record<CareCheck, string> = {
  confirmed: "Checked on the live site",
  not_confirmed: "Not confirmed on the live site",
  not_checked: "Not checked on the live site",
};

/** Status as an exception: a checked change says nothing; the others say why in two words. */
export function careCheckException(check: CareCheck): string | null {
  return check === "confirmed" ? null : check === "not_confirmed" ? "Not confirmed" : "Not checked";
}

/**
 * The site checks as one sentence, the way E3 says it: "harbordental.com
 * passed all 30 checks." The exception, if any, follows in its own sentence.
 */
export function careSiteCheckSentence(siteChecks: CareReportFacts["siteChecks"], fallbackName: string): string {
  const { hosted, latest } = siteChecks;
  const host = latest[0]?.host ?? fallbackName;
  const sentences: string[] = [];
  if (hosted.checks > 0) {
    sentences.push(hosted.healthy === hosted.checks
      ? `${host} passed ${hosted.checks === 1 ? "its one check" : `all ${plural(hosted.checks, "check", "checks")}`}.`
      : `${host} passed ${hosted.healthy.toLocaleString("en-US")} of ${plural(hosted.checks, "check", "checks")}.`);
  }
  for (const check of latest) if (check.state !== "up") sentences.push(`${check.host} ${STATE_PHRASE[check.state]} when last checked, ${shortDate(check.checkedAt)}.`);
  return sentences.length ? sentences.join(" ") : "No site checks were recorded this month.";
}

export function careChangeTitle(item: { systemName: string; release: number }): string {
  return `${item.systemName} · ${releaseLabel(item.release)}`;
}

export function careTimeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function careUsageLine(usage: { calls: number }): string {
  if (usage.calls === 0) return "No Strelva assistant runs";
  return `${usage.calls.toLocaleString("en-US")} Ask Strelva and drafting ${usage.calls === 1 ? "run" : "runs"}`;
}

export function careOutcomeLine(outcomes: CareReportFacts["outcomes"]): string {
  if (outcomes.available) return formatOutcomeLine(outcomes.month as unknown as BusinessOutcomeMonth).text;
  return outcomes.reason === "no_member"
    ? "Inquiries and bookings aren't counted until someone from the business has signed in."
    : "Inquiries and bookings couldn't be read for this month.";
}

const STATE_PHRASE: Record<CareSiteCheck["state"], string> = {
  up: "was up",
  down: "was down",
  parked: "was showing a parked page",
  unreachable: "couldn't be reached",
  unknown: "couldn't be told apart",
};
const NOT_UPTIME = "These are recorded checks, not continuous uptime.";
const plural = (n: number, one: string, many: string): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function careSiteCheckLines(siteChecks: CareReportFacts["siteChecks"]): string[] {
  const lines: string[] = [];
  const { hosted, readBacks, latest } = siteChecks;
  if (hosted.checks > 0) lines.push(`${plural(hosted.checks, "site check", "site checks")} · ${hosted.healthy.toLocaleString("en-US")} found the published page`);
  if (readBacks.confirmed > 0) lines.push(`${plural(readBacks.confirmed, "website deploy", "website deploys")} checked on the live site`);
  if (readBacks.notConfirmed > 0) lines.push(`${plural(readBacks.notConfirmed, "website deploy", "website deploys")} not confirmed on the live site`);
  if (readBacks.notChecked > 0) lines.push(`${plural(readBacks.notChecked, "website deploy", "website deploys")} not checked on the live site`);
  for (const check of latest) lines.push(`${check.host} ${STATE_PHRASE[check.state]} when last checked, ${shortDate(check.checkedAt)}`);
  if (!lines.length) lines.push("No site checks were recorded this month.");
  lines.push(NOT_UPTIME);
  return lines;
}

export function careHeadline(facts: Pick<CareReportFacts, "changes" | "requests" | "time">): string {
  const parts: string[] = [];
  if (facts.changes.confirmed > 0) parts.push(`${plural(facts.changes.confirmed, "checked change", "checked changes")}`);
  if (facts.requests.doneCount > 0) parts.push(`${plural(facts.requests.doneCount, "Request", "Requests")} done`);
  if (facts.time.minutes > 0) parts.push(`${careTimeLabel(facts.time.minutes)} recorded`);
  return parts.length ? parts.join(" · ") : "No recorded work this month";
}

export const CARE_DELIVERY_COPY: Record<string, string> = {
  email_off: "Not sent: email is off. Copy the link and send it yourself.",
  no_trusted_owner_recipient: "Not sent: there's no confirmed owner email for this client. Copy the link instead.",
  owner_recipient_is_staff: "Not sent: the owner address on record is a staff address. Copy the link instead.",
  owner_recipient_check_unavailable: "Not sent: the owner address couldn't be checked. Copy the link instead.",
  agency_identity_unavailable: "Not sent: your agency's name couldn't be confirmed. Copy the link instead.",
  default_suppressed: "Not sent. Copy the link instead.",
  unknown: "Email outcome unknown. It won't be sent again.",
  reserved: "Sending…",
};

export function careDeliveryLine(
  delivery: { status: "reserved" | "accepted" | "suppressed" | "unknown"; reason?: string | null; recordedAt: string } | null,
  emailOn: boolean,
): string {
  if (!delivery) return emailOn ? "Not emailed yet." : CARE_DELIVERY_COPY.email_off!;
  if (delivery.status === "accepted") return `Emailed ${shortDate(delivery.recordedAt)}. Delivery to the inbox isn't confirmed.`;
  if (delivery.status === "unknown") return CARE_DELIVERY_COPY.unknown!;
  if (delivery.status === "reserved") return CARE_DELIVERY_COPY.reserved!;
  return (delivery.reason && CARE_DELIVERY_COPY[delivery.reason]) || CARE_DELIVERY_COPY.default_suppressed!;
}

export const careReleaseLabel = releaseLabel;
