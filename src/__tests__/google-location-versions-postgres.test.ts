import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseSystemStore } from "@/platform/systems";
import { createSystemVersions } from "@/platform/system-versions";
import { createSourceSystem, readBusinessVersions } from "@/platform/system-versions/supabase-store";
import { commandGoogleLocationVersions, googleVersionDraftCurrent, type GoogleLocationVersionsDeps } from "@/products/google-listing/versions";
import { readPublishingSnapshot } from "@/products/publishing/server";
import { postgresHarness, psqlDb } from "./support/versions-postgres";

// Run after the account-binding migration, against the same isolated workspace
// SQL cluster. The preparation port is a fake: this cannot dispatch to Google.
const connection = process.env.STRELVA_VERSIONS_PSQL;
describe.skipIf(!connection)("Google location Versions on isolated Postgres", () => {
  it.each([false, true])("persists source, local listing Systems and scoped lineage (two businesses: %s)", async twoBusinesses => {
    const h = postgresHarness(connection!);
    const db = psqlDb(connection!);
    const sourceBusiness = await h.business("Fictional Google source", "agency");
    const first = await h.business("Fictional Camillus");
    const second = twoBusinesses ? await h.business("Fictional Fayetteville") : first;
    const actor = await h.actor([...new Set([sourceBusiness, first, second])].map(businessId => ({ businessId, role: "admin" })));
    const workspaceActor = { userId: actor.userId, verifiedEmail: actor.verifiedEmail! };
    const bindings = [];
    for (const [workspaceId, locationId] of [[first, "camillus"], [second, "fayetteville"]]) {
      const stableId = randomUUID(), bindingId = randomUUID(), tenantId = `google-version-${randomUUID().slice(0, 8)}`;
      db.query(`insert into public.tenants(id, stable_id, site_name) values ('${tenantId}', '${stableId}', 'Fictional listing');
        insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt)
          values ('${stableId}', '${tenantId}', '${workspaceId}', '${actor.userId}', '${randomUUID()}', repeat('a', 64), '{}');
        insert into public.workspace_account_bindings(id, workspace_id, provider, origin_tenant_stable_id, status, migrated_from)
          values ('${bindingId}', '${workspaceId}', 'google', '${stableId}', 'connected', 'oauth');
        insert into public.workspace_google_locations(workspace_id, binding_id, account_id, location_id, title)
          values ('${workspaceId}', '${bindingId}', 'accounts/fictional', '${locationId}', '${locationId}');`);
      bindings.push({ workspaceId: workspaceId!, bindingId, locationId: locationId! });
    }
    const deps: GoogleLocationVersionsDeps = {
      store: h.store, versions: createSystemVersions({ store: h.store, connections: h.connections }), systems: createSupabaseSystemStore(db),
      actor: async () => actor, enabled: async () => true, snapshot: (at, id) => readPublishingSnapshot(at, id, db),
      source: (at, input) => createSourceSystem(at, input, db),
      prepare: vi.fn<GoogleLocationVersionsDeps["prepare"]>(async (_at, input, version) => {
        expect(await googleVersionDraftCurrent({ workspaceId: input.workspaceId, locationId: input.locationId, bindingId: version!.pin.bindingId, pin: version!.pin, draft: { action: "post", post: input.post } }, h.store)).toBe(true);
        return { id: `approval-${input.locationId}`, tenantId: input.tenantId, source: "google", type: "content_update", title: "Review", body: "Fictional frozen copy", status: "pending", createdAt: "2026-10-07" };
      }),
    };
    const definition = { kind: "google_listing", post: { topicType: "STANDARD", summary: "Fictional shared post" } };
    const published = await commandGoogleLocationVersions(workspaceActor, { action: "publish", workspaceId: sourceBusiness, name: "Shared Google defaults", hidden: false, definition, summary: "Initial setup", commandId: randomUUID() }, deps);
    if (!published.source) throw new Error("Source missing");
    const versions = [];
    for (const target of bindings) {
      await commandGoogleLocationVersions(workspaceActor, { action: "share", workspaceId: sourceBusiness, sourceSystemId: published.source.systemId, businessId: target.workspaceId }, deps);
      const attached = await commandGoogleLocationVersions(workspaceActor, { action: "attach", ...target, sourceWorkspaceId: sourceBusiness, sourceSystemId: published.source.systemId, revision: 1, label: target.locationId, commandId: randomUUID() }, deps);
      if (!attached.lineage) throw new Error("Version missing");
      versions.push({ workspaceId: target.workspaceId, versionId: attached.lineage.id, expectedRowRevision: attached.lineage.rowRevision });
      const detail = await deps.systems.readSystem(workspaceActor, attached.lineage.version);
      expect(detail.system).toMatchObject({ kind: "listing", lifecycle: "live", origin: { kind: "google_location", ref: `${target.bindingId}:${target.locationId}` } });
    }
    await commandGoogleLocationVersions(workspaceActor, { action: "publish", workspaceId: sourceBusiness, sourceSystemId: published.source.systemId, name: "Shared", expectedSourceRevision: 1, definition: { ...definition, post: { ...definition.post, summary: "Fictional shared improvement" } }, summary: "Shared change", commandId: randomUUID() }, deps);
    expect(await commandGoogleLocationVersions(workspaceActor, { action: "prepare", workspaceId: sourceBusiness, sourceSystemId: published.source.systemId, revision: 2, kind: "post", versions, commandId: randomUUID() }, deps)).toMatchObject({ results: [{ status: "needs_approval" }, { status: "needs_approval" }] });
    const lineage = await readBusinessVersions(workspaceActor, first, db);
    expect(lineage.versions).toHaveLength(twoBusinesses ? 1 : 2);
    expect(lineage.versions[0]).toMatchObject({ context: { kind: "location" }, baselineRevision: 2, source: { systemId: published.source.systemId } });
    const outsider = await h.actor([]);
    await expect(readBusinessVersions({ userId: outsider.userId, verifiedEmail: outsider.verifiedEmail! }, first, db)).rejects.toThrow();
  });
});
