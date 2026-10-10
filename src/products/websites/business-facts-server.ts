import { getSupabase } from "@/platform/infra/db/client";
import { websiteRebuildReleaseEnabledForTenant } from "./rebuild-release";
import { websiteBusinessFactsSchema, type WebsiteBusinessFacts } from "./business-facts";
import { readConfirmedBusinessFacts } from "@/platform/business-record";
import type { WorkspaceActor } from "@/platform/workspaces/types";

const CANDIDATE_FACTS = ["display_name", "phone", "email", "address", "hours"] as const;

/** Only confirmed facts enter a candidate: an operator's or agency's edit
 * waits for the owner's decision like any other provider's (#509). */
export async function readCandidateBusinessFacts(actor: WorkspaceActor, workspaceId: string, read = readConfirmedBusinessFacts): Promise<WebsiteBusinessFacts | null> {
  if (process.env.STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED !== "1") return null;
  try {
    const confirmed = await read(actor, workspaceId);
    return websiteBusinessFactsSchema.parse({ revision: confirmed.revision,
      facts: Object.fromEntries(CANDIDATE_FACTS.flatMap(key => confirmed.facts[key] === undefined ? [] : [[key, confirmed.facts[key]]])),
      services: confirmed.services,
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
