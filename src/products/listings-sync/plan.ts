import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import { intersectRanges, type TimeRange } from "@/platform/bookings/availability";
import { FACT_LABEL, type FactComparison, type FixKind, type ListingFact, type SurfaceReading } from "./contracts";

/**
 * Pure fix planning. Only 'differs' facts produce fixes. Strelva changes only
 * places it owns (booking hours, and Google when Release 2 is reached); a
 * website gets a Request to the agency; everything else is an owner to-do.
 * A Google address is never written: Google may ask to verify the listing again.
 */

export type PlannedFix = { surfaceKey: string; factKey: ListingFact | "page"; kind: FixKind; proposed: Record<string, unknown> };

export interface PlanContext {
  googleFix: boolean;
  hasAgency: boolean;
  /** The record's weekly hours, used to clip booking hours. */
  recordHours?: Array<{ day: number; opens: string; closes: string }>;
  booking: Record<string, { scope: string; weekly: Array<{ day: number; opens: string; closes: string }> }>;
  google: Record<string, { tenantId: string; locationId: string }>;
  websites: Record<string, { kind: "tenant" | "connected"; tenantId?: string; tenantStableId?: string; siteId?: string; siteUrl: string; platform?: string }>;
}

const differing = (reading: SurfaceReading): FactComparison[] => reading.facts.filter(fact => fact.state === "differs");

function clipBooking(weekly: Array<{ day: number; opens: string; closes: string }>, record: Array<{ day: number; opens: string; closes: string }>) {
  const out: Array<{ day: number; opens: string; closes: string }> = [];
  for (let day = 0; day < 7; day++) {
    const bookable: TimeRange[] = weekly.filter(item => item.day === day).map(({ opens, closes }) => ({ opens, closes }));
    const open: TimeRange[] = record.filter(item => item.day === day).map(({ opens, closes }) => ({ opens, closes }));
    for (const range of intersectRanges(bookable, open)) out.push({ day, ...range });
  }
  return out;
}

export function planFixes(readings: SurfaceReading[], ctx: PlanContext): PlannedFix[] {
  const out: PlannedFix[] = [];
  for (const reading of readings) {
    const facts = differing(reading);
    if (!facts.length) continue;
    const key = reading.surfaceKey;

    if (reading.kind === "booking") {
      const booking = ctx.booking[key];
      if (booking && facts.some(fact => fact.fact === "hours")) {
        const weekly = clipBooking(booking.weekly, ctx.recordHours ?? []);
        // Never propose clearing every bookable time when none were known to begin with.
        if (!weekly.length && !booking.weekly.length) continue;
        out.push({ surfaceKey: key, factKey: "hours", kind: "booking_hours", proposed: { scope: booking.scope, weekly } });
      }
      continue;
    }

    if (reading.kind === "google") {
      const target = ctx.google[key];
      for (const fact of facts) {
        if (fact.fact === "address") {
          out.push({ surfaceKey: key, factKey: "address", kind: "owner_todo",
            proposed: { lines: [`On Google: change the address to ${fact.expected ?? "your confirmed address"}. Google may ask you to verify the listing again.`] } });
        } else if ((fact.fact === "hours" || fact.fact === "special_hours") && ctx.googleFix && target) {
          if (!out.some(item => item.surfaceKey === key && item.kind === "google_hours")) {
            out.push({ surfaceKey: key, factKey: "hours", kind: "google_hours", proposed: { tenantId: target.tenantId, locationId: target.locationId } });
          }
        } else if (fact.fact === "phone" && ctx.googleFix && target) {
          out.push({ surfaceKey: key, factKey: "phone", kind: "google_info", proposed: { tenantId: target.tenantId, locationId: target.locationId, infoFields: ["phone"] } });
        } else {
          const noun = fact.fact === "special_hours" ? "special hours" : fact.fact;
          out.push({ surfaceKey: key, factKey: fact.fact === "special_hours" ? "special_hours" : fact.fact, kind: "owner_todo",
            proposed: { lines: [`On Google: set ${noun} to ${fact.expected ?? "your confirmed details"}.`] } });
        }
      }
      continue;
    }

    if (reading.kind === "website") {
      const site = ctx.websites[key];
      const lines = facts.map(fact => `${FACT_LABEL[fact.fact]}: change “${fact.shown ?? ""}” to “${fact.expected ?? ""}”`);
      out.push({ surfaceKey: key, factKey: "page", kind: ctx.hasAgency && site ? "site_request" : "owner_todo", proposed: { lines, ...(site ?? {}) } });
      continue;
    }

    out.push({ surfaceKey: key, factKey: "page", kind: "owner_todo",
      proposed: { lines: facts.map(fact => `${FACT_LABEL[fact.fact]}: change “${fact.shown ?? ""}” to “${fact.expected ?? ""}”`), note: "Strelva can't change Yelp. Change it on Yelp." } });
  }
  return out;
}

/** Stable under reordering; owner to-dos are not decisions, so they are not part of it. */
export function planHash(recordRevision: number, fixes: Array<Pick<PlannedFix, "surfaceKey" | "factKey" | "kind" | "proposed">>): string {
  const decided = fixes.filter(fix => fix.kind !== "owner_todo")
    .map(({ surfaceKey, factKey, kind, proposed }) => ({ surfaceKey, factKey, kind, proposed }))
    .sort((a, b) => `${a.surfaceKey}|${a.factKey}`.localeCompare(`${b.surfaceKey}|${b.factKey}`));
  return sha256(canonicalJson([recordRevision, decided]));
}

const label = (readings: SurfaceReading[], key: string) => readings.find(reading => reading.surfaceKey === key)?.label ?? key;
const hostOf = (url: unknown, fallback: string) => { try { return new URL(String(url)).hostname.replace(/^www\./, ""); } catch { return fallback; } };

/** The owner-readable lines for what approving does. */
export function planLines(fixes: Array<Pick<PlannedFix, "surfaceKey" | "factKey" | "kind" | "proposed">>, readings: SurfaceReading[]): string[] {
  const lines: string[] = [];
  const requests = new Map<string, string[]>();
  for (const fix of fixes) {
    const reading = readings.find(item => item.surfaceKey === fix.surfaceKey);
    const fact = reading?.facts.find(item => item.state === "differs" && (fix.factKey === "page" || item.fact === fix.factKey || (fix.factKey === "hours" && item.fact === "special_hours")));
    if (fix.kind === "booking_hours") {
      lines.push(`Booking page: booking times outside your hours are removed (${(reading?.facts.find(item => item.fact === "hours")?.shown ?? "outside your hours")}).`);
    } else if (fix.kind === "google_hours") {
      lines.push(`Google listing ${label(readings, fix.surfaceKey)}: hours set to your hours.`);
    } else if (fix.kind === "google_info") {
      lines.push(`Google listing ${label(readings, fix.surfaceKey)}: phone set to ${fact?.expected ?? "your phone"}.`);
    } else if (fix.kind === "site_request") {
      const host = hostOf(fix.proposed.siteUrl, label(readings, fix.surfaceKey));
      const parts = (reading?.facts ?? []).filter(item => item.state === "differs").map(item => `${FACT_LABEL[item.fact].toLowerCase()} to ${item.expected ?? ""}`);
      requests.set(host, [...(requests.get(host) ?? []), ...parts]);
    }
  }
  for (const [host, parts] of requests) lines.push(`${host}: your agency is asked to change ${parts.join("; ")}.`);
  return lines;
}
