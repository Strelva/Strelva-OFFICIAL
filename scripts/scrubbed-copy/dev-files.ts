/**
 * Project scrubbed Postgres rows into the dev files the app reads when no
 * database is configured (TENANTS_SOURCE/CONTENT_SOURCE/DATA_SOURCE=file):
 * dev-tenants.json and dev-content-{tenant}.json. Uses the app's own row
 * mappers so the conversion CLI sees exactly what the Postgres readers return.
 *
 * The app cannot read the local Postgres cluster directly: it reaches Postgres
 * only through the Supabase REST client, and no local PostgREST exists here.
 */
import "../../src/register-workspace-ports"; // workspace ports src/lib declares (Strelva Reborn section 7)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { rowToTenant } from "../../src/lib/tenants";
import { SECTION_TO_TYPE, transformSanityImages } from "../../src/lib/storage/content-store";
import { mapPgBookingRow } from "../../src/platform/bookings/legacy-store";
import type { Row } from "../../src/platform/infra/db/client";
import type { ContentSection } from "../../src/lib/types";

const TYPE_TO_SECTION = new Map(Object.entries(SECTION_TO_TYPE).map(([section, type]) => [type, section as ContentSection]));

export function projectDevFiles(input: { devDir: string; tenants: Array<Record<string, unknown>>; content: Array<Record<string, unknown>>; bookings: Array<Record<string, unknown>> }): void {
  const tenants = input.tenants.map((row) => rowToTenant(row as unknown as Row<"tenants">)).sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(path.join(input.devDir, "dev-tenants.json"), `${JSON.stringify(tenants, null, 2)}\n`, { mode: 0o600 });
  for (const tenant of tenants) {
    const store: Record<string, unknown> = {};
    for (const row of input.content) {
      if (row.tenant_id !== tenant.id) continue;
      const section = TYPE_TO_SECTION.get(String(row.section));
      if (!section || !row.data || typeof row.data !== "object") continue;
      store[section] = transformSanityImages(section, row.data as Record<string, unknown>);
    }
    const bookings = input.bookings
      .filter((row) => row.tenant_id === tenant.id)
      .map((row) => mapPgBookingRow(row as unknown as Row<"bookings">));
    if (bookings.length) store[`__bookings_${tenant.id}`] = bookings;
    writeFileSync(path.join(input.devDir, `dev-content-${tenant.id}.json`), `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  }
}
