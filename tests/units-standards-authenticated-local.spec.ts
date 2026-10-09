import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { createSystemVersions, type JsonValue } from '@/platform/system-versions';
import { createSupabaseConnectionOwnership, createSupabaseVersionStore, readVersionActor, type VersionsDb } from '@/platform/system-versions/supabase-store';
import { unitsViewSchema, unitVersionChoicesSchema } from '@/platform/enterprise/contracts';
import { localEnvironment, signedInContext } from './support/local-auth';
import { nativeWorkspace } from './support/money-agent-native';
import { localSql } from './support/journeys';
import { configuredPackageReviewer } from './support/configured-package-reviewer';

test.beforeAll(() => {
  for (const name of ['STRELVA_LOCAL_AUTH_PROOF', 'STRELVA_WORKSPACE_RELEASE', 'STRELVA_SYSTEMS_RELEASE', 'STRELVA_NEEDS_YOU_RELEASE'])
    expect(process.env[name], name).toBe('1');
});
test.setTimeout(300_000);
const versionViewSchema = z.object({ versionId: z.string().uuid(), rowRevision: z.number().int().positive(),
  baselineRevision: z.number().int().positive(), currentRelease: z.number().nullable(),
  workingDefinition: z.object({ kind: z.literal('internal_app'), title: z.string(), fields: z.array(z.object({ id: z.string(), label: z.string(), type: z.string(), required: z.boolean() })), components: z.array(z.unknown()) }),
  offers: z.array(z.object({ sourceRevision: z.number(), lockedPaths: z.array(z.string()).optional(),
    conflicts: z.array(z.object({ path: z.string() }).passthrough()) }).passthrough()),
}).passthrough();

