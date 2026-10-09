// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RebuildExperience } from '@/experience/websites/RebuildExperience';
import { parseRebuildView, serverRebuildTransport } from '@/experience/websites/rebuild-transport';
import { rebuildHttpFailure } from '@/app/api/websites/rebuild-http';
import { harness, actor, selection } from './rebuild-recovery-independent-harness';
let root: Root; let node: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); node?.remove(); vi.unstubAllGlobals(); });
const original = 'We bake bread for Saturday pickup.';
const corrected = 'We bake bread and catering boxes for Saturday pickup.';
it('can read the actual committed current candidate without replay after history parsing fails', async () => {
  const h = harness();
  const created = await h.create({ requestId: 'recovery-probe-request', businessName: 'Fictional Bread', description: original });
  const approved = await h.service.approve(actor, created.workId, selection(created));
  const prior = parseRebuildView(approved);
  const factId = Object.entries(prior.candidate!.facts).find(([, f]) => f.kind === 'claim' && f.text === original)![0];
  let badHistory = false; let mutationCount = 0; let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const path = String(input);
    if (path.includes('/facts/') && options?.method === 'POST') {
      mutationCount++;
      const result = await h.service.resolveFact(actor, approved.workId, factId, JSON.parse(String(options.body)));
      badHistory = true;
      return Response.json(result);
    }
    if (path.includes('/history?')) return Response.json(badHistory ? { revisions: [{ revision: 'invalid-shape' }] } : { revisions: [] });
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
  // The actual service invalidates approval, but failed post-save enrichment
  // leaves the review showing the prior approval and no saved-state read.
  expect(node.textContent).not.toContain('This exact preview is approved.');
  expect(find('Publish approved website')?.disabled).toBe(true);
  expect(field.value).toBe(corrected);
  expect(node.querySelector('[role="alert"]')?.textContent).toContain('could not be confirmed');
  expect(document.activeElement).toBe(find('Reload current state'));
  await act(async () => find('Reload current state')!.click());
  expect(field.value).toBe(corrected);
  expect(node.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
  expect(find('Save correction')?.disabled).toBe(true);
  expect(find('Publish approved website')?.disabled).toBe(true);
  await act(async () => { factArticle.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); find('Publish approved website')!.click(); });
  expect(mutationCount).toBe(1);
  badHistory = false;
  const reopened = await serverRebuildTransport.read(prior.workspaceId, prior.workId);
  await act(async () => { find('Reload current state')!.click(); find('Reload current state')!.click(); });
  expect(find('Reload current state')).toBeUndefined();
  expect(find('Publish approved website')).toBeUndefined();
  expect(find('Edit fact')?.disabled).toBe(false);
  expect(document.activeElement).toBe(node.querySelector('#rebuild-decisions-heading'));
  expect(node.textContent).toContain(corrected);
  expect(reopened.approved).toBe(false);
  expect(reopened.candidate!.facts[factId]!.text).toBe(corrected);
  expect(mutationCount).toBe(1);
  // The production HTTP generic503 is truthful. This separate client failure
  // never reaches it, and the component exposes no action to invoke this read.
  expect(await rebuildHttpFailure(new Error('after save')).json()).toEqual({ error: 'The rebuild operation could not be confirmed. Reopen its saved status before retrying.' });
  expect(reads).toBe(4);
  expect(mutationCount).toBe(1);
});
