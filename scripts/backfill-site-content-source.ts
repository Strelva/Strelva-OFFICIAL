#!/usr/bin/env npx tsx
/**
 * Declares customRepo.contentSource = "strelva" on the client repos whose
 * release-manifest.json entry lists the v1 `content` endpoint and whose tenant
 * has no declaration yet. The Postgres path is the migration
 * 20261027120100_site_content_source_backfill.sql; this covers
 * non-Postgres TENANTS_SOURCE environments and the local dev store.
 *
 * Dry run by default; `--apply` writes. Local stores only: any SUPABASE_URL or
 * UPSTASH_REDIS_REST_URL that is not loopback is refused.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-site-content-source.ts
 *   npx tsx --env-file=.env.local scripts/backfill-site-content-source.ts --apply
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { isLocalDatabaseUrl } from "./tenant-conversion";
import type { CustomRepoMetadata, TenantConfig } from "../src/lib/types";

interface ManifestRepo { tenant: string; v1Endpoints: string[] }

export function contentReadingTenants(manifest: { customRepoWorkspace: { repos: ManifestRepo[] } }): string[] {
  return manifest.customRepoWorkspace.repos.filter((repo) => repo.v1Endpoints.includes("content")).map((repo) => repo.tenant);
}

export interface ContentSourceChange { id: string; customRepo: CustomRepoMetadata }

/** Pure: which tenants need a declaration, and what their customRepo becomes. */
export function planContentSourceBackfill(
  tenantIds: string[], lookup: (id: string) => Pick<TenantConfig, "customRepo"> | undefined, checkedAt: string,
): ContentSourceChange[] {
  const changes: ContentSourceChange[] = [];
  for (const id of tenantIds) {
    const tenant = lookup(id);
    if (!tenant || tenant.customRepo?.contentSource) continue;
    changes.push({ id, customRepo: { ...tenant.customRepo, contentSource: "strelva", declarationCheckedAt: checkedAt } });
  }
  return changes;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--apply");
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(", ")}. Usage: backfill-site-content-source [--apply]`);
  const apply = args.includes("--apply");
  for (const name of ["SUPABASE_URL", "UPSTASH_REDIS_REST_URL"] as const) {
    if (process.env[name] && !isLocalDatabaseUrl(process.env[name])) throw new Error(`Refusing: ${name} is not a local loopback host. This script writes local stores only.`);
  }
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "release-manifest.json"), "utf8")) as { customRepoWorkspace: { repos: ManifestRepo[] } };
  const { getTenantConfig, updateTenant } = await import("../src/lib/tenants");
  const ids = contentReadingTenants(manifest);
  const found = new Map<string, TenantConfig | undefined>();
  for (const id of ids) found.set(id, await getTenantConfig(id));
  const changes = planContentSourceBackfill(ids, (id) => found.get(id), new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
  for (const change of changes) {
    console.log(`${apply ? "[set]" : "[would set]"} ${change.id}: customRepo.contentSource = strelva`);
    if (apply) await updateTenant(change.id, { customRepo: change.customRepo });
  }
  if (!changes.length) console.log("Nothing to declare.");
}

if (process.argv[1]?.endsWith("backfill-site-content-source.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