test('real Auth Units bind business Versions, preserve owner decisions on standards and stop writes after authority withdrawal', async ({ browser }, info) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, 'unit-owner');
  const manager = await signedInContext(browser, admin, 'unit-manager');
  const outsider = await signedInContext(browser, admin, 'unit-outsider');
  let reviewer: Awaited<ReturnType<typeof configuredPackageReviewer>> | undefined;
  try {
    const organizationId = await nativeWorkspace(owner.context.request);
    const businessId = await nativeWorkspace(owner.context.request);
    await nativeWorkspace(manager.context.request);
    const otherBusinessId = await nativeWorkspace(outsider.context.request);
    expect((await admin.from('workspace_memberships').insert([organizationId, businessId].map(id => ({
      workspace_id: id, user_id: manager.userId, role: 'admin', created_by: owner.userId,
    })))).error).toBeNull();
    async function post(request: APIRequestContext, path: string, body: unknown, status = 200) {
      const response = await request.post(path, { headers: { origin: env.app }, data: body });
      expect(response.status(), await response.text()).toBe(status);
      return response;
    }
    const rootId = randomUUID();
    const root = { action: 'put', organizationId, id: rootId, businessId: organizationId,
      parentId: null, name: 'Organization control root', kind: 'business', expectedRevision: 0 };
    expect(await (await post(owner.context.request, '/api/workspace/units', root)).json()).toMatchObject({ ok: true, id: rootId, revision: 1 });
    await post(owner.context.request, '/api/workspace/units', root); // exact command replay
    expect(localSql<number>(`select count(*) from public.enterprise_unit_audit where unit_id=:'v1'::uuid and action='put';`, rootId)).toBe(1);
    expect((await outsider.context.request.get(`/api/workspace/units?organizationId=${organizationId}`)).status()).toBe(403);
    await post(owner.context.request, '/api/workspace/units', { ...root, id: randomUUID(), businessId: otherBusinessId, name: 'Must not grant access' }, 403);

    const page = await owner.context.newPage();
    await page.goto(`/workspace/units?workspaceId=${organizationId}`);
    await expect(page.getByRole('heading', { name: 'Business Units', exact: true })).toBeVisible();
    await page.getByLabel('Business that owns this Unit', { exact: true }).selectOption(businessId);
    await page.getByLabel('Unit name', { exact: true }).fill('Buffalo operating unit');
    await page.getByLabel('Parent Unit', { exact: true }).selectOption(rootId);
    const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/workspace/units'
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add Unit', exact: true }).click();
    const response = await created;
    expect(response.status(), await response.text()).toBe(200);
    const child = z.object({ ok: z.literal(true), id: z.string().uuid(), revision: z.literal(1) }).parse(await response.json());
    const hierarchy = page.getByRole('region', { name: 'Unit hierarchy', exact: true });
    const childRow = hierarchy.getByRole('listitem').filter({ hasText: 'Buffalo operating unit' });
    await expect(childRow).toBeVisible();
    await post(owner.context.request, '/api/workspace/units', { ...root, expectedRevision: 1, parentId: child.id }, 409);
    await post(owner.context.request, '/api/workspace/units', { action: 'archive', organizationId, id: rootId, expectedRevision: 1 }, 409);
    await post(owner.context.request, '/api/workspace/units', { action: 'archive', organizationId, id: child.id, expectedRevision: 8 }, 409);

    // Native fixture Systems and the same service-role RPC ports used by the
    // product arrange a supported native form definition and business-owned draft.
    // This is standards/authority proof, not a claimed provider/app activation.
    function system(workspaceId: string, name: string) {
      const id = randomUUID();
      localSql(`insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by)
        values(:'v1'::uuid,:'v2'::uuid,:'v3','internal_app',gen_random_uuid(),repeat('a',64),:'v4'::uuid,:'v4'::uuid);`, id, workspaceId, name, owner.userId);
      return id;
    }
    const db: VersionsDb = { async rpc(name, args) {
      const result = await admin.rpc(name, args);
      if (name === 'save_system_version' && result.error) {
        // Preserve structured diagnosis without native details, args, JWTs or identities.
        const code = typeof result.error.code === 'string' && /^[A-Z0-9]{5}$/.test(result.error.code) ? result.error.code : 'unclassified';
        await info.attach('units-save-native-error-class', { contentType: 'application/json', body: JSON.stringify({ rpc: 'save_system_version', sqlState: code }) });
      }
      return result; // Real errors still reach the unchanged store mapper.
    } };
    const versions = createSystemVersions({ store: createSupabaseVersionStore(db), connections: createSupabaseConnectionOwnership(db) });
    const identity = { userId: owner.userId, verifiedEmail: owner.email };
    const actor = await readVersionActor(identity, db);
    const source = { businessId: organizationId, systemId: system(organizationId, 'Organization reply standard') };
    const fields = (label: string) => [{ id: 'message', label, type: 'text', required: true }];
    const definition = (title: string, fieldLabel: string) => ({ kind: 'internal_app', title,
      fields: fields(fieldLabel), components: [{ kind: 'form', fields: ['message'] }, { kind: 'list', fields: ['message'] }] });
    async function qualify(revision: { source: { revisionId: string; number: number } }) {
      const checks = await post(owner.context.request, '/api/workspace/packages', { action: 'qualify', workspaceId: organizationId, revisionId: revision.source.revisionId });
      const checked = await checks.json();
      expect(checked.revisionId).toBe(revision.source.revisionId);
      expect(checked.evidence).toHaveLength(4);
      expect(checked.evidence.every((item: { revisionId: string; status: string }) => item.revisionId === revision.source.revisionId && item.status === 'passed')).toBe(true);
      expect(checked.humanReview.state).toBe('pending');
      await post(owner.context.request, '/api/workspace/packages', { action: 'review', workspaceId: organizationId,
        revisionId: revision.source.revisionId, approve: true, note: 'An ordinary source owner is not a configured platform reviewer.' }, 403);
      reviewer ??= await configuredPackageReviewer(browser, admin);
      const review = await post(reviewer.context.request, '/api/workspace/packages', { action: 'review', workspaceId: organizationId,
        revisionId: revision.source.revisionId, approve: true, note: 'Reviewed the exact native form definition, synthetic rehearsal and prior-revision comparison under the configured fictional local policy.' });
      const reviewed = await review.json();
      expect(reviewed).toMatchObject({ revisionId: revision.source.revisionId, status: 'qualified', humanReview: { state: 'approved', reviewerId: reviewer.userId } });
      await info.attach(`units-source-${revision.source.number}-local-qualification`, { contentType: 'application/json', body: JSON.stringify({
        localFictionalPolicy: true, productionQualification: false, source: revision.source, checks: checked, review: reviewed,
        reviewer: { userId: reviewer.userId, policyVersion: reviewer.policyVersion } }) });
    }
    const first = await versions.publishSourceRevision(actor, { source,
      definition: definition('Organization first reply', 'Organization routing instructions'), summary: 'Initial unpushed native form standard' });
    await versions.shareSource(actor, source, businessId);
    const local = { businessId, systemId: system(businessId, 'Business-owned reply Version') };
    const createLocalVersion = () => versions.createVersion(actor, { source: first.source, version: local, context: { kind: 'location' as const, label: 'Buffalo operating unit' } });
    await expect(createLocalVersion()).rejects.toThrow(/qualification|not_qualified|human review/);
    expect(localSql<number>(`select count(*) from public.system_versions where version_system_id=:'v1'::uuid;`, local.systemId)).toBe(0);
    await qualify(first);
    const version = await createLocalVersion();
    const versionPath = `/api/workspace/versions?workspaceId=${businessId}&systemId=${local.systemId}`;
    async function view() {
      const read = await owner.context.request.get(versionPath);
      expect(read.status(), await read.text()).toBe(200);
      return versionViewSchema.parse(await read.json());
    }
    async function override(path: string, value: JsonValue, status = 200) {
      const current = await view();
      return post(owner.context.request, '/api/workspace/versions/manage', { action: 'override', workspaceId: businessId,
        systemId: local.systemId, versionId: version.id, rowRevision: current.rowRevision, path, value }, status);
    }
    await override('title', 'Business local reply');
    await override('fields', fields('Business routing instructions'));

    await childRow.getByRole('button', { name: 'Bind a Version', exact: true }).click();
    await page.getByLabel('Business Version', { exact: true }).selectOption(version.id);
    const bound = page.waitForResponse(read => new URL(read.url()).pathname === '/api/workspace/units' && read.request().method() === 'POST');
    await page.getByRole('button', { name: 'Bind business-owned Version', exact: true }).click();
    expect((await bound).status()).toBe(200);
    await expect(childRow).toContainText('1 business-owned Versions');
    const choicesResponse = await owner.context.request.get(`/api/workspace/units?organizationId=${organizationId}&unitId=${child.id}`);
    expect(choicesResponse.status(), await choicesResponse.text()).toBe(200);
    expect(unitVersionChoicesSchema.parse(await choicesResponse.json()).versions).toEqual(expect.arrayContaining([expect.objectContaining({ id: version.id, assigned: true })]));

    const beforeSecond = await view();
    const second = await versions.publishSourceRevision(await readVersionActor(identity, db), { source,
      definition: definition('Organization approved reply', 'Organization reviewed routing instructions'),
      summary: 'Push the reply title; keep the form fields business-owned', lockedPaths: ['title'] });
    await expect(versions.adoptImprovement(await readVersionActor(identity, db), version.id, { revision: 2,
      expectedRowRevision: beforeSecond.rowRevision, resolutions: [] })).rejects.toThrow(/qualification|not_qualified|human review/);
    await qualify(second);
    const offered = await view();
    expect(offered.baselineRevision).toBe(1);
    expect(offered.currentRelease).toBeNull();
    expect(offered.workingDefinition.title).toBe('Business local reply');
    expect(offered.offers.find(offer => offer.sourceRevision === 2)).toMatchObject({ lockedPaths: ['title'],
      conflicts: expect.arrayContaining([expect.objectContaining({ path: 'title' }), expect.objectContaining({ path: 'fields' })]) });
    const decision = { workspaceId: businessId, systemId: local.systemId, versionId: version.id, revision: 2 };
    await post(owner.context.request, '/api/workspace/versions', { ...decision, action: 'decline', rowRevision: offered.rowRevision,
      reason: 'The business owner has not accepted the new reply yet.' });
    const declined = await view();
    expect(declined.baselineRevision).toBe(1);
    await post(owner.context.request, '/api/workspace/versions', { ...decision, action: 'adopt', rowRevision: declined.rowRevision,
      resolutions: [{ path: 'title', choice: 'keep_local' }, { path: 'fields', choice: 'keep_local' }] }, 400);
    expect((await view()).rowRevision).toBe(declined.rowRevision);
    // Draft adoption through the actual native RPC port avoids inventing a
    // running adapter or live-release receipt for this non-running source.
    await versions.adoptImprovement(await readVersionActor(identity, db), version.id, { revision: 2,
      expectedRowRevision: declined.rowRevision,
      resolutions: [{ path: 'title', choice: 'take_upstream' }, { path: 'fields', choice: 'keep_local' }] });
    const adopted = await view();
    expect(adopted.baselineRevision).toBe(2);
    expect(adopted.currentRelease).toBeNull();
    expect(adopted.workingDefinition).toEqual(definition('Organization approved reply', 'Business routing instructions'));
    // Native transaction committed the deferred trigger with the locked title
    // and a remaining business fields override; no direct state repair occurs.
    expect(localSql<unknown>(`select jsonb_build_object('baselineRevision',v.baseline_revision,'lockedPaths',to_jsonb(r.locked_paths),
      'overridePaths',coalesce((select jsonb_agg(o.path order by o.position) from public.system_version_overrides o where o.version_id=v.id),'[]'::jsonb),
      'decisionChoices',coalesce((select jsonb_agg(d.choice order by d.position) from public.system_version_decisions d where d.version_id=v.id),'[]'::jsonb),
      'releaseCount',(select count(*) from public.system_version_releases rr where rr.version_id=v.id))
      from public.system_versions v join public.system_version_source_revisions r on r.id=v.baseline_revision_id where v.id=:'v1'::uuid;`, version.id))
      .toEqual({ baselineRevision: 2, lockedPaths: ['title'], overridePaths: ['fields'], decisionChoices: ['declined', 'adopted'], releaseCount: 0 });
    await override('title', 'Must not override a pushed standard', 400);
    await override('fields', fields('Business amended routing instructions'));

    const beforeRevoke = await manager.context.request.get(`/api/workspace/units?organizationId=${organizationId}`);
    expect(beforeRevoke.status(), await beforeRevoke.text()).toBe(200);
    expect(unitsViewSchema.parse(await beforeRevoke.json()).units.some(unit => unit.id === child.id)).toBe(true);
    // Withdrawal is a native table fixture; the following Auth reads/writes
    // must consult current authority rather than cache the earlier grant.
    expect((await admin.from('workspace_memberships').delete().eq('workspace_id', businessId).eq('user_id', manager.userId)).error).toBeNull();
    const afterRevoke = await manager.context.request.get(`/api/workspace/units?organizationId=${organizationId}`);
    expect(afterRevoke.status(), await afterRevoke.text()).toBe(200);
    const hidden = unitsViewSchema.parse(await afterRevoke.json());
    expect(hidden.inaccessibleUnits).toBe(1);
    expect(hidden.units.some(unit => unit.id === child.id)).toBe(false);
    expect(JSON.stringify(hidden)).not.toContain('Buffalo operating unit');
    expect((await manager.context.request.get(`/api/workspace/units?organizationId=${organizationId}&unitId=${child.id}`)).status()).toBe(403);
    await post(manager.context.request, '/api/workspace/units', { action: 'archive', organizationId, id: child.id, expectedRevision: 2 }, 403);
    expect((await manager.context.request.get(versionPath)).status()).toBe(403);
    const current = await view();
    await post(manager.context.request, '/api/workspace/versions/manage', { action: 'override', workspaceId: businessId,
      systemId: local.systemId, versionId: version.id, rowRevision: current.rowRevision, path: 'fields', value: fields('Unauthorized manager field change') }, 403);
    expect((await view()).rowRevision).toBe(current.rowRevision);
    expect(localSql<number>(`select count(*) from public.enterprise_unit_audit where unit_id=:'v1'::uuid and actor_id=:'v2'::uuid;`, child.id, manager.userId)).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(childRow).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('native-units-bound-version-390.png'), fullPage: true });
    await info.attach('units-standards-native-receipt', { body: JSON.stringify({ organizationId, businessId, unitId: child.id,
      versionId: version.id, acceptedSourceRevision: 2, liveRelease: null, removedManagerId: manager.userId, fullReleaseQualified: false }), contentType: 'application/json' });
  } finally {
    await reviewer?.context.close();
    // Retain actual native audit/Version decisions and the configured reviewer policy in the disposable stack.
    for (const person of [owner, manager, outsider]) {
      await person.context.close();
      await admin.auth.admin.deleteUser(person.userId);
    }
  }
});
