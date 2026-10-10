// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WebsiteCutoverUndo } from '@/experience/websites/WebsiteRecoveryControls';
import { fixtureRebuild } from '@/experience/websites/rebuild-fixture';
it('does not claim a restored website from an empty receipt', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const record={...fixtureRebuild(),tenantId:'fictional',publishedUrl:'https://fictional.example.test'};
  const request=vi.fn(async()=>Response.json({receipt:{}}));
  try {
    await act(async()=>root.render(createElement(WebsiteCutoverUndo,{record,request})));
    await act(async()=>container.querySelectorAll('input').forEach(input=>input.click()));
    await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(request).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('The previous website was restored.');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  } finally {await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});
