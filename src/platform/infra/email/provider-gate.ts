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
export type ProviderGateDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };

/** Who a send is made for: the business, and the agency sending for it. */
export interface EmailProvider {
  businessWorkspaceId: string;
  /** Absent: the business's provider of record. */
  agencyWorkspaceId?: string;
}

let override: ProviderGateDb | null = null;
/** Tests may supply their own client. */
export function setProviderGateDb(db: ProviderGateDb | null): void {
  override = db;
}

/** The domain part of a from address, lowercased. */
export function senderDomain(fromAddress: string): string {
  return fromAddress.slice(fromAddress.lastIndexOf("@") + 1).trim().toLowerCase();
}

export async function providerEmailSendAllowed(provider: EmailProvider, sender: string): Promise<boolean> {
  try {
    const client = override ?? (getSupabase() as unknown as ProviderGateDb | null);
    if (!client) return false;
    const { data, error } = await client.rpc("provider_email_send_allowed", {
      p_workspace_id: z.string().uuid().parse(provider.businessWorkspaceId),
      p_agency_workspace_id: provider.agencyWorkspaceId ? z.string().uuid().parse(provider.agencyWorkspaceId) : null,
      p_sender: sender,
    });
    if (error) return false;
    return (Array.isArray(data) ? data[0] : data) === true;
  } catch {
    return false;
  }
}
