// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {RebuildExperience} from '@/experience/websites/RebuildExperience';
import {harness,actor} from './rebuild-recovery-independent-harness';
it('does not admit routing undo while the same work retains a pending domain preparation after operator loss',async()=>{
 const h=harness();const published=await h.launch(await h.create());let finish!:(r:Response)=>void;
 const posts:string[]=[];const request=vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
  const path=String(url);if(init?.method==='POST'){posts.push(path);if(path.includes('/domain/request'))return new Promise<Response>(resolve=>{finish=resolve;});return Response.json({receipt:null});}
  if(path.includes('/rebuild?'))return Response.json(await h.service.read(actor,published.workId));
  if(path.includes('/history?'))return Response.json({revisions:[]});if(path.includes('/domain?'))return Response.json({domain:{hostname:'fictional.example.test',status:'verified',checkedAt:'2026-10-09T00:00:00Z',records:[]}});
  return Response.json({error:'Unneeded fictional read'},{status:503});
 });
 vi.stubGlobal('fetch',request);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const render=(operator:boolean)=>root.render(createElement(RebuildExperience,{workspaceId:published.workspaceId,workId:published.workId,operator,canPublish:true}));
 const button=(name:string)=>[...node.querySelectorAll('button')].find(b=>b.textContent?.trim()===name)!;
 try{
  await act(async()=>render(true));const domain=node.querySelector('section[aria-label="Owner domain request"]')!;const input=domain.querySelector('input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'fictional.example.test');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Ask owner to approve domain').click());expect(posts).toHaveLength(1);
  await act(async()=>render(false));const undo=node.querySelector('section[aria-labelledby="cutover-undo-heading"]')!;
  await act(async()=>undo.querySelectorAll('input').forEach(input=>input.click()));
  await act(async()=>undo.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(posts).toHaveLength(1);
 }finally{if(finish)await act(async()=>finish(Response.json({error:'Fictional lost response'},{status:503})));await act(async()=>root.unmount());node.remove();vi.unstubAllGlobals();}
});
