import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { localSql, type Person } from "./journeys";
const fixtureSchema = z.object({ workspaceId: z.uuid(), agreementVersion: z.string(), rateReference: z.string(),
 listing: z.object({ id: z.uuid(), source_revision_id: z.uuid(), creator_workspace_id: z.uuid(), definition_id: z.literal("private_staff_requests") }).passthrough(),
 installation: z.object({ id: z.uuid(), source_revision_id: z.uuid(), creator_workspace_id: z.uuid(), version_lineage_id: z.uuid(), status: z.literal("active") }).passthrough(),
});
/** Only called after supplemental preflight and actual Auth bootstrap. */
export function creatorMaintenanceFixture(owner: Person, manager: Person, businessId: string, agencyId: string) {
 const suffix = randomUUID();
 const result = fixtureSchema.parse(localSql(readFileSync(resolve(process.cwd(), "tests/support/creator-maintenance-native.sql"), "utf8"), owner.userId, owner.email, manager.userId, manager.email, businessId, agencyId, `fictional-local-maintenance-${suffix}`, `fictional-local-rate-${suffix}`));
 if (result.listing.creator_workspace_id !== result.workspaceId || result.installation.creator_workspace_id !== result.workspaceId || result.installation.source_revision_id !== result.listing.source_revision_id) throw new Error("Creator fixture source identity differs.");
 return result;
}
export function creatorMaintenanceSnapshot(listingId: string, installationId: string) {
 return localSql<{ listing: unknown; installation: unknown; terms: unknown[] }>(`begin read only;
 select json_build_object('listing',(select to_jsonb(l) from public.creator_listings l where id=:'v1'::uuid),'installation',(select to_jsonb(i) from public.offering_installations i where id=:'v2'::uuid),'terms',(select coalesce(json_agg(to_jsonb(t) order by t.effective_from,t.id),'[]') from public.creator_royalty_terms t where listing_id=:'v1'::uuid)); rollback;`, listingId, installationId);
}
