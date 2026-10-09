import { afterEach, expect, it, vi } from 'vitest';
import { rebuildHttpFailure } from '@/app/api/websites/rebuild-http';
import { parseRebuildView, RebuildTransportError, RebuildUnconfirmedError, serverRebuildTransport } from '@/experience/websites/rebuild-transport';
import { normalizeWebsiteRebuildUrl } from '@/products/websites/client';
import { WorkspaceAccessError } from '@/platform/workspaces/types';
import { harness, actor, selection } from './rebuild-recovery-independent-harness';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(['test', 'production'])('preserves explicit deterministic URL outcomes under %s rules', environment => {
  vi.stubEnv('NODE_ENV', environment);
  const outcome = (url: string) => {
    try { return { normalized: normalizeWebsiteRebuildUrl(url) }; }
    catch (cause) { return { error: cause instanceof Error ? cause.message : 'Unknown error' }; }
  };
  const invalid = { error: 'Enter a valid public website address.' };
  const restricted = { error: 'Enter a public HTTP or HTTPS website address without credentials or a custom port.' };
  const expected: Array<[string, { normalized: string } | { error: string }]> = [
    ['https://', invalid], ['', invalid],
    ['ftp://example.com', { error: 'Enter a public HTTP or HTTPS website address.' }],
    ['https://owner:secret@example.com', restricted], ['https://example.com:8080', restricted],
    [' example.com/path#section ', { normalized: 'https://example.com/path' }],
    ['HTTPS://EXAMPLE.COM:443/path?q=1#section', { normalized: 'https://example.com/path?q=1' }],
    ['https://example.com:80/path', { normalized: 'https://example.com:80/path' }],
    ['http://example.com', environment === 'production' ? restricted : { normalized: 'http://example.com/' }],
    ['https://localhost', environment === 'production' ? restricted : { normalized: 'https://localhost/' }],
    ['https://127.0.0.1', environment === 'production' ? restricted : { normalized: 'https://127.0.0.1/' }],
    ['https://[::1]', environment === 'production' ? restricted : { normalized: 'https://[::1]/' }],
    ['http://localhost:80', environment === 'production' ? restricted : { normalized: 'http://localhost/' }],
  ];
  for (const [url, result] of expected) {
    expect(outcome(url), url).toEqual(result);
  }
});
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
it.each([400])('keeps prevalidated fact HTTP%s refusal editable instead of classifying it as an unknown save', async status => {
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
it('settles an owning fact acknowledgement without issuing or awaiting optional reads', async () => {
  const h = harness(); const raw = await h.create(); const record = parseRebuildView(raw);
  const factId = Object.keys(record.candidate!.facts)[0]!;
  const input = { ...selection(raw), action: 'confirm' as const };
  const saved = await h.service.resolveFact(actor, raw.workId, factId, input);
  const fetchMock = vi.fn(async (_path: string, options?: RequestInit) => options?.method === 'POST' ? Response.json(saved) : new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  const next = await serverRebuildTransport.mutate(record, 'confirm', { factId });
  expect(next.revision).toBe(saved.rebuild.revision); expect(next.approved).toBe(false);
  expect(next.historyUnavailable).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('holds a stale same-work fact acknowledgement instead of treating prior approval as current', async () => {
  const h = harness(); const raw = await h.create();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(raw)));
  await expect(serverRebuildTransport.mutate(parseRebuildView(raw), 'edit', { factId: 'claim', text: 'New text' })).rejects.toBeInstanceOf(RebuildUnconfirmedError);
});
it.each(['foreign', 'malformed', 'denied'] as const)('keeps owning saved state accepted while %s supplemental History is unavailable', async mode => {
  const h = harness(); const raw = await h.create();
  vi.stubGlobal('fetch', vi.fn(async (path: string) => path.includes('/history?') ? Response.json({ workspaceId: mode === 'foreign' ? '72000000-0000-4000-8000-000000000004' : raw.workspaceId, workId: raw.workId, revisions: mode === 'malformed' ? [{ revision: 'bad' }] : [] }, { status: mode === 'denied' ? 403 : 200 }) : Response.json(raw)));
  const next = await serverRebuildTransport.read(raw.workspaceId, raw.workId);
  expect(next.workId).toBe(raw.workId); expect(next.revision).toBe(raw.rebuild.revision);
  expect(next.historyUnavailable).toBe(true); expect(next.documentRevisions).toEqual([]);
});
it.each(['requestId', 'description', 'workspaceId'] as const)('holds a creation acknowledgement that mismatches submitted %s', async field => {
  const h = harness(); const raw = await h.create();
  const input = { workspaceId: raw.workspaceId, requestId: raw.rebuild.input.requestId, ...('description' in raw.rebuild.input ? { businessName: raw.rebuild.input.businessName, description: raw.rebuild.input.description } : {}) };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(field === 'workspaceId' ? { ...raw, workspaceId: '72000000-0000-4000-8000-000000000004' } : { ...raw, rebuild: { ...raw.rebuild, input: { ...raw.rebuild.input, [field]: 'DIFFERENT-SUBMITTED-COMMAND' } } })));
  await expect(serverRebuildTransport.start(input)).rejects.toBeInstanceOf(RebuildUnconfirmedError);
});
it('accepts the same submitted URL when the owning service canonicalizes its scheme and fragment', async () => {
  const h = harness(); const input = { workspaceId: '71000000-0000-4000-8000-000000000002', requestId: 'url-canonical-request', url: 'example.com/path#section' };
  const raw = await h.service.create(actor, input.workspaceId, { requestId: input.requestId, url: input.url }, true);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(raw)));
  const next = await serverRebuildTransport.start(input);
  expect(next.workId).toBe(raw.workId); expect(h.pipeline).not.toHaveBeenCalled();
});
it('keeps publication acknowledged when the scoped domain GET returns malformed data', async () => {
  const h = harness(); const raw = await h.launch(await h.create());
  vi.stubGlobal('fetch', vi.fn(async (path: string) => path.includes('/domain?') ? Response.json({ domain: { hostname: 42 } }) : path.includes('/history?') ? Response.json({ workspaceId: raw.workspaceId, workId: raw.workId, revisions: [] }) : Response.json(raw)));
  const next = await serverRebuildTransport.read(raw.workspaceId, raw.workId);
  expect(next.status).toBe('published'); expect(next.publishedUrl).toBeTruthy(); expect(next.domainUnavailable).toBe(true); expect(next.domain).toBeNull();
});
