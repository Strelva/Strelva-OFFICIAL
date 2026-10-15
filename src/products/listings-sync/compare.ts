import { factValueSchemas, phoneKey, type ConfirmedBusinessFacts, type FactValues } from "@/platform/business-record/contracts";
import { hoursMatch, hoursToGoogle, normalizeHours } from "@/products/google-listing/server";
import type { GoogleHours } from "@/products/google-listing/contracts";
import type { FactComparison } from "./contracts";

/**
 * Pure comparators. A fact only 'differs' when a shown value conflicts with a
 * confirmed one: absence is never a difference. No IO, no clock.
 */

export interface SpecialDay { date: string; closed: boolean; opens?: string; closes?: string }
export interface Expected {
  phone?: string;
  address?: FactValues["address"];
  hours?: FactValues["hours"];
  special: SpecialDay[];
  services: string[];
  bookingUrl?: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clip = (value: string, max = 500) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const norm = (value: string | undefined | null) => (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const digits = (value: string | undefined) => (value ?? "").replace(/[^0-9]/g, "").replace(/^1(?=\d{10}$)/, "");

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addressLine(address: FactValues["address"] | undefined): string {
  if (!address) return "";
  if (address.formatted) return address.formatted;
  return [address.line1, address.line2, address.city, [address.region, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function hoursSummary(weekly: Array<{ day: number; opens: string; closes: string }>): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = order.map(day => {
    const ranges = weekly.filter(item => item.day === day).sort((a, b) => a.opens.localeCompare(b.opens));
    return `${DAY_NAMES[day]!.slice(0, 3)} ${ranges.length ? ranges.map(r => `${r.opens}–${r.closes}`).join(", ") : "closed"}`;
  });
  return rows.join("; ");
}

/** Only owner-confirmed facts propagate. `today` is YYYY-MM-DD in the record's time zone. */
export function expectedFacts(confirmed: ConfirmedBusinessFacts, today: string): Expected {
  const out: Expected = { special: [], services: [] };
  const facts = confirmed.facts;
  const phone = factValueSchemas.phone.safeParse(facts.phone);
  if (phone.success) out.phone = phone.data;
  const address = factValueSchemas.address.safeParse(facts.address);
  if (address.success) out.address = address.data;
  const hours = factValueSchemas.hours.safeParse(facts.hours);
  if (hours.success) {
    out.hours = hours.data;
    const last = addDays(today, 60);
    out.special = (hours.data.overrides ?? []).filter(item => item.date >= today && item.date <= last)
      .map(item => ({ date: item.date, closed: item.closed, ...(item.opens ? { opens: item.opens } : {}), ...(item.closes ? { closes: item.closes } : {}) }));
  }
  const links = factValueSchemas.links.safeParse(facts.links);
  if (links.success) out.bookingUrl = links.data.find(link => link.kind === "booking")?.url;
  out.services = confirmed.services.map(service => service.name).filter(name => name.trim());
  return out;
}

// ---- website ----

export interface SchemaConflictLike { field: string; published: string; confirmed: string }
export interface WebsitePage {
  report: { businesses: Array<{ telephone?: string; address?: unknown; openingHours?: unknown; openingHoursSpecification?: unknown[] }> };
  telHrefs: string[];
  hrefs: string[];
  text: string;
}

const SCHEDULER_HOSTS = ["calendly.com", "acuityscheduling.com", "square.site", "squareup.com", "vagaro.com", "booksy.com", "setmore.com", "fresha.com"];

function normUrl(value: string): { host: string; path: string } | null {
  try {
    const u = new URL(value);
    return { host: u.hostname.toLowerCase().replace(/^www\./, ""), path: u.pathname.replace(/\/+$/, "") };
  } catch { return null; }
}

/** `conflicts` come from comparePlatformSchema over the page's JSON-LD (connected-sites), passed in to keep this module pure. */
export function compareWebsite(expected: Expected, page: WebsitePage, conflicts: SchemaConflictLike[]): FactComparison[] {
  const out: FactComparison[] = [];
  const biz = page.report.businesses;

  if (expected.phone) {
    const conflict = conflicts.find(item => item.field === "phone");
    const tels = page.telHrefs.map(href => decodeURIComponent(href.replace(/^tel:/i, "")).trim()).filter(Boolean);
    const want = phoneKey(expected.phone);
    if (conflict) out.push({ fact: "phone", state: "differs", shown: clip(conflict.published), expected: expected.phone });
    else if (biz.some(item => item.telephone)) out.push({ fact: "phone", state: "matches", shown: clip(biz.find(item => item.telephone)!.telephone!), expected: expected.phone });
    else if (tels.length) {
      const hit = tels.find(tel => phoneKey(tel) === want);
      out.push(hit ? { fact: "phone", state: "matches", shown: clip(hit), expected: expected.phone } : { fact: "phone", state: "differs", shown: clip(tels[0]!), expected: expected.phone });
    } else out.push({ fact: "phone", state: "not_shown", shown: null, expected: expected.phone });
  }

  if (expected.address) {
    const conflict = conflicts.find(item => item.field.startsWith("address"));
    const line = addressLine(expected.address);
    if (conflict) out.push({ fact: "address", state: "differs", shown: clip(conflict.published), expected: clip(line) });
    else if (biz.some(item => item.address)) out.push({ fact: "address", state: "matches", shown: null, expected: clip(line) });
    else {
      const text = norm(page.text);
      const run = norm(expected.address.line1 ?? expected.address.formatted).split(" ").slice(0, 3).join(" ");
      const zipOk = !expected.address.postalCode || text.includes(norm(expected.address.postalCode));
      out.push(run && text.includes(run) && zipOk
        ? { fact: "address", state: "matches", shown: null, expected: clip(line) }
        : { fact: "address", state: "not_checked", shown: null, expected: clip(line) });
    }
  }

  if (expected.hours) {
    const conflict = conflicts.filter(item => item.field.startsWith("hours."));
    const summary = clip(hoursSummary(expected.hours.weekly));
    if (conflict.length) {
      out.push({ fact: "hours", state: "differs", shown: clip(conflict.map(item => `${item.field.slice(6)} ${item.published}`).join("; ")), expected: summary });
    } else if (biz.some(item => item.openingHours || (item.openingHoursSpecification && item.openingHoursSpecification.length))) {
      out.push({ fact: "hours", state: "matches", shown: null, expected: summary });
    } else out.push({ fact: "hours", state: "not_checked", shown: null, expected: summary, note: "Hours on this page aren't machine-readable." });
  }

  if (expected.special.length) out.push({ fact: "special_hours", state: "not_checked", shown: null, expected: null });

  if (expected.services.length) {
    const text = norm(page.text);
    const missing = expected.services.filter(name => !text.includes(norm(name)));
    out.push(missing.length
      ? { fact: "services", state: "not_shown", shown: null, expected: clip(expected.services.join(", ")), note: clip(`Not on the page: ${missing.slice(0, 3).join(", ")}`, 300) }
      : { fact: "services", state: "matches", shown: null, expected: clip(expected.services.join(", ")) });
  }

  if (expected.bookingUrl) {
    const want = normUrl(expected.bookingUrl);
    const links = page.hrefs.map(href => ({ href, parsed: normUrl(href) })).filter((item): item is { href: string; parsed: { host: string; path: string } } => !!item.parsed);
    if (want && links.some(item => item.parsed.host === want.host && item.parsed.path === want.path)) {
      out.push({ fact: "booking_link", state: "matches", shown: null, expected: clip(expected.bookingUrl) });
    } else {
      const other = links.find(item => SCHEDULER_HOSTS.some(host => item.parsed.host === host || item.parsed.host.endsWith(`.${host}`)));
      out.push(other
        ? { fact: "booking_link", state: "differs", shown: clip(other.href), expected: clip(expected.bookingUrl) }
        : { fact: "booking_link", state: "not_shown", shown: null, expected: clip(expected.bookingUrl) });
    }
  }
  return out;
}

// ---- Google ----

export interface GoogleLocationLike extends GoogleHours {
  phoneNumbers?: { primaryPhone?: string };
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
}

export function compareGoogle(expected: Expected, loc: GoogleLocationLike, today: string): FactComparison[] {
  const out: FactComparison[] = [];

  if (expected.phone) {
    const shown = loc.phoneNumbers?.primaryPhone;
    out.push(!shown ? { fact: "phone", state: "not_shown", shown: null, expected: expected.phone }
      : digits(shown) === digits(expected.phone) ? { fact: "phone", state: "matches", shown: clip(shown), expected: expected.phone }
      : { fact: "phone", state: "differs", shown: clip(shown), expected: expected.phone });
  }

  if (expected.address) {
    const live = loc.storefrontAddress;
    const line = clip(addressLine(expected.address));
    if (!live) out.push({ fact: "address", state: "not_shown", shown: null, expected: line });
    else {
      const pairs: Array<[string | undefined, string | undefined]> = [
        [expected.address.line1, live.addressLines?.[0]], [expected.address.city, live.locality],
        [expected.address.region, live.administrativeArea], [expected.address.postalCode, live.postalCode],
      ];
      const differs = pairs.some(([want, have]) => want && have && norm(want) !== norm(have));
      const shown = clip([live.addressLines?.[0], live.locality, [live.administrativeArea, live.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "));
      out.push({ fact: "address", state: differs ? "differs" : "matches", shown: shown || null, expected: line });
    }
  }

  if (expected.hours) {
    const summary = clip(hoursSummary(expected.hours.weekly));
    if (!loc.regularHours?.periods?.length && !expected.hours.weekly.length) out.push({ fact: "hours", state: "matches", shown: null, expected: summary });
    else if (!loc.regularHours) out.push({ fact: "hours", state: "not_shown", shown: null, expected: summary });
    else out.push({ fact: "hours", state: hoursMatch(hoursToGoogle(expected.hours), loc, ["regularHours"]) ? "matches" : "differs", shown: null, expected: summary });
  }

  if (expected.special.length) {
    const base = expected.hours ?? { timezone: "UTC", weekly: [] };
    const want = normalizeHours({ specialHours: hoursToGoogle({ ...base, overrides: expected.special }).specialHours }).special;
    const last = addDays(today, 60);
    const liveInWindow = (loc.specialHours?.specialHourPeriods ?? []).filter(period => {
      const d = period.startDate;
      const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      return key >= today && key <= last;
    });
    const have = normalizeHours({ specialHours: { specialHourPeriods: liveInWindow } }).special;
    const same = JSON.stringify(want) === JSON.stringify(have);
    out.push({ fact: "special_hours", state: same ? "matches" : "differs", shown: same || !have.length ? null : clip(have.join("; ")), expected: clip(want.join("; ")) });
  }

  if (expected.services.length) out.push({ fact: "services", state: "not_checked", shown: null, expected: null });
  if (expected.bookingUrl) out.push({ fact: "booking_link", state: "not_checked", shown: null, expected: null });
  return out;
}

// ---- booking page ----

export interface BookingContextLike { hours: unknown | null }

export function compareBooking(expected: Expected, context: BookingContextLike, outside: Array<{ day: number; opens: string; closes: string }>): FactComparison[] {
  const out: FactComparison[] = [];
  if (expected.hours) {
    const summary = clip(hoursSummary(expected.hours.weekly));
    if (outside.length) {
      out.push({ fact: "hours", state: "differs", shown: clip(outside.map(row => `${DAY_NAMES[row.day]} ${row.opens}–${row.closes}`).join("; ")), expected: "Inside your hours" });
    } else out.push({ fact: "hours", state: context.hours ? "follows" : "not_shown", shown: null, expected: summary });
  }
  if (expected.phone) out.push({ fact: "phone", state: "follows", shown: null, expected: expected.phone });
  if (expected.address) out.push({ fact: "address", state: "follows", shown: null, expected: clip(addressLine(expected.address)) });
  if (expected.special.length) out.push({ fact: "special_hours", state: "follows", shown: null, expected: null });
  if (expected.services.length) out.push({ fact: "services", state: "follows", shown: null, expected: clip(expected.services.join(", ")) });
  return out;
}

// ---- Yelp (read only) ----

export interface YelpBusinessLike {
  phone?: string;
  location?: { address1?: string; city?: string; state?: string; zip_code?: string };
  hours?: Array<{ open?: Array<{ day: number; start: string; end: string }> }>;
}

const yelpTime = (value: string) => `${value.slice(0, 2)}:${value.slice(2, 4)}`;

export function compareYelp(expected: Expected, biz: YelpBusinessLike): FactComparison[] {
  const out: FactComparison[] = [];
  if (expected.phone) {
    out.push(!biz.phone ? { fact: "phone", state: "not_shown", shown: null, expected: expected.phone }
      : digits(biz.phone) === digits(expected.phone) ? { fact: "phone", state: "matches", shown: biz.phone, expected: expected.phone }
      : { fact: "phone", state: "differs", shown: biz.phone, expected: expected.phone });
  }
  if (expected.address) {
    const live = biz.location;
    const line = clip(addressLine(expected.address));
    if (!live) out.push({ fact: "address", state: "not_shown", shown: null, expected: line });
    else {
      const pairs: Array<[string | undefined, string | undefined]> = [
        [expected.address.line1, live.address1], [expected.address.city, live.city], [expected.address.region, live.state], [expected.address.postalCode, live.zip_code],
      ];
      out.push({ fact: "address", state: pairs.some(([want, have]) => want && have && norm(want) !== norm(have)) ? "differs" : "matches",
        shown: clip([live.address1, live.city, [live.state, live.zip_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")) || null, expected: line });
    }
  }
  if (expected.hours) {
    const summary = clip(hoursSummary(expected.hours.weekly));
    const open = biz.hours?.[0]?.open;
    if (!open?.length) out.push({ fact: "hours", state: "not_shown", shown: null, expected: summary });
    else {
      // Yelp day 0 is Monday; the record's day 0 is Sunday.
      const live = open.map(row => `${(row.day + 1) % 7}@${yelpTime(row.start)}-${yelpTime(row.end)}`).sort();
      const want = expected.hours.weekly.map(row => `${row.day}@${row.opens}-${row.closes}`).sort();
      const same = JSON.stringify(live) === JSON.stringify(want);
      out.push({ fact: "hours", state: same ? "matches" : "differs", shown: same ? null : clip(hoursSummary(open.map(row => ({ day: (row.day + 1) % 7, opens: yelpTime(row.start), closes: yelpTime(row.end) })))), expected: summary });
    }
  }
  if (expected.special.length) out.push({ fact: "special_hours", state: "not_checked", shown: null, expected: null });
  if (expected.services.length) out.push({ fact: "services", state: "not_checked", shown: null, expected: null });
  if (expected.bookingUrl) out.push({ fact: "booking_link", state: "not_checked", shown: null, expected: null });
  return out;
}
