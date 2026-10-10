// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {RebuildExperience} from '@/experience/websites/RebuildExperience';
import {fixtureRebuild} from '@/experience/websites/rebuild-fixture';
it('retains an exact pending domain request across operator permission loss in its actual parent',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const record=fixtureRebuild('published');let finish!:(r:Response)=>void;
 const request=vi.fn<typeof fetch>().mockImplementation(async(url,init)=>String(url).includes('/report?')?Response.json({error:'Fictional report unavailable'},{status:503}):String(url).endsWith('/domain/request')&&init?.method==='POST'?new Promise<Response>(resolve=>{finish=resolve;}):Response.json(String(url).includes('/connections')?{tenants:[]}:String(url).includes('/history')?{revisions:[]}:{}));
 vi.stubGlobal('fetch',request);const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const button=(name:string)=>[...node.querySelectorAll('button')].find(b=>b.textContent?.trim()===name);
 const render=(operator:boolean)=>root.render(createElement(RebuildExperience,{workspaceId:record.workspaceId,workId:record.workId,initialRecord:record,managed:true,operator}));
 try{
  await act(async()=>render(true));const input=[...node.querySelectorAll('input')].find(i=>i.placeholder==='your-business.com')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'fictional.example.test');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Ask owner to approve domain')!.click());
  expect(request.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
  await act(async()=>render(false));await act(async()=>finish(Response.json({error:'Unconfirmed saved proposal'},{status:503})));
  await act(async()=>render(true));
  expect(button('Check saved domain request')).toBeDefined();
  expect([...node.querySelectorAll('input')].find(i=>i.placeholder==='your-business.com')!.value).toBe('fictional.example.test');
 }finally{await act(async()=>root.unmount());node.remove();vi.unstubAllGlobals();}
});
