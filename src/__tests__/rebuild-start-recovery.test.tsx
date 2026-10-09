// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RebuildExperience } from '@/experience/websites/RebuildExperience';
import { parseRebuildView, serverRebuildTransport, type RebuildTransport, type RebuildView } from '@/experience/websites/rebuild-transport';
import { rebuildHttpFailure } from '@/app/api/websites/rebuild-http';
import { harness, actor, workspaceId } from './rebuild-recovery-independent-harness';
let root: Root; let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); node = document.createElement('div'); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => Array.from(node.querySelectorAll('button')).find(b => b.textContent?.trim() === label)!;
async function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function intake(transport: RebuildTransport = serverRebuildTransport) {
  await act(async () => root.render(createElement(RebuildExperience, { workspaceId, initialRequest: 'We bake bread for Saturday pickup.', transport })));
  await type(node.querySelector('input')!, 'Fictional Bread');
}
it.each([false, true])('reopens exactly one committed native request after lost acknowledgement, retaining its original fields and ID (deferred: %s)', async deferred => {
  const h = harness(); const bodies: unknown[] = []; let lose = true;
  vi.stubGlobal('fetch', vi.fn(async (_path: string, options?: RequestInit) => {
    const input = JSON.parse(String(options?.body)); bodies.push(input);
    try {
      const { workspaceId: ws, ...command } = input;
      const result = await h.service.create(actor, ws, command, deferred);
      if (lose) { lose = false; throw new Error('Lost acknowledgement after commit'); }
      return Response.json(result);
    } catch (cause) { return rebuildHttpFailure(cause); }
  }));
  await intake(); button('Build a private preview').focus();
  await act(async () => button('Build a private preview').click());
  expect(h.works.size).toBe(1);
  const name = node.querySelector('input')!; const description = node.querySelector('textarea')!;
  expect(name.disabled).toBe(true); expect(description.disabled).toBe(true);
  expect(button('Build a private preview').disabled).toBe(true);
  expect(button('Use an existing website').disabled).toBe(true);
  expect(document.activeElement).toBe(button('Check this website request'));
  await type(name, 'CHANGED BODY MUST NOT REPLACE COMMAND');
  await type(description, 'CHANGED DESCRIPTION');
  await act(async () => { button('Check this website request').click(); button('Check this website request').click(); });
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
  expect(h.works.size).toBe(1); expect(h.pipeline).toHaveBeenCalledTimes(deferred ? 0 : 1);
  expect(node.textContent).toContain('Fictional Bread'); expect(button('Check this website request')).toBeUndefined();
});
it('does not settle an unknown request with a later authentication refusal', async () => {
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => { calls++; return Response.json({ error: calls === 1 ? 'Unknown' : 'Sign in' }, { status: calls === 1 ? 503 : 401 }); }));
  await intake(); await act(async () => button('Build a private preview').click());
  await act(async () => button('Check this website request').click());
  expect(button('Build a private preview').disabled).toBe(true); expect(button('Check this website request')).toBeDefined();
});
it('admits a fresh command only after the initial authentication refusal', async () => {
  const bodies: Array<{ requestId: string; businessName: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (_path: string, options?: RequestInit) => { bodies.push(JSON.parse(String(options?.body))); return Response.json({ error: 'Sign in' }, { status: 401 }); }));
  await intake(); await act(async () => button('Build a private preview').click());
  expect(button('Check this website request')).toBeUndefined(); expect(node.querySelector('input')!.disabled).toBe(false);
  await type(node.querySelector('input')!, 'Fresh Bread'); await act(async () => button('Build a private preview').click());
  expect(bodies[1]!.requestId).not.toBe(bodies[0]!.requestId); expect(bodies[1]!.businessName).toBe('Fresh Bread');
});
it.each(['permission', 'permission-round-trip', 'workspace'] as const)('rejects delayed creation after %s changes without discarding the same-scope attempt', async change => {
  const h = harness(); const raw = await h.create(); const record = parseRebuildView(raw);
  let resolve!: (value: RebuildView) => void;
  const pending = new Promise<RebuildView>(yes => { resolve = yes; });
  const start = vi.fn(() => pending); const transport = { read: async () => record, mutate: async () => record, start };
  await intake(transport); await act(async () => button('Build a private preview').click());
  await act(async () => root.render(createElement(RebuildExperience, { workspaceId: change === 'workspace' ? '71000000-0000-4000-8000-000000000009' : workspaceId, readOnly: change !== 'workspace', transport })));
  if (change === 'permission-round-trip') await act(async () => root.render(createElement(RebuildExperience, { workspaceId, transport })));
  await act(async () => resolve(record));
  expect(node.textContent).not.toContain(record.title);
  if (change !== 'workspace') {
    expect(button('Check this website request')).toBeDefined();
    await act(async () => root.render(createElement(RebuildExperience, { workspaceId, transport })));
    expect(button('Build a private preview').disabled).toBe(true);
  } else expect(button('Check this website request')).toBeUndefined();
});
