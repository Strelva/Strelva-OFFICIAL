// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RebuildExperience } from '@/experience/websites/RebuildExperience';
import { parseRebuildView, RebuildTransportError, RebuildUnconfirmedError, serverRebuildTransport } from '@/experience/websites/rebuild-transport';
import { unresolvedSiteFacts } from "@/products/websites/site-document";
import { rebuildHttpFailure } from '@/app/api/websites/rebuild-http';
import { harness, actor, selection } from './rebuild-recovery-independent-harness';
let root: Root; let node: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); node?.remove(); vi.unstubAllGlobals(); });
async function contactWork() {
 const h = harness();
 const created = await h.create({ requestId: 'contact-refusal-control', businessName: 'Fictional Bakery', description: 'We bake bread for pickup. Email orders@example.test. Email catering@example.test. Call +1 716 555 0199.' });
 let reviewed = created;
 for (const id of unresolvedSiteFacts(reviewed.rebuild.candidate!.document)) reviewed = await h.service.resolveFact(actor, reviewed.workId, id, { ...selection(reviewed), action: 'confirm' });
 const record = await h.service.approve(actor, reviewed.workId, selection(reviewed));
 const facts = record.rebuild.candidate!.document.facts;
 const contactId = Object.entries(facts).find(([, fact]) => fact.kind === 'contact' && fact.text === 'orders@example.test')![0];
 const claimId = Object.entries(facts).find(([, fact]) => fact.kind === 'claim' && fact.text.includes('orders@example.test'))![0];
 let posts = 0;
 vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
  const path = String(input);
  if (options?.method === 'POST') { posts++; try { return Response.json(await h.service.resolveFact(actor, record.workId, decodeURIComponent(path.split('/').at(-1)!), JSON.parse(String(options.body)))); } catch (cause) { return rebuildHttpFailure(cause); } }
  if (path.includes('/history?')) return Response.json({ revisions: [] });
  return Response.json(await h.service.read(actor, record.workId));
 }));
 return { h, record, contactId, claimId, posts: () => posts };
}
const reciprocal = 'Edit the separate email or phone fact first to change or remove this contact. Your current preview is unchanged.';
it.each([
 { label: 'invalid destination', action: 'edit' as const, claim: false, text: 'broken-email', message: 'Enter a valid email address or phone number for this contact. Your current preview is unchanged.' },
 { label: 'contact kind change', action: 'edit' as const, claim: false, text: '+1 716 555 0188', message: 'Keep this contact as the same kind of email address or phone number. Your current preview is unchanged.' },
 { label: 'destination collision', action: 'edit' as const, claim: false, text: 'catering@example.test', message: 'This destination already belongs to another contact fact. Edit that existing email or phone instead. Your current preview is unchanged.' },
 { label: 'reciprocal claim edit', action: 'edit' as const, claim: true, text: 'We bake bread for pickup.', message: reciprocal },
 { label: 'reciprocal claim remove', action: 'remove' as const, claim: true, text: '', message: reciprocal },
])('keeps the exact source-backed $label (HTTP409) as precommit refusal', async ({ action, claim, text, message }) => {
 const c = await contactWork(); const before = structuredClone(c.h.works.get(c.record.workId)); const commits = vi.mocked(c.h.documents.commitCandidate).mock.calls.length;
 const operation = serverRebuildTransport.mutate(parseRebuildView(c.record), action, { factId: claim ? c.claimId : c.contactId, ...(action === 'edit' ? { text } : {}) });
 await expect(operation).rejects.toBeInstanceOf(RebuildTransportError); await expect(operation).rejects.toThrow(message);
 expect(c.h.documents.commitCandidate).toHaveBeenCalledTimes(commits); expect(c.h.works.get(c.record.workId)).toEqual(before); expect(c.posts()).toBe(1); expect(c.h.publications.size).toBe(0);
});
it.each(['invalid-contact', 'reciprocal-claim'] as const)('preserves the %s correction field and direct retry after actual precommit refusal', async mode => {
 const c = await contactWork(); const factId = mode === 'invalid-contact' ? c.contactId : c.claimId; const original = c.record.rebuild.candidate!.document.facts[factId]!.text;
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); node = document.createElement('div'); document.body.append(node); root = createRoot(node);
 await act(async () => root.render(createElement(RebuildExperience, { workspaceId: c.record.workspaceId, workId: c.record.workId })));
 const article = Array.from(node.querySelectorAll('article')).find(item => item.getAttribute('aria-label') === original)!;
 const button = (label: string) => Array.from(node.querySelectorAll('button')).find(item => item.textContent?.trim() === label)!;
 await act(async () => (article.querySelector('button') as HTMLButtonElement).click());
 const field = article.querySelector('textarea')!; const invalid = mode === 'invalid-contact' ? 'broken-email' : 'We bake bread for pickup.';
 await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, invalid); field.dispatchEvent(new Event('input', { bubbles: true })); });
 await act(async () => article.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(field.value).toBe(invalid); expect(document.activeElement).toBe(field); expect(button('Save correction').disabled).toBe(false); expect(button('Reload current state')).toBeUndefined();
 expect(node.textContent).toContain('This exact preview is approved.'); expect(c.posts()).toBe(1);
 if (mode === 'invalid-contact') {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, 'new-orders@example.test'); field.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => article.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(c.posts()).toBe(2); expect(node.textContent).not.toContain('This exact preview is approved.'); expect(node.textContent).toContain('new-orders@example.test');
 }
});

it.each([
 { action: 'remove' as const, message: 'Enter a valid email address or phone number for this contact. Your current preview is unchanged.' },
 { action: 'approve' as const, message: reciprocal },
 { action: 'edit' as const, message: `${reciprocal} Additional unqualified failure.` },
])('keeps unmatched refusal action/message unknown: $action', async ({ action, message }) => {
 const c = await contactWork();
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: message }, { status: 409 })));
 await expect(serverRebuildTransport.mutate(parseRebuildView(c.record), action, { factId: c.contactId, text: 'new@example.test' })).rejects.toBeInstanceOf(RebuildUnconfirmedError);
});
