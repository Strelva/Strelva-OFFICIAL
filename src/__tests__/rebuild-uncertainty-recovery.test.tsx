// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RebuildExperience } from '@/experience/websites/RebuildExperience';
import { fixtureRebuild } from '@/experience/websites/rebuild-fixture';
import { RebuildUnconfirmedError, type RebuildTransport, type RebuildView } from '@/experience/websites/rebuild-transport';
let root: Root; let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); node = document.createElement('div'); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
function record(): RebuildView { const value = fixtureRebuild(); value.status = 'approved'; value.approved = true; value.candidate!.facts = {}; return value; }
function button(label: string) { return Array.from(node.querySelectorAll('button')).find(b => b.textContent?.trim() === label)!; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function scope(value: RebuildView, transport: RebuildTransport, readOnly = false) { return createElement(RebuildExperience, { workspaceId: value.workspaceId, workId: value.workId, initialRecord: value, transport, readOnly }); }
async function unknown(value: RebuildView, transport: RebuildTransport) { await act(async () => root.render(scope(value, transport))); button('Publish approved website').focus(); await act(async () => button('Publish approved website').click()); }
it('recovers an unknown write to the actual reload action and synchronously admits one read, including read-only access', async () => {
  const value = record(); const pending = deferred<RebuildView>(); const next = { ...value, approved: false, status: 'review' as const };
  const read = vi.fn(() => pending.promise); const mutate = vi.fn(async () => { throw new RebuildUnconfirmedError(); });
  const transport = { read, mutate, start: async () => value };
  await unknown(value, transport); expect(document.activeElement).toBe(button('Reload current state'));
  expect(button('Publish approved website').disabled).toBe(true);
  await act(async () => root.render(scope(value, transport, true)));
  await act(async () => { button('Reload current state').click(); button('Reload current state').click(); });
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(next));
  expect(node.textContent).toContain('Saved state refreshed'); expect(node.textContent).toContain('read-only access');
  expect(button('Approve this preview').disabled).toBe(true); expect(mutate).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(node.querySelector('#rebuild-decisions-heading'));
});
it.each(['success', 'failure'] as const)('preserves outside keyboard choice during current-state reload %s', async outcome => {
  const value = record(); const pending = deferred<RebuildView>(); const transport = { read: vi.fn(() => pending.promise), mutate: async () => { throw new RebuildUnconfirmedError(); }, start: async () => value };
  await unknown(value, transport); const outside = document.createElement('button'); outside.textContent = 'Other System'; document.body.append(outside);
  await act(async () => button('Reload current state').click()); outside.focus();
  await act(async () => outcome === 'success' ? pending.resolve(value) : pending.reject(new Error('private read failure')));
  expect(document.activeElement).toBe(outside); outside.remove();
});
it('preserves outside keyboard choice before the unknown write response', async () => {
  const value = record(); const pending = deferred<RebuildView>(); const transport = { read: async () => value, mutate: () => pending.promise, start: async () => value };
  await act(async () => root.render(scope(value, transport))); button('Publish approved website').focus();
  await act(async () => button('Publish approved website').click());
  const outside = document.createElement('button'); document.body.append(outside); outside.focus();
  await act(async () => pending.reject(new RebuildUnconfirmedError()));
  expect(document.activeElement).toBe(outside); expect(button('Reload current state').disabled).toBe(false); outside.remove();
});
it.each(['permission', 'work', 'workspace'] as const)('does not adopt delayed old read after %s identity changes', async change => {
  const value = record(); const pending = deferred<RebuildView>(); const transport = { read: vi.fn(() => pending.promise), mutate: async () => { throw new RebuildUnconfirmedError(); }, start: async () => value };
  await unknown(value, transport); await act(async () => button('Reload current state').click());
  const current = { ...value, title: 'Current other website', ...(change === 'work' ? { workId: '72000000-0000-4000-8000-000000000003' } : {}), ...(change === 'workspace' ? { workspaceId: '72000000-0000-4000-8000-000000000004' } : {}) };
  await act(async () => root.render(scope(current, transport, change === 'permission')));
  await act(async () => pending.resolve({ ...value, title: 'OLD RESPONSE MUST NOT APPEAR' }));
  expect(node.textContent).not.toContain('OLD RESPONSE MUST NOT APPEAR');
  if (change === 'permission') { expect(button('Reload current state')).toBeDefined(); await act(async () => root.render(scope(value, transport))); expect(button('Publish approved website').disabled).toBe(true); }
  else { expect(node.textContent).toContain('Current other website'); expect(button('Reload current state')).toBeUndefined(); }
});
it.each(['unknown', 'success'] as const)('retains current-work uncertainty across permission loss before write %s and later regain', async outcome => {
  const value = record(); const pending = deferred<RebuildView>(); const transport = { read: async () => value, mutate: () => pending.promise, start: async () => value };
  await act(async () => root.render(scope(value, transport))); button('Publish approved website').focus();
  await act(async () => button('Publish approved website').click());
  await act(async () => root.render(scope(value, transport, true)));
  await act(async () => outcome === 'unknown' ? pending.reject(new RebuildUnconfirmedError()) : pending.resolve({ ...value, status: 'published' }));
  await act(async () => root.render(scope(value, transport)));
  expect(button('Publish approved website').disabled).toBe(true); expect(button('Reload current state')).toBeDefined();
  expect(node.textContent).not.toContain('This exact preview is approved.'); expect(node.textContent).not.toContain('This revision has been published.');
});
it.each(['workspaceId', 'workId'] as const)('refuses a current-state acknowledgment for another %s', async field => {
  const value = record(); const transport = { read: async () => ({ ...value, [field]: '72000000-0000-4000-8000-000000000004' }), mutate: async () => { throw new RebuildUnconfirmedError(); }, start: async () => value };
  await unknown(value, transport); await act(async () => button('Reload current state').click());
  expect(button('Publish approved website').disabled).toBe(true); expect(button('Reload current state')).toBeDefined();
  expect(node.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
});
it('invalidates a pending current read even when permission is lost and regained before its response', async () => {
  const value = record(); const pending = deferred<RebuildView>(); const transport = { read: () => pending.promise, mutate: async () => { throw new RebuildUnconfirmedError(); }, start: async () => value };
  await unknown(value, transport); await act(async () => button('Reload current state').click());
  await act(async () => root.render(scope(value, transport, true)));
  await act(async () => root.render(scope(value, transport)));
  await act(async () => pending.resolve({ ...value, title: 'PREVIOUS PERMISSION RESPONSE' }));
  expect(node.textContent).not.toContain('PREVIOUS PERMISSION RESPONSE');
  expect(button('Publish approved website').disabled).toBe(true); expect(button('Reload current state')).toBeDefined();
});
it('fences an unknown write settlement before React commits its lock', async () => {
  const value = record(); const pending = deferred<RebuildView>(); const mutate = vi.fn(() => pending.promise);
  const transport = { read: async () => value, mutate, start: async () => value };
  await act(async () => root.render(scope(value, transport)));
  await act(async () => {
    button('Publish approved website').click();
    pending.reject(new RebuildUnconfirmedError());
    await pending.promise.catch(() => undefined);
    await Promise.resolve();
    button('Publish approved website').click();
  });
  expect(mutate).toHaveBeenCalledTimes(1);
});
it('hands a flagged decision uncertainty to the reload action instead of its obsolete review recovery', async () => {
  const value = fixtureRebuild(); const transport = { read: async () => value, mutate: async () => { throw new RebuildUnconfirmedError(); }, start: async () => value };
  await act(async () => root.render(scope(value, transport)));
  button('Confirm').focus(); await act(async () => button('Confirm').click());
  expect(button('Confirm').disabled).toBe(true); expect(document.activeElement).toBe(button('Reload current state'));
});
it('retains the current revision and unknown lock when a standalone saved-state read goes backward', async () => {
  const value = { ...record(), revision: 5 };
  const transport = { read: async () => ({ ...value, revision: 4, title: 'STALE SAVED STATE' }), mutate: async () => { throw new RebuildUnconfirmedError(); }, start: async () => value };
  await unknown(value, transport); await act(async () => button('Reload current state').click());
  expect(node.textContent).not.toContain('STALE SAVED STATE');
  expect(button('Reload current state')).toBeDefined(); expect(button('Publish approved website').disabled).toBe(true);
});
