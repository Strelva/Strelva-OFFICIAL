/** Server-only public projection. SQL checks publication and tenant linkage;
 * app checks the same release gates as /biz. No provider fetch or writes. */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { publicBusinessVerification, type PublicBusinessVerification } from "@/platform/business-record/verification";
import { businessPagesReleaseEnabled } from "./business-pages";
import { connectedSitesPublicFor } from "./server";
import type { ConnectedSitesRpc } from "./store";

const rowSchema = z.object({ workspaceId: z.string().uuid(), verification: z.unknown() });
export async function readPublicBusinessVerification(input: { handle: string } | { tenantId: string }, deps: {
  db?: ConnectedSitesRpc; publicFor?: (workspaceId: string) => Promise<boolean>; now?: number;
} = {}): Promise<PublicBusinessVerification> {
  const unknown = () => publicBusinessVerification(null);
  if (!businessPagesReleaseEnabled()) return unknown();
  try {
    const db = deps.db ?? (getSupabase() as unknown as ConnectedSitesRpc | null);
    if (!db) return unknown();
    const { data, error } = await db.rpc("read_public_business_verification", {
      p_handle: "handle" in input ? input.handle : null,
      p_tenant_id: "tenantId" in input ? input.tenantId : null,
    });
    if (error || !data) return unknown();
    const row = rowSchema.parse(data);
    if (!(await (deps.publicFor ?? connectedSitesPublicFor)(row.workspaceId))) return unknown();
    return publicBusinessVerification(row.verification, deps.now);
  } catch { return unknown(); }
}
