import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { localEnvironment, signedInContext } from './support/local-auth';

// Fail rather than skip when a required proof profile was not configured.
const masterOff = process.env.STRELVA_FULL_MODEL_MASTER_OFF === '1';
test.beforeAll(() => {
  expect(process.env.STRELVA_LOCAL_AUTH_PROOF).toBe('1');
  expect(process.env.STRELVA_FULL_MODEL_PROFILE).toBe('full-dark');
  expect(process.env.STRELVA_WORKSPACE_RELEASE).toBe(masterOff ? '0' : '1');
  for (const name of ['STRELVA_MCP_OAUTH', 'STRELVA_GOOGLE_MAKE_REAL_RELEASE', 'STRELVA_MAKE_REAL_LIVE',
    'STRELVA_SYSTEMS_RELEASE', 'STRELVA_ASK_RELEASE', 'STRELVA_AGENT_INQUIRIES', 'STRELVA_CONNECT',
    'STRELVA_AGENT_PAYMENTS', 'STRELVA_AGENCY_ADD_CLIENT_RELEASE', 'STRELVA_WEBSITE_REBUILD_RELEASE',
    'STRELVA_SANDBOX_RUNTIME_APPROVED', 'STRELVA_SANDBOX_2048MB_CONTRACT_APPROVED',
    'STRELVA_EXPORT_RECOVERY', 'STRELVA_MONEY_RECONCILIATION']) expect(process.env[name], name).toBe('0');
  expect(process.env.STRELVA_CUSTOM_APPLICATION_BUILD_PROVIDER).toBe('vercel-sandbox');
});
test.setTimeout(360_000);

function effectSnapshot() {
  const url = process.env.STRELVA_LOCAL_DB_URL || '';
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Only the owned loopback database is permitted.');
  // Read native private tables through the owned local DB, not relaxed ACLs.
  // No outside provider or successful authority/effect response is intercepted.
  const tables = ['assistant_authorization_codes', 'assistant_tokens', 'assistant_connections',
    'assistant_refresh_tokens', 'assistant_website_proposals', 'business_payments',
    'agent_payment_reservations', 'sandbox_build_attempts', 'sandbox_build_runtime_bindings',
    'custom_sandbox_runtime_qualifications', 'saved_product_work', 'job_economics', 'owner_decisions'];
  const pairs = tables.map(name => `'${name}',(select jsonb_build_object('count',count(*),'digest',
    md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),''))) from public.${name} t)`).join(',');
  return JSON.parse(execFileSync('psql', [url, '--no-psqlrc', '-At', '--set=ON_ERROR_STOP=1'], {
    input: `begin read only; select jsonb_build_object(${pairs}); rollback;`, encoding: 'utf8',
  }).trim().split('\n').find(line => line.startsWith('{')) || 'null');
}

