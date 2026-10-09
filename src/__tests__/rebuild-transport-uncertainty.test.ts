import { afterEach, expect, it, vi } from 'vitest';
import { rebuildHttpFailure } from '@/app/api/websites/rebuild-http';
import { parseRebuildView, RebuildTransportError, RebuildUnconfirmedError, serverRebuildTransport } from '@/experience/websites/rebuild-transport';
import { WorkspaceAccessError } from '@/platform/workspaces/types';
import { harness, actor, selection } from './rebuild-recovery-independent-harness';
afterEach(() => vi.unstubAllGlobals());
it.each(['approve', 'launch'] as const)('marks the actual %s postcommit membership403 unknown, preserving committed document authority', async action => {
  const h = harness();
  const created = await h.create({ requestId: 'phase-probe-request', businessName: 'Fictional Bread', description: 'We bake bread for pickup.' });
  const before = action === 'launch' ? await h.service.approve(actor, created.workId, selection(created)) : created;
  if (action === 'approve') {
    const original = h.documents.approve.bind(h.documents);
    h.documents.approve = vi.fn(async (user, input) => { await original(user, input); h.state.member = false; });
  } else {
    const original = h.documents.publish.bind(h.documents);
    h.documents.publish = vi.fn(async (user, input) => { const result = await original(user, input); h.state.member = false; return result; });
  }
  let responseStatus = 0;
  vi.stubGlobal('fetch', vi.fn(async (path: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      try { return Response.json(await h.service[action](actor, before.workId, JSON.parse(String(options.body)))); }
      catch (cause) { expect(cause).toBeInstanceOf(WorkspaceAccessError); const response = rebuildHttpFailure(cause); responseStatus = response.status; return response; }
    }
    if (path.includes('/history?')) return Response.json({ revisions: [] });
    if (path.includes('/domain?')) return Response.json({ domain: null });
    return Response.json(await h.service.read(actor, before.workId));
  }));
  await expect(serverRebuildTransport.mutate(parseRebuildView(before), action)).rejects.toBeInstanceOf(RebuildUnconfirmedError);
  expect(responseStatus).toBe(403); h.state.member = true;
  if (action === 'approve') {
    // The approval port has committed: reservation accepts its exact authority,
    // while work status still needs a current owner review.
    await expect(h.documents.reserveHostedTenant(actor, { workspaceId: before.workspaceId, workId: before.workId, revision: before.rebuild.candidate!.revision, contentHash: before.rebuild.candidate!.contentHash, tenantId: 'fictional-bread' })).resolves.toBe('fictional-bread');
    expect(h.documents.approve).toHaveBeenCalledTimes(1);
  } else {
    expect(h.publications.size).toBe(1);
    const current = await serverRebuildTransport.read(before.workspaceId, before.workId);
    expect(current.status).toBe('published'); expect(current.readBack).toBe('pending');
    expect(h.documents.publish).toHaveBeenCalledTimes(1);
  }
});
it.each([400,403,409])('keeps atomic fact HTTP%s refusal editable instead of classifying it as an unknown save', async status => {
  const h = harness(); const record = await h.create();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Check the fact before saving.' }, { status })));
  await expect(serverRebuildTransport.mutate(parseRebuildView(record), 'edit', { factId: 'claim', text: 'Correction' })).rejects.toBeInstanceOf(RebuildTransportError);
});
it.each(['approve','launch'] as const)('holds %s HTTP400 because successful authority or pointer parsing may fail after commit', async action => {
  const h = harness(); const record = await h.create();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Check the request, website revision, and content hash.' }, { status: 400 })));
  await expect(serverRebuildTransport.mutate(parseRebuildView(record), action)).rejects.toBeInstanceOf(RebuildUnconfirmedError);
});
it.each(['network', '503', 'invalid-json', 'invalid-record'] as const)('normalizes %s to uncertainty without exposing raw client/schema errors', async mode => {
  const h = harness(); const record = await h.create();
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (mode === 'network') throw new Error('private connection diagnostic');
    if (mode === '503') return rebuildHttpFailure(new Error('private postcommit diagnostic'));
    if (mode === 'invalid-json') return new Response('not-json');
    return Response.json({ invalid: 'record' });
  }));
  await expect(serverRebuildTransport.mutate(parseRebuildView(record), 'edit', { factId: 'claim', text: 'Correction' })).rejects.toThrow('Reload its current saved state');
});
it.each(['workspaceId', 'workId'] as const)('holds a successful mutation acknowledgment for another %s without reading its history', async field => {
  const h = harness(); const record = await h.create();
  const fetchMock = vi.fn(async () => Response.json({ ...record, [field]: '72000000-0000-4000-8000-000000000004' }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(serverRebuildTransport.mutate(parseRebuildView(record), 'edit', { factId: 'claim', text: 'Correction' })).rejects.toBeInstanceOf(RebuildUnconfirmedError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
