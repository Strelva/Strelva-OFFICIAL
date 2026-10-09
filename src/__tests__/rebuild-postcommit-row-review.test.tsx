// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RebuildExperience } from '@/experience/websites/RebuildExperience';
import { parseRebuildView, serverRebuildTransport } from '@/experience/websites/rebuild-transport';
import { rebuildHttpFailure } from '@/app/api/websites/rebuild-http';
import { createWebsiteDocumentStore } from '@/products/websites/document-store';
import { harness, actor, selection } from './rebuild-recovery-independent-harness';
let root: Root; let node: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); node?.remove(); vi.unstubAllGlobals(); });
const original = 'We bake bread for Saturday pickup.';
const corrected = 'We bake bread and catering boxes for Saturday pickup.';
it.each([{ stage: 'payload', status: 409 }, { stage: 'product', status: 403 }])('freezes stale approval after actual candidate RPC commits but $stage acknowledgement fails with $status', async ({ stage, status }) => {
  const h = harness();
  const created = await h.create({ requestId: 'recovery-probe-request', businessName: 'Fictional Bread', description: original });
  const approved = await h.service.approve(actor, created.workId, selection(created));
  const prior = parseRebuildView(approved);
  const factId = Object.entries(prior.candidate!.facts).find(([, f]) => f.kind === 'claim' && f.text === original)![0];
  const memoryCommit = h.documents.commitCandidate.bind(h.documents);
  let mutationCount = 0; let reads = 0; let corrupt = true;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    expect(name).toBe('commit_website_document_candidate');
    const work = await memoryCommit(actor, { workspaceId: String(args.p_workspace_id), workId: String(args.p_work_id), expectedRevision: Number(args.p_expected_document_revision), expectedWorkRevision: Number(args.p_expected_work_revision), document: args.p_document as Parameters<typeof memoryCommit>[1]['document'], payload: args.p_payload });
    // Preserve the actual committed memory record; corrupt only the RPC acknowledgement.
    return { data: [{ id: work.id, workspace_id: work.workspaceId, product_id: corrupt && stage === 'product' ? 'malformed-product-after-commit' : work.productId, resource_kind: work.resourceKind, title: work.title, payload: corrupt && stage === 'payload' ? { revision: 'malformed-after-commit' } : work.payload, input: work.input, created_by: work.createdBy, created_at: work.createdAt, updated_at: work.updatedAt }], error: null };
  });
  h.documents.commitCandidate = createWebsiteDocumentStore({ rpc }).commitCandidate;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const path = String(input);
    if (path.includes('/facts/') && options?.method === 'POST') {
      mutationCount++;
      try { return Response.json(await h.service.resolveFact(actor, approved.workId, factId, JSON.parse(String(options.body)))); }
      catch (error) { const response = rebuildHttpFailure(error); expect(response.status).toBe(status); return response; }
    }
    if (path.includes('/history?')) return Response.json({ revisions: [] });
    if (path.includes('/rebuild?')) { reads++; return Response.json(await h.service.read(actor, approved.workId)); }
    return Response.json({ error: 'Unneeded read' }, { status: 503 });
  }));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(createElement(RebuildExperience, { workspaceId: prior.workspaceId, workId: prior.workId, canPublish: true })));
  const find = (label: string) => Array.from(node.querySelectorAll('button')).find(b => b.textContent?.trim() === label);
  const factArticle = Array.from(node.querySelectorAll('article')).find(article => article.textContent?.includes(original))!;
  await act(async () => (factArticle.querySelector('button') as HTMLButtonElement).click());
  const field = factArticle.querySelector('textarea')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, corrected); field.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => factArticle.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  const current = await h.service.read(actor, prior.workId);
  expect(current.rebuild.approvedCandidateRevision).toBeNull();
  expect(current.rebuild.candidate!.document.facts[factId]!.text).toBe(corrected);
  expect(current.rebuild.revision).toBeGreaterThan(prior.revision);
  expect(mutationCount).toBe(1);
  expect(rpc).toHaveBeenCalledTimes(1);
  // These assertions fail on 653: committed correction gets misclassified as safe refusal.
  expect(node.textContent).not.toContain('This exact preview is approved.');
  expect(find('Publish approved website')?.disabled).toBe(true);
  expect(field.value).toBe(corrected);
  expect(find('Reload current state')).toBeDefined();
  corrupt = false;
  await act(async () => find('Reload current state')!.click());
  expect(node.textContent).toContain(corrected);
  expect(find('Publish approved website')).toBeUndefined();
  expect(mutationCount).toBe(1);
  expect(reads).toBe(2);
});
it('rejects malformed correction input before candidate RPC or any commit', async () => {
  const h = harness();
  const created = await h.create({ requestId: 'invalid-input-control', businessName: 'Fictional Bread', description: original });
  const factId = Object.keys(created.rebuild.candidate!.document.facts)[0]!;
  const before = structuredClone(h.works.get(created.workId));
  const commits = h.documents.commitCandidate as ReturnType<typeof vi.fn>;
  commits.mockClear();
  let failure: unknown;
  try { await h.service.resolveFact(actor, created.workId, factId, { ...selection(created), action: 'edit', text: '' }); }
  catch(error) { failure = error; }
  expect(rebuildHttpFailure(failure).status).toBe(400);
  expect(commits).not.toHaveBeenCalled();
  expect(h.works.get(created.workId)).toEqual(before);
});