test(masterOff ? 'master workspace switch refuses additive effects through real Auth'
  : 'additive switches refuse authority and provider effects through real Auth', async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, masterOff ? 'full-dark-master' : 'full-dark-additive');
  const workspaceId = randomUUID();
  const headers = { origin: env.app, 'sec-fetch-site': 'same-origin' };
  try {
    // Same confirmed identity as real local Auth, seeded only to arrange the
    // native owner fixture when the master switch blocks workspace bootstrap.
    expect((await admin.from('users').upsert({ id: owner.userId, email: owner.email, verified_at: new Date().toISOString() })).error).toBeNull();
    expect((await admin.from('workspaces').insert({ id: workspaceId, kind: 'customer', name: 'Full dark proof business', created_by: owner.userId })).error).toBeNull();
    expect((await admin.from('workspace_memberships').insert({ workspace_id: workspaceId, user_id: owner.userId, role: 'owner', created_by: owner.userId })).error).toBeNull();
    const before = effectSnapshot();
    const statuses: Array<{ method: string; path: string; status: number }> = [];
    if (!masterOff) {
      // An ordinary customer owner cannot make Systems. That current native
      // authority boundary precedes Sandbox selection; it must not be relaxed
      // just to arrange a build fixture. This case does not prove Sandbox build
      // qualification; its separate provider journey remains held/unproved.
      const created = await owner.context.request.post('/api/custom-applications', { headers, data: {
        workspaceId, application: { title: 'Unqualified Sandbox proof', files: {
          'build.mjs': 'import { writeFile } from "node:fs/promises"; await writeFile("/output/index.html", "<main>Proof</main>");',
        }, budget: { maxAuthorizedCents: 0, estimateCents: 0 } },
      } });
      expect(created.status(), await created.text()).toBe(403);
      expect(await created.json()).toMatchObject({ code: 'make_systems_required' });
      statuses.push({ method: 'POST', path: '/api/custom-applications', status: created.status() });
      expect(effectSnapshot()).toEqual(before);
    }
    async function get(path: string) {
      const response = await owner.context.request.get(path);
      expect(response.status(), await response.text()).toBe(503);
      statuses.push({ method: 'GET', path, status: response.status() });
    }
    async function post(path: string, data: unknown) {
      const response = await owner.context.request.post(path, { headers, data });
      expect(response.status(), await response.text()).toBe(503);
      statuses.push({ method: 'POST', path, status: response.status() });
    }
    await get('/.well-known/oauth-authorization-server');
    await get('/.well-known/oauth-protected-resource');
    await get('/.well-known/oauth-protected-resource/api/mcp/public');
    await get(`/api/workspace/agent-connections?workspaceId=${workspaceId}`);
    await post('/api/mcp/oauth/authorize', { decision: 'approve', workspaceId, params: {} });
    const token = await owner.context.request.post('/api/mcp/oauth/token', {
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, data: 'grant_type=refresh_token&refresh_token=not-a-grant',
    });
    expect(token.status(), await token.text()).toBe(503);
    statuses.push({ method: 'POST', path: '/api/mcp/oauth/token', status: token.status() });
    const disconnect = await owner.context.request.delete(`/api/workspace/agent-connections/${randomUUID()}`, { headers, data: { workspaceId } });
    expect(disconnect.status(), await disconnect.text()).toBe(503);
    statuses.push({ method: 'DELETE', path: '/api/workspace/agent-connections/:connection', status: disconnect.status() });
    await post('/api/workspace/systems/make-real', { workspaceId, possibilityId: `google-listing:${randomUUID()}` });
    await post('/api/mcp/public', { jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'read_business_context', arguments: {} } });
    await post('/api/workspace/ask', { workspaceId, message: 'Make this business live.' });
    await get(`/api/billing/connect?workspaceId=${workspaceId}`);
    await post('/api/billing/connect', { workspaceId });
    await post('/api/payments/agent/context', { workspaceId });
    await post('/api/payments/agent', { workspaceId });
    await post('/api/workspace/money-reconciliation', { workspaceId });
    await post('/api/workspace/agency-clients', { agencyWorkspaceId: workspaceId, businessName: 'Must not be created' });
    await post('/api/websites/rebuild', { workspaceId, businessName: 'Must not be created', requestId: randomUUID() });
    await get(`/api/workspace/agency-team?workspaceId=${workspaceId}`);
    const recovery = await owner.context.request.get('/api/cron/workspace-export-recovery', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(recovery.status(), await recovery.text()).toBe(200);
    expect(await recovery.json()).toEqual({ enabled: false, processed: 0 });
    statuses.push({ method: 'GET', path: '/api/cron/workspace-export-recovery', status: recovery.status() });
    if (masterOff) {
      await get('/api/workspace');
      await post('/api/workspace-export', { workspaceId });
      await post('/api/custom-applications', { workspaceId });
    } else {
      const page = await owner.context.newPage();
      const response = await page.goto('/connect/authorize');
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('button', { name: 'Connect assistant', exact: true })).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('assistant-disabled-390.png'), fullPage: true });
    }
    expect(effectSnapshot()).toEqual(before);
    await testInfo.attach('native-dark-effect-receipt', { body: JSON.stringify({ workspaceId, masterOff, statuses,
      before, after: effectSnapshot(),
      sandboxRuntime: 'not_exercised_customer_owner_has_no_make_systems_authority',
      fullReleaseQualified: false }), contentType: 'application/json' });
  } finally {
    await admin.from('workspaces').delete().eq('id', workspaceId);
    await owner.context.close();
    await admin.auth.admin.deleteUser(owner.userId);
  }
});
