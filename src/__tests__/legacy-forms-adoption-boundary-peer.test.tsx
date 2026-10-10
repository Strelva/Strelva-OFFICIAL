// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {WebsiteExperience} from '@/experience/websites/WebsiteExperience';
import {currentWebsiteRecord,parseWebsiteRecord} from '@/experience/websites/contracts';
import {formsRecord,formOptions,workspaceId,workId} from './legacy-forms-boundary-peer.fixture';
it('holds a form acknowledgement whose launch metadata fails the existing current-record guard',async()=>{
 const fixture=formsRecord(1,2,false);if(!('website' in fixture))throw new Error('Legacy fixture required');
 const next={...fixture,website:{...fixture.website,launch:{status:'pending',candidateRevision:2,receipt:null,failure:null}}};
 const parsed=parseWebsiteRecord(next,workspaceId);expect(()=>currentWebsiteRecord(parsed,workspaceId,workId)).toThrow('could not be confirmed');
 const saved=vi.fn();const request=vi.fn<typeof fetch>().mockImplementation(async(url,init)=>Response.json(String(url).endsWith('/connections')?init?.method==='POST'?next:formOptions:formsRecord(1)));
 vi.stubGlobal('fetch',request);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const button=(name:string)=>[...node.querySelectorAll('button')].find(b=>b.textContent?.trim()===name)!;
 try{
  await act(async()=>root.render(createElement(WebsiteExperience,{workspaceId,workId,onSaved:saved})));
  await act(async()=>button('Choose forms').click());const select=node.querySelectorAll('select')[1]!;
  await act(async()=>{select.value='catering';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>button('Update website preview').click());
  expect(request.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
  expect(saved).not.toHaveBeenCalled();expect(button('Reload current state')).toBeDefined();expect(node.textContent).not.toContain('Website forms updated.');
 }finally{await act(async()=>root.unmount());node.remove();vi.unstubAllGlobals();}
});
