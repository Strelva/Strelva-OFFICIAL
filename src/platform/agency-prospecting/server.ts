import { resolveAgencyEmailIdentity, resolveOwnerBrand } from "@/platform/agency-brand/server";
import { getSupabase } from "@/platform/infra/db/client";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";

export function agencyProspectingEnabled(): boolean {
  return process.env.STRELVA_AGENCY_PROSPECTING_RELEASE === "1";
}

export class AgencyProspectingError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

type Row = Record<string, unknown>;
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = getSupabase();
  if (!db) throw new AgencyProspectingError("Agency prospecting is temporarily unavailable.", 503);
  const { data, error } = await (db as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(name, args);
  if (error) {
    if (error.message.includes("agency_prospect_quota")) throw new AgencyProspectingError("This agency has reached its daily check limit. Please try tomorrow.", 429);
    if (error.message.includes("agency_prospect_access")) throw new AgencyProspectingError("Agency membership is required.", 403);
    throw new AgencyProspectingError("Agency prospecting is temporarily unavailable.", 503);
  }
  return data;
}

export async function resolveAgencyAttribution(slug: unknown): Promise<AgencyAttribution | undefined> {
  // Preserve the public, unattributed path when the new feature is off.
  if (!agencyProspectingEnabled() || slug === undefined || slug === null) return undefined;
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw new AgencyProspectingError("Invalid agency link.", 400);
  }
  const rows = await rpc("agency_prospecting_profile", { p_slug: slug });
  const row = (Array.isArray(rows) ? rows[0] : null) as Row | undefined;
  if (!row) throw new AgencyProspectingError("This agency check is unavailable.", 404);
  const contactUrl = String(row.contact_url);
  try {
    const parsed = new URL(contactUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Invalid agency contact URL");
  } catch { throw new AgencyProspectingError("This agency check is unavailable.", 503); }
  const brand = await resolveOwnerBrand(String(row.workspace_id));
  return { workspaceId: String(row.workspace_id), slug: String(row.slug), name: brand.name,
    contactUrl, brand: { logoUrl: brand.logoUrl, accentColor: brand.agencyId ? brand.accentColor : null }, ...(brand.replyTo ? { replyTo: brand.replyTo } : {}) };
}

/** Durable quota admission before expensive scoring; failures never fall back to Slack. */
export async function admitAgencyCheck(agency: AgencyAttribution): Promise<void> {
  if (!agencyProspectingEnabled()) throw new AgencyProspectingError("Agency prospecting is unavailable.", 503);
  await rpc("agency_prospect_admit", { p_workspace_id: agency.workspaceId });
}

export async function captureAgencyProspect(input: {
  agency: AgencyAttribution; source: "monitor" | "audit"; resultId: string;
  name: string; email: string; url: string | null; business: string; score: number; grade: string;
}): Promise<void> {
  if (!agencyProspectingEnabled()) throw new AgencyProspectingError("Agency prospecting is unavailable.", 503);
  await rpc("agency_prospect_capture", { p_workspace_id: input.agency.workspaceId, p_source: input.source,
    p_result_id: input.resultId, p_name: input.name, p_email: input.email, p_url: input.url,
    p_business: input.business, p_score: input.score, p_grade: input.grade });
}

export async function agencyReplyTo(agency: AgencyAttribution): Promise<string> {
  const rows = await rpc("agency_prospecting_profile", { p_slug: agency.slug });
  const row = (Array.isArray(rows) ? rows[0] : null) as Row | undefined;
  if (!row || row.workspace_id !== agency.workspaceId) throw new AgencyProspectingError("Agency email is unavailable.", 503);
  return (await resolveAgencyEmailIdentity(agency.workspaceId))?.replyTo ?? process.env.REPLY_TO_EMAIL ?? "hello@strelva.com";
}

export interface AgencyProspect {
  id: string; name: string; email: string; url: string | null; business: string;
  source: "monitor" | "audit"; result_id: string; score: number; grade: string; created_at: string;
}
export async function listAgencyProspects(workspaceId: string, userId: string, email: string): Promise<AgencyProspect[]> {
  if (!agencyProspectingEnabled()) throw new AgencyProspectingError("Agency prospecting is unavailable.", 404);
  return await rpc("agency_prospect_list", { p_workspace_id: workspaceId, p_user_id: userId, p_email: email }) as AgencyProspect[];
}
