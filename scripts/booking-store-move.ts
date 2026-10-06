#!/usr/bin/env npx tsx
/**
 * Move today's bookings into the one booking store (bookings spec, "Moving
 * today's bookings", steps 4 and 5).
 *
 *   npx tsx scripts/booking-store-move.ts backfill                  # dry run, every tenant (local database only)
 *   npx tsx scripts/booking-store-move.ts backfill twintrees-a      # one tenant
 *   npx tsx scripts/booking-store-move.ts backfill --apply          # local database only
 *   npx tsx scripts/booking-store-move.ts backfill --apply --i-have-jacobs-yes   # production, Jacob's call
 *   npx tsx scripts/booking-store-move.ts parity                    # compare and record (local only)
 *   npx tsx scripts/booking-store-move.ts schedules [--apply]       # workspace schedule reservations without a receipt
 *
 * A dry run reads legacy bookings, settings and API receipts and writes
 * nothing; against production it needs Jacob's yes because it reads client
 * data. --apply writes through `record_tenant_booking`, the RPC the
 * dual-write uses; reruns are no-ops. Overlaps the legacy store let through
 * are refused by the store and listed. Parity records one result per tenant
 * per day; reads flip (STRELVA_BOOKING_STORE_READ=postgres) only after 7 days
 * in a row. Needs 20261008141000_booking_store.sql applied.
 */
import "../src/register-workspace-ports"; // workspace ports src/lib declares (Strelva Reborn section 7)
import { getSupabase } from "../src/platform/infra/db/client";
import { getAllTenants } from "../src/lib/tenants";
import { backfillScheduleReservations, backfillTenantBookings, checkTenantBookingParity } from "../src/platform/bookings/move";
import { legacyBookingPorts, scheduleReservationPorts } from "../src/platform/bookings/legacy-ports";
import { parseBookingMoveArgs, runBookingMove } from "./booking-store-move-plan";

async function tenants(): Promise<string[]> {
  const db = getSupabase();
  if (!db) return (await getAllTenants()).map((t) => t.id);
  const { data, error } = await db.from("tenants").select("id").order("id");
  if (error) throw new Error(`Tenant read failed: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

async function main() {
  const options = parseBookingMoveArgs(process.argv.slice(2));
  const outcome = await runBookingMove({ ...options, databaseUrl: process.env.SUPABASE_URL }, {
    tenants,
    backfill: (tenant, apply) => backfillTenantBookings(tenant, { apply, ports: legacyBookingPorts }),
    parity: (tenant) => checkTenantBookingParity(tenant, { ports: legacyBookingPorts }),
    schedules: (apply) => backfillScheduleReservations({ apply, ports: scheduleReservationPorts }),
    log: options.json ? () => undefined : (line) => console.log(line),
  });
  if (options.json) console.log(JSON.stringify(outcome, null, 2));
  else console.log(`${outcome.command}${outcome.apply ? "" : " (dry run)"} on ${outcome.database} database: ${JSON.stringify(outcome.totals)}`);
  if (outcome.totals.failed > 0 || outcome.totals.conflicts > 0 || outcome.totals.outOfParity > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
