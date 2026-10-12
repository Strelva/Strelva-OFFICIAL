/** Daily read-only comparison. The sole write is an atomic parity batch.
 * Never backfills, repairs, flips reads, sends mail or writes booking data. */
import { bookingStoreWriteEnabled } from "@/platform/bookings/flags";
import { legacyBookingPorts } from "@/server/bookings/legacy-ports";
import { checkTenantBookingParity, type BookingParityReport, type LegacyBookingPorts } from "@/platform/bookings/move";
import { bookingStoreDb, type BookingStoreDb } from "@/platform/bookings/store";

export interface BookingParitySweepDeps {
  tenants(): Promise<string[]>;
  enabled?: () => boolean;
  db?: BookingStoreDb | null;
  ports?: LegacyBookingPorts;
  compare?: (tenant: string) => Promise<BookingParityReport>;
  now?: () => number;
  deadlineMs?: number;
}

export async function runBookingParitySweep(deps: BookingParitySweepDeps) {
  const result = { status: "ran" as "ran" | "disabled" | "unconfigured", recorded: 0, outOfParity: [] as string[], failed: 0, errors: [] as Array<{ tenant: string; reason: string }> };
  if (!(deps.enabled ?? bookingStoreWriteEnabled)()) return { ...result, status: "disabled" as const };
  const db = deps.db === undefined ? bookingStoreDb() : deps.db;
  if (!db) return { ...result, status: "unconfigured" as const, failed: 1 };
  const now = deps.now ?? Date.now;
  const started = now();
  try {
    // Authoritative list at the app edge, never a Redis-cached tenant list.
    const tenants = [...new Set(await deps.tenants())].sort();
    const reports: BookingParityReport[] = [];
    for (const tenant of tenants) {
      try {
        if (now() - started >= (deps.deadlineMs ?? 90_000)) throw new Error("deadline");
        reports.push(await (deps.compare?.(tenant) ?? checkTenantBookingParity(tenant, {
          ports: deps.ports ?? legacyBookingPorts, db, record: false, days: 60,
        })));
      } catch (error) {
        result.errors.push({ tenant, reason: error instanceof Error ? error.message : "compare_failed" });
      }
    }
    result.outOfParity = reports.filter((r) => !r.ok).map((r) => r.tenant);
    result.failed = result.errors.length;
    // Include failures as negative parity rows. The batch validates coverage
    // against all tenants and commits together: partial/empty runs never pass.
    const batch = tenants.map((tenant) => {
      const report = reports.find((r) => r.tenant === tenant);
      return { tenant, legacyCount: report?.legacyCount ?? 0, storeCount: report?.storeCount ?? 0,
        missing: report?.missing.length ?? 1,
        mismatched: report ? report.mismatched.length + (report.slotDifferencesExplained ? 0 : report.slotDifferences.length) : 1 };
    });
    const { error } = await db.rpc("record_booking_parity_batch", { p_reports: batch });
    if (error) throw new Error("parity_batch_failed");
    result.recorded = batch.length;
  } catch (error) {
    result.failed++;
    result.errors.push({ tenant: "*", reason: error instanceof Error ? error.message : "sweep_failed" });
  }
  return result;
}
