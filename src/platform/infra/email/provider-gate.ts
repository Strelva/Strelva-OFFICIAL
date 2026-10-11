/**
 * The email gate for a send made for a business by its agency (agency 1.0
 * #255; public.provider_email_send_allowed, 20261014100000). The agency
 * (default: the business's provider of record) must hold an active provider
 * seat, be verified for email (agency_effect_allowed), and hold the
 * business's mandate for the sending domain the mail goes out from. The same
 * rule for every agency, Strelva's included. Fails closed.
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";

type DbError = { message?: string; code?: string } | null;
export type AgencyGateDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };

/** Who a send is made for: the business, and the agency sending for it. */
export interface EmailAgency {
  businessWorkspaceId: string;
  /** Absent: the business's provider of record. */
  agencyWorkspaceId?: string;
}

let override: AgencyGateDb | null = null;
/** Tests may supply their own client. */
export function setAgencyGateDb(db: AgencyGateDb | null): void {
  override = db;
}

/** The domain part of a from address, lowercased. */
export function senderDomain(fromAddress: string): string {
  return fromAddress.slice(fromAddress.lastIndexOf("@") + 1).trim().toLowerCase();
}

export async function agencyEmailSendAllowed(agency: EmailAgency, sender: string): Promise<boolean> {
  try {
    const client = override ?? (getSupabase() as unknown as AgencyGateDb | null);
    if (!client) return false;
    const { data, error } = await client.rpc("provider_email_send_allowed", {
      p_workspace_id: z.string().uuid().parse(agency.businessWorkspaceId),
      p_agency_workspace_id: agency.agencyWorkspaceId ? z.string().uuid().parse(agency.agencyWorkspaceId) : null,
      p_sender: sender,
    });
    if (error) return false;
    return (Array.isArray(data) ? data[0] : data) === true;
  } catch {
    return false;
  }
}

/** @deprecated Use AgencyGateDb. */
export type ProviderGateDb = AgencyGateDb;
/** @deprecated Use EmailAgency. The email option's provider key stays compatible. */
export type EmailProvider = EmailAgency;
/** @deprecated Use setAgencyGateDb. */
export const setProviderGateDb = setAgencyGateDb;
/** @deprecated Use agencyEmailSendAllowed. */
export const providerEmailSendAllowed = agencyEmailSendAllowed;
