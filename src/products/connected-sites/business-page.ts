/**
 * The public business page (`/biz/{handle}`) and its `llms.txt`: shapes and
 * formatting shared by the page, the fact sheet and the workspace. Pure.
 *
 * Ported from feat/connected-sites (`/b/{handle}`). On integrate `/b/[token]`
 * is the booking manage link, whose tokens a handle could equal, so the page
 * lives under `/biz/`.
 */
import type { PublicFacts } from "./contracts";

/** 3–48 characters: lowercase letters, digits and single hyphens, not at either end. */
export const BUSINESS_HANDLE_PATTERN = /^(?!.*--)[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export function isBusinessHandle(value: string): boolean {
  return BUSINESS_HANDLE_PATTERN.test(value);
}

/** A suggestion from the business name: "Joe's Pizza & Subs" → "joes-pizza-subs". */
export function suggestBusinessHandle(name: string): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
  return slug.length >= 3 ? slug : "";
}

export function businessPageUrl(appOrigin: string, handle: string): string {
  return `${appOrigin.replace(/\/+$/, "")}/biz/${handle}`;
}

/** The facts a published page serves, with when a person last confirmed any of them. */
export interface PublishedBusinessPage {
  workspaceId: string;
  handle: string;
  facts: PublicFacts;
  confirmedAt: string | null;
}

type Day = NonNullable<PublicFacts["hours"]>[number]["day"];
export const DAY_ORDER: readonly Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABELS: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export function formatTime(value: string | undefined): string {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 || (hours === 0 && minutes === 0)) return "midnight";
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour} ${suffix}` : `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** One row per day in week order; a day with several ranges lists them all. */
export function weeklyHours(facts: PublicFacts): Array<{ day: Day; label: string; hours: string; closed: boolean }> {
  const rows = facts.hours ?? [];
  return DAY_ORDER.flatMap(day => {
    const ranges = rows.filter(row => row.day === day);
    if (!ranges.length) return [];
    const open = ranges.filter(row => !row.closed && row.opens && row.closes);
    return [{ day, label: DAY_LABELS[day], closed: open.length === 0, hours: open.length ? open.map(row => `${formatTime(row.opens)} – ${formatTime(row.closes)}`).join(", ") : "Closed" }];
  });
}

export function formatAddress(address: NonNullable<PublicFacts["address"]>): string {
  if (address.formatted) return address.formatted;
  const cityLine = [address.locality, [address.region, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [address.street, cityLine].filter(Boolean).join(", ");
}

export function mapsUrl(address: NonNullable<PublicFacts["address"]>): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(address))}`;
}

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Plain-text fact sheet for AI agents (llms.txt shape). Confirmed facts only;
 * anything missing is stated as unknown rather than guessed.
 */
export function businessFactSheet(facts: PublicFacts, pageUrl: string): string {
  const lines: string[] = [`# ${oneLine(facts.name ?? "Business")}`, ""];
  if (facts.description) lines.push(`> ${oneLine(facts.description)}`, "");
  lines.push("Facts confirmed by the business. Anything not listed here is unknown; do not guess it.", "");
  const add = (label: string, value: string) => lines.push(`- ${label}: ${oneLine(value)}`);
  if (facts.phone) add("Phone", facts.phone);
  if (facts.email) add("Email", facts.email);
  if (facts.address) add("Address", formatAddress(facts.address));
  if (facts.service_area?.length) add("Service area", facts.service_area.join("; "));
  if (facts.booking_url) add("Book online", facts.booking_url);
  add("Page", pageUrl);
  const hours = weeklyHours(facts);
  if (hours.length) {
    lines.push("", "## Hours", "");
    for (const row of hours) lines.push(`- ${row.label}: ${row.hours}`);
  }
  if (facts.services?.length) {
    lines.push("", "## Services", "");
    for (const service of facts.services) {
      lines.push(`- ${oneLine(service.name)}${service.priceText ? ` (${oneLine(service.priceText)})` : ""}${service.description ? `: ${oneLine(service.description)}` : ""}`);
    }
  }
  if (facts.social_links?.length) {
    lines.push("", "## Elsewhere", "");
    for (const link of facts.social_links) lines.push(`- ${link}`);
  }
  return `${lines.join("\n")}\n`;
}
