// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WebsiteDomainRequest } from '@/experience/websites/WebsiteRecoveryControls';
it('does not claim an owner domain request was saved after a malformed success acknowledgement', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const request=vi.fn(async()=>Response.json(null));
  try {
    await act(async()=>root.render(createElement(WebsiteDomainRequest,{workId:'71000000-0000-4000-8000-000000000003',request})));
    const input=container.querySelector('input')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'fictional.example.test');input.dispatchEvent(new Event('input',{bubbles:true}));});
    await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(request).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('Domain request saved for the owner.');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  } finally {await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});
