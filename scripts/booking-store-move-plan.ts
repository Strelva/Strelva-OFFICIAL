/**
 * Core of scripts/booking-store-move.ts, kept free of I/O so it is tested
 * directly. `backfill` copies legacy bookings, settings and API receipts into
 * the one booking store (dry run unless --apply); `parity` compares legacy and
 * store (bookings and 60 days of offered slots) and records the day's result;
 * `schedules` copies workspace schedule reservations that have no public
 * receipt (dry run unless --apply).
 */
import type { BookingBackfillReport, BookingParityReport, ScheduleBackfillReport } from "../src/platform/bookings/move";
import { isLocalDatabaseUrl } from "./tenant-conversion";

export interface BookingMoveOptions {
  command: "backfill" | "parity" | "schedules";
  tenant?: string;
  apply: boolean;
  jacobsYes: boolean;
  json: boolean;
}

export function parseBookingMoveArgs(argv: string[]): BookingMoveOptions {
  const [command, ...rest] = argv;
  if (command !== "backfill" && command !== "parity" && command !== "schedules") {
    throw new Error("Usage: booking-store-move.ts <backfill|parity|schedules> [tenant] [--apply] [--i-have-jacobs-yes] [--json]");
  }
  const unknown = rest.filter((arg) => arg.startsWith("--") && !/^--(?:apply|json|i-have-jacobs-yes)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  if (command === "parity" && rest.includes("--apply")) throw new Error("parity has no --apply; it only reads and records the result");
  const positional = rest.filter((arg) => !arg.startsWith("--"));
  return { command, tenant: positional[0], apply: rest.includes("--apply"), jacobsYes: rest.includes("--i-have-jacobs-yes"), json: rest.includes("--json") };
}

export interface BookingMoveDeps {
  tenants(): Promise<string[]>;
  backfill(tenant: string, apply: boolean): Promise<BookingBackfillReport>;
  parity(tenant: string): Promise<BookingParityReport>;
  /** Every workspace schedule at once (schedules are not per tenant). */
  schedules?(apply: boolean): Promise<ScheduleBackfillReport>;
  log(line: string): void;
}

export async function runBookingMove(options: BookingMoveOptions & { databaseUrl?: string }, deps: BookingMoveDeps) {
  const database = options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "not local") : "not configured";
  if (options.apply) {
    if (database === "not configured") throw new Error("Refusing --apply: no database is configured.");
    if (database === "not local" && !options.jacobsYes) {
      throw new Error("Refusing --apply: the database is not a local loopback host. A production backfill needs Jacob's yes (--i-have-jacobs-yes).");
    }
  }
  // A dry run against production still reads production data: Jacob's yes too.
  if (!options.apply && database === "not local" && !options.jacobsYes) {
    throw new Error("Refusing to read a non-local database: the dry run reads client bookings. Needs Jacob's yes (--i-have-jacobs-yes).");
  }
  if (options.command === "parity" && database === "not local" && !options.jacobsYes) {
    throw new Error("Refusing parity against a non-local database: it records results there. Needs Jacob's yes (--i-have-jacobs-yes).");
  }
  let schedules: ScheduleBackfillReport | null = null;
  if (options.command === "schedules") {
    if (!deps.schedules) throw new Error("schedules is not available here");
    schedules = await deps.schedules(options.apply);
    deps.log(`${options.apply ? "copied" : "would copy"} ${schedules.reservations} schedule reservations without a receipt from ${schedules.schedules} schedules (${schedules.withReceipt} come with a tenant's receipts); ${schedules.written} written, ${schedules.unchanged} already there, ${schedules.conflicts.length} refused as overlapping, ${schedules.failed.length} failed`);
  }
  const tenants = options.command === "schedules" ? [] : options.tenant ? [options.tenant] : await deps.tenants();
  const backfills: BookingBackfillReport[] = [];
  const parities: BookingParityReport[] = [];
  for (const tenant of tenants) {
    if (options.command === "backfill") {
      const report = await deps.backfill(tenant, options.apply);
      backfills.push(report);
      if (report.legacyBookings || report.reservations || report.settings !== "none") {
        deps.log(`${options.apply ? "copied" : "would copy"} ${tenant}: ${report.legacyBookings} legacy bookings, ${report.reservations} API receipts, settings ${report.settings}; ${report.written} written, ${report.unchanged} already there, ${report.conflicts.length} refused as overlapping, ${report.failed.length} failed`);
      }
      for (const note of report.notes) deps.log(`  note ${tenant}: ${note}`);
    } else {
      const report = await deps.parity(tenant);
      parities.push(report);
      if (!report.ok || report.legacyCount) {
        deps.log(`${report.ok ? "parity" : "NO PARITY"} ${tenant}: legacy ${report.legacyCount}, store ${report.storeCount}, missing ${report.missing.length}, mismatched ${report.mismatched.length}, slot differences ${report.slotDifferences.length}${report.slotDifferencesExplained ? " (explained: record hours narrow)" : ""}`);
      }
    }
  }
  return {
    command: options.command,
    apply: options.apply,
    database,
    backfills,
    parities,
    schedules,
    totals: {
      legacyBookings: backfills.reduce((n, r) => n + r.legacyBookings, 0),
      written: backfills.reduce((n, r) => n + r.written, 0) + (schedules?.written ?? 0),
      conflicts: backfills.reduce((n, r) => n + r.conflicts.length, 0) + (schedules?.conflicts.length ?? 0),
      failed: backfills.reduce((n, r) => n + r.failed.length, 0) + (schedules?.failed.length ?? 0),
      outOfParity: parities.filter((p) => !p.ok).length,
    },
  };
}
