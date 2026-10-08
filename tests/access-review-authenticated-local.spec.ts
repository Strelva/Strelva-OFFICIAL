import { createClient } from '@supabase/supabase-js';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { accessReviewSchema } from '@/platform/access-review/contracts';
import { localEnvironment, signedInContext } from './support/local-auth';
import { nativeWorkspace } from './support/money-agent-native';
import { localSql } from './support/journeys';

test.beforeAll(() => {
  expect(process.env.STRELVA_LOCAL_AUTH_PROOF).toBe('1');
  expect(process.env.STRELVA_WORKSPACE_RELEASE).toBe('1');
});
test.setTimeout(240_000);

test('real Auth organization review excludes inaccessible businesses and revokes current member authority with audit', async ({ browser }, info) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, 'review-owner');
  const member = await signedInContext(browser, admin, 'review-member');
  const administrator = await signedInContext(browser, admin, 'review-administrator');
  const outside = await signedInContext(browser, admin, 'review-outside');
  const contexts = [owner, member, administrator, outside];
  try {
    // Actual native business creation bootstraps each real Auth identity. The
    // direct rows below arrange scoped memberships/mapping, never a provider,
    // licensing, consent, successful read or revocation response fixture.
    const organizationId = await nativeWorkspace(owner.context.request);
    const businessId = await nativeWorkspace(owner.context.request);
    const privateBusinessId = await nativeWorkspace(outside.context.request);
    await nativeWorkspace(member.context.request);
    await nativeWorkspace(administrator.context.request);
    const publicName = `Visible unit ${businessId.slice(0, 8)}`;
    const privateName = `Excluded business ${privateBusinessId.slice(0, 8)}`;
    expect((await admin.from('workspaces').update({ name: publicName }).eq('id', businessId)).error).toBeNull();
    expect((await admin.from('workspaces').update({ name: privateName }).eq('id', privateBusinessId)).error).toBeNull();
    for (const person of [member, administrator]) {
      expect((await admin.from('workspace_memberships').insert([organizationId, businessId].map(workspaceId => ({
        workspace_id: workspaceId, user_id: person.userId, role: person === member ? 'member' : 'admin', created_by: owner.userId,
      })))).error).toBeNull();
    }
    localSql(`insert into public.customer_relationships
      (organization_workspace_id,customer_workspace_id,display_name,customer_kind,provenance_source,recorded_by,updated_by)
      select :'v1'::uuid,id,'Native access review fixture','organization','direct_mapping',:'v4'::uuid,:'v4'::uuid
      from public.workspaces where id in (:'v2'::uuid,:'v3'::uuid);`, organizationId, businessId, privateBusinessId, owner.userId);
    const scope = `/api/workspace/access-review?workspaceId=${organizationId}&organization=true`;
    async function read(request: APIRequestContext, path: string, status = 200) {
      const response = await request.get(path);
      expect(response.status(), await response.text()).toBe(status);
      return status === 200 ? accessReviewSchema.parse(await response.json()) : null;
    }
    const review = await read(owner.context.request, scope);
    expect(review).toMatchObject({ workspaceId: organizationId, actorUserId: owner.userId, organization: true, inaccessibleUnits: 1 });
    expect(review!.units.map(unit => unit.workspaceId).sort()).toEqual([organizationId, businessId].sort());
    expect(JSON.stringify(review)).not.toContain(privateBusinessId);
    expect(JSON.stringify(review)).not.toContain(privateName);
    await read(outside.context.request, scope, 403);
    await read(member.context.request, scope, 403);
    const ownBusiness = `/api/workspace/access-review?workspaceId=${businessId}&organization=false`;
    const ordinary = await read(member.context.request, ownBusiness);
    expect(ordinary?.units[0]?.entries.every(entry => !entry.canRevoke)).toBe(true);
    await read(administrator.context.request, scope);
    async function revoke(request: APIRequestContext, targetUser: string, status: number) {
      const response = await request.post('/api/workspace/access-review', { headers: { origin: env.app }, data: {
        workspaceId: organizationId, organization: true, businessId, kind: 'member', recordId: targetUser,
      } });
      expect(response.status(), await response.text()).toBe(status);
    }
    await revoke(administrator.context.request, member.userId, 403);
    await revoke(owner.context.request, owner.userId, 409);
    expect(localSql<number>(`select count(*) from public.customer_mapping_audit
      where organization_workspace_id=:'v1'::uuid and record_type='member' and record_id=:'v2'::uuid and action='revoked';`,
    organizationId, member.userId)).toBe(0);

    const page = await owner.context.newPage();
    await page.goto(`/workspace/access-review?workspaceId=${organizationId}`);
    await expect(page.getByRole('heading', { name: 'People & access review', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Organization & mapped businesses', exact: true }).click();
    await expect(page.getByText('1 mapped business is unavailable to your account; their access details are excluded.', { exact: false })).toBeVisible();
    await expect(page.getByText(privateName, { exact: true })).toHaveCount(0);
    const unit = page.getByRole('region', { name: `${publicName} access`, exact: true });
    await expect(unit).toBeVisible();
    const revoked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/workspace/access-review'
      && response.request().method() === 'POST');
    await unit.getByRole('button', { name: `Revoke member for ${member.email}`, exact: true }).click();
    expect((await revoked).status()).toBe(200);
    await expect(page.getByRole('status')).toHaveText('Access revoked and recorded in audit.');
    await expect(unit.getByRole('button', { name: `Revoke member for ${member.email}`, exact: true })).toHaveCount(0);
    await read(member.context.request, ownBusiness, 403);
    expect(localSql<number>(`select count(*) from public.workspace_memberships where workspace_id=:'v1'::uuid and user_id=:'v2'::uuid;`, businessId, member.userId)).toBe(0);
    expect(localSql<number>(`select count(*) from public.customer_mapping_audit
      where organization_workspace_id=:'v1'::uuid and record_type='member' and record_id=:'v2'::uuid and action='revoked'
      and actor_id=:'v3'::uuid and evidence_reference=:'v4';`, organizationId, member.userId, owner.userId, `access-review:${businessId}`)).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('button', { name: 'Organization & mapped businesses', exact: true }).click();
    await expect(unit).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('native-access-review-revoked-390.png'), fullPage: true });
    await info.attach('access-review-native-receipt', { body: JSON.stringify({ organizationId, businessId, inaccessibleUnits: 1,
      removedMemberId: member.userId, auditRows: 1, fullReleaseQualified: false }), contentType: 'application/json' });
  } finally {
    // Native audit evidence remains in this disposable DB; do not disable its
    // retention constraints to make test teardown erase the revocation.
    for (const person of contexts) {
      await person.context.close();
      await admin.auth.admin.deleteUser(person.userId);
    }
  }
});
