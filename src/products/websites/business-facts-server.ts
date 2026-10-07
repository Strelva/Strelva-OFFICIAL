import { getSupabase } from "@/platform/infra/db/client";
import { websiteRebuildReleaseEnabledForTenant } from "./rebuild-release";
import { websiteBusinessFactsSchema, type WebsiteBusinessFacts } from "./business-facts";
import { readBusinessRecord } from "@/platform/business-record";
import type { WorkspaceActor } from "@/platform/workspaces/types";

export async function readCandidateBusinessFacts(actor: WorkspaceActor, workspaceId: string): Promise<WebsiteBusinessFacts | null> {
  if (process.env.STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED !== "1") return null;
  try {
    const record = await readBusinessRecord(actor, workspaceId);
    const allowed = new Set(["display_name", "phone", "email", "address", "hours"]);
    return websiteBusinessFactsSchema.parse({ revision: record.revision,
      facts: Object.fromEntries(Object.entries(record.facts).filter(([key, value]) => allowed.has(key) && value && (value.verified || value.source === "owner" || value.source === "operator")).map(([key, value]) => [key, value!.value])),
      services: record.services.filter(value => value.active && (value.verified || value.source === "owner" || value.source === "operator")).slice(0,40).map(({ name, description, priceText }) => ({ name, description, priceText })),
    });
  } catch { return null; }
}

/** Read only the public facts of this publication's own business. No owner,
 * contacts, people, grants or provider secrets enter the page. No cache: a
 * successful request sees the current confirmed record. On outage the issued
 * document remains available, never a partial or foreign record. */
export async function readHostedBusinessFacts(tenantId: string): Promise<WebsiteBusinessFacts | null> {
  if (process.env.STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED !== "1") return null;
  try {
    if (!await websiteRebuildReleaseEnabledForTenant(tenantId)) return null;
    const db = getSupabase(); if (!db) return null;
    const { data, error } = await db.rpc("read_hosted_website_business_facts", { p_tenant_id: tenantId });
    if (error || !data) return null;
    return websiteBusinessFactsSchema.parse(data);
  } catch { return null; }
}
