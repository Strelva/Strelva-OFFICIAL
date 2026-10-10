#!/usr/bin/env npx tsx
/**
 * Scrubbed local copy of production, for rehearsing tenant -> workspace
 * conversion (Strelva Reborn section 3). Runbook:
 * docs/operations/scrubbed-production-copy.md.
 *
 *   pnpm scrubbed-copy create --out=<dir> --source=<postgres host> --source-redis=<upstash host> --i-have-jacobs-yes
 *   pnpm scrubbed-copy dry-run --out=<dir>
 *   pnpm scrubbed-copy serve --out=<dir> [--port=<bridge port>]
 *
 * create reads the source with one read-only Postgres transaction and
 * read-only Redis commands, scrubs in memory, refuses to finish if any
 * original email, phone or secret survives, and loads only into a local
 * cluster and a local redis-server. Source credentials come from
 * SCRUBBED_COPY_SOURCE_DATABASE_URL, SCRUBBED_COPY_SOURCE_REDIS_REST_URL and
 * SCRUBBED_COPY_SOURCE_REDIS_REST_TOKEN, never from arguments.
 */
import "../src/register-workspace-ports"; // workspace ports src/lib declares (Strelva Reborn section 7)
import path from "node:path";
import { createCopy, defaultSaltFile, dryRunCopy, startCopy } from "./scrubbed-copy/run";
import { projectDevFiles } from "./scrubbed-copy/dev-files";
import { RefusalError } from "./scrubbed-copy/safety";
import { leadSubmissionHash } from "../src/lib/leads";
import { siteDocumentHash, type SiteDocument } from "../src/products/websites";

const repoRoot = path.resolve(__dirname, "..");

const FLAGS = /^--(?:out|source|source-redis|salt-file|dest-database-url|grandfathered|port|tenants)=.+$|^--(?:i-have-jacobs-yes|skip-redis|include-inactive|replace|no-rehearse)$/;

export function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  if (!command || !["create", "dry-run", "serve"].includes(command)) {
    throw new RefusalError("usage: scrubbed-copy <create|dry-run|serve> --out=<dir> [...]; see docs/operations/scrubbed-production-copy.md.");
  }
  const unknown = rest.filter((arg) => !FLAGS.test(arg));
  if (unknown.length) throw new RefusalError(`unknown argument(s): ${unknown.map((arg) => arg.split("=")[0]).join(", ")}.`);
  const value = (name: string) => rest.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const flag = (name: string) => rest.includes(`--${name}`);
  const out = value("out");
  return {
    command,
    out: out ? path.resolve(out) : "",
    source: value("source"),
    sourceRedis: value("source-redis"),
    saltFile: value("salt-file") ?? defaultSaltFile(),
    destDatabaseUrl: value("dest-database-url"),
    grandfathered: value("grandfathered"),
    port: value("port") ? Number(value("port")) : undefined,
    tenants: value("tenants")?.split(",").filter(Boolean),
    confirmed: flag("i-have-jacobs-yes"),
    skipRedis: flag("skip-redis"),
    includeInactive: flag("include-inactive"),
    replace: flag("replace"),
    rehearse: !flag("no-rehearse"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new RefusalError("--out=<absolute directory> is required.");
  const log = (line: string) => console.log(line);

  if (args.command === "create") {
    const manifest = await createCopy({ ...args, repoRoot, env: process.env }, {
      documentHash: (document) => siteDocumentHash(document as SiteDocument),
      leadHash: (lead) => leadSubmissionHash({ id: "", createdAt: "", ...lead }),
      projectDevFiles,
      log,
    });
    console.log(`Scrubbed copy ready at ${args.out}`);
    console.log(`  tenants: ${manifest.tenants.length} (${manifest.tenantSelection})`);
    console.log(`  postgres rows: ${Object.values(manifest.postgres.tables).reduce((sum, count) => sum + count, 0)}; pending migrations applied on top: ${manifest.schema.appliedAfterLoad.length}`);
    console.log(`  redis keys: ${manifest.redis ? Object.values(manifest.redis.keys).reduce((sum, count) => sum + count, 0) : "skipped"}`);
    console.log(`  foreign key orphans: ${Object.keys(manifest.postgres.foreignKeyOrphans).length ? JSON.stringify(manifest.postgres.foreignKeyOrphans) : "none"}`);
    console.log(`  leak check: passed (${manifest.leakCheck.emailsChecked} emails, ${manifest.leakCheck.phonesChecked} phones, ${manifest.leakCheck.secretsChecked} secrets)`);
    console.log(`Receipt: ${path.join(args.out, "manifest.json")}. Next: pnpm scrubbed-copy dry-run --out=${args.out}`);
    return;
  }

  if (args.command === "dry-run") {
    const report = await dryRunCopy(args.out, { repoRoot, env: process.env, tenants: args.tenants, rehearse: args.rehearse, log });
    for (const entry of report.tenants) {
      const counts = entry.counts ? `facts=${entry.counts.facts} services=${entry.counts.services} people=${entry.counts.people} contacts=${entry.counts.contacts} (leads ${entry.counts.leadsRead}, bookings ${entry.counts.bookingsRead})` : "";
      const rehearsal = entry.rehearsal ? (entry.rehearsal.applied ? "rehearsal applied (rolled back)" : `rehearsal FAILED: ${entry.rehearsal.error}`) : "";
      console.log(`${entry.planned ? "ok  " : "FAIL"} ${entry.slug} ${entry.planned ? counts : entry.error} ${rehearsal}`);
    }
    console.log(`${report.summary.planned}/${report.summary.tenants} planned, ${report.summary.rehearsedOk} rehearsed, ${report.summary.failed} failed. Report: ${path.join(args.out, "dry-run-report.json")}`);
    if (report.summary.failed) process.exitCode = 1;
    return;
  }

  const running = await startCopy(args.out, { env: process.env, bridgePort: args.port });
  console.log("Scrubbed copy is running (Ctrl-C to stop).");
  if (running.target) console.log(`  postgres: psql -h ${running.target.env.PGHOST} -p ${running.target.env.PGPORT} -d postgres`);
  if (running.bridge) console.log(`  redis (Upstash REST): ${running.bridge.url}`);
  console.log(`  app env: ${path.join(args.out, "copy.env")} plus UPSTASH_REDIS_REST_URL/TOKEN below; dev files in ${path.join(args.out, "dev")}`);
  if (running.bridge) console.log(`  UPSTASH_REDIS_REST_URL=${running.bridge.url}\n  UPSTASH_REDIS_REST_TOKEN=${running.bridge.token}`);
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await running.stop();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
