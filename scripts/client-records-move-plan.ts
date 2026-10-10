/**
 * Core of scripts/client-records-move.ts, kept free of I/O so it is tested
 * directly. `backfill` copies what Redis holds into tenant_client_records
 * (dry run unless --apply); `parity` compares and records the day's result.
 */
import { CLIENT_RECORD_STORES, type ClientRecordStore } from "../src/platform/client-records/mirror";
import type { BackfillReport, ParityReport } from "../src/platform/client-records/move";
import { isLocalDatabaseUrl } from "./tenant-conversion";

export interface MoveOptions {
  command: "backfill" | "parity";
  stores: ClientRecordStore[];
  tenant?: string;
  apply: boolean;
  jacobsYes: boolean;
  json: boolean;
}

export function parseMoveArgs(argv: string[]): MoveOptions {
  const [command, ...rest] = argv;
  if (command !== "backfill" && command !== "parity") throw new Error("Usage: client-records-move.ts <backfill|parity> [tenant] [--store=a,b] [--apply] [--i-have-jacobs-yes] [--json]");
  const unknown = rest.filter((arg) => arg.startsWith("--") && !/^--(?:apply|json|i-have-jacobs-yes|store=[a-z_,]+)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  const storeArg = rest.find((arg) => arg.startsWith("--store="))?.slice("--store=".length);
  const stores = storeArg ? storeArg.split(",") : [...CLIENT_RECORD_STORES];
  const bad = stores.filter((s) => !(CLIENT_RECORD_STORES as readonly string[]).includes(s));
  if (bad.length) throw new Error(`Unknown store: ${bad.join(", ")}`);
  if (command === "parity" && rest.includes("--apply")) throw new Error("parity has no --apply; it only reads and records the result");
  const positional = rest.filter((arg) => !arg.startsWith("--"));
  return { command, stores: stores as ClientRecordStore[], tenant: positional[0], apply: rest.includes("--apply"),
    jacobsYes: rest.includes("--i-have-jacobs-yes"), json: rest.includes("--json") };
}

export interface MoveDeps {
  tenants(): Promise<string[]>;
  backfill(store: ClientRecordStore, tenant: string, apply: boolean): Promise<BackfillReport>;
  parity(store: ClientRecordStore, tenant: string): Promise<ParityReport>;
  log(line: string): void;
}

export async function runClientRecordMove(options: MoveOptions & { databaseUrl?: string }, deps: MoveDeps) {
  const database = options.databaseUrl ? (isLocalDatabaseUrl(options.databaseUrl) ? "local" : "not local") : "not configured";
  if (options.apply) {
    if (database === "not configured") throw new Error("Refusing --apply: no database is configured.");
    if (database === "not local" && !options.jacobsYes) {
      throw new Error("Refusing --apply: the database is not a local loopback host. A production backfill needs Jacob's yes (--i-have-jacobs-yes).");
    }
  }
  // Parity records one row per store and tenant per day: still a write.
  if (options.command === "parity" && database === "not local" && !options.jacobsYes) {
    throw new Error("Refusing parity against a non-local database: it records results there. Needs Jacob's yes (--i-have-jacobs-yes).");
  }
  const tenants = options.tenant ? [options.tenant] : await deps.tenants();
  const backfills: BackfillReport[] = [];
  const parities: ParityReport[] = [];
  for (const store of options.stores) {
    for (const tenant of tenants) {
      if (options.command === "backfill") {
        const report = await deps.backfill(store, tenant, options.apply);
        backfills.push(report);
        if (report.redisRecords) deps.log(`${options.apply ? "copied" : "would copy"} ${store} ${tenant}: ${report.redisRecords} in Redis, ${report.written} written, ${report.unchanged} already there, ${report.failed.length} failed`);
      } else {
        const report = await deps.parity(store, tenant);
        parities.push(report);
        if (!report.ok || report.redisCount) deps.log(`${report.ok ? "parity" : "NO PARITY"} ${store} ${tenant}: redis ${report.redisCount}, postgres ${report.postgresCount}, missing ${report.missing.length}, mismatched ${report.mismatched.length}`);
      }
    }
  }
  return {
    command: options.command,
    apply: options.apply,
    database,
    backfills,
    parities,
    totals: {
      redisRecords: backfills.reduce((n, r) => n + r.redisRecords, 0),
      written: backfills.reduce((n, r) => n + r.written, 0),
      failed: backfills.reduce((n, r) => n + r.failed.length, 0),
      outOfParity: parities.filter((p) => !p.ok).length,
    },
  };
}
