// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { WebsiteExperience } from '@/experience/websites/WebsiteExperience';
import { serverWebsiteTransport } from '@/experience/websites/contracts';
import { createWebsiteService } from '@/products/websites/server';
import { memoryBoundedStore, owner } from './fixtures/bounded-store';
import { brief, providerFixture } from './legacy-website-recovery-harness';
vi.mock('@/platform/infra/redis',()=>({getRedis:()=>null}));
let root:Root; let container:HTMLDivElement;
afterEach(async()=>{await act(async()=>root?.unmount());container?.remove();vi.unstubAllGlobals();});
const button=(name:string)=>[...container.querySelectorAll('button')].find(b=>b.textContent?.trim()===name)!;
const field=(value:string)=>[...container.querySelectorAll('input,textarea')].find(f=>(f as HTMLInputElement).value===value) as HTMLInputElement|HTMLTextAreaElement;
async function change(input:HTMLInputElement|HTMLTextAreaElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(input instanceof HTMLInputElement?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function mount(workId?:string,readOnly=false){vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(createElement(WebsiteExperience,{workspaceId:'workspace-a',workId,readOnly,transport:serverWebsiteTransport})));}
async function setup(approved=false){const provider=providerFixture();const service=createWebsiteService(memoryBoundedStore(),{provider});let record=await service.create(owner,'workspace-a',{requestId:'legacy-expanded-recovery',brief});if(approved){const candidate=record.website.candidate!;record=await service.approve(owner,record.workId,{expectedRevision:record.website.revision,candidateRevision:candidate.revision,candidateContentHash:candidate.contentHash});}return {service,provider,record};}
function route(service:ReturnType<typeof createWebsiteService>,workId:string,post:(body:Record<string,unknown>)=>Promise<Response>){vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request,init?:RequestInit)=>String(input).includes('/connections')?Response.json({tenants:[]}):init?.method==='POST'?post(JSON.parse(String(init.body))):Response.json(await service.read(owner,workId))));}
it('reconciles actual unknown creation using its immutable body and key, with one generation',async()=>{
 const provider=providerFixture();const service=createWebsiteService(memoryBoundedStore(),{provider});const bodies:string[]=[];let lost=true;
 vi.stubGlobal('fetch',vi.fn(async(_input:string|URL|Request,init?:RequestInit)=>{if(init?.method!=='POST')return Response.json({tenants:[]});bodies.push(String(init.body));const {action:_action,workspaceId,...input}=JSON.parse(String(init.body));const result=await service.create(owner,workspaceId,input);if(lost){lost=false;throw new TypeError('response lost after create');}return Response.json(result);}));
 await mount();await change(container.querySelector('input')!,brief.businessName);await change(container.querySelector('textarea')!,brief.description);
 const submit=button('Generate a private preview');submit.focus();await act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(bodies).toHaveLength(1);expect(provider.generate).toHaveBeenCalledTimes(1);expect(container.querySelector('textarea')!.disabled).toBe(true);expect(document.activeElement).toBe(button('Check this website request'));
 await change(container.querySelector('textarea')!,'Changed after unknown'); // Synthetic event cannot change the captured attempt.
 await act(async()=>root.render(createElement(WebsiteExperience,{workspaceId:'workspace-a',readOnly:true,transport:serverWebsiteTransport})));
 expect(button('Check this website request').disabled).toBe(true);await act(async()=>button('Check this website request').click());expect(bodies).toHaveLength(1);
 await act(async()=>root.render(createElement(WebsiteExperience,{workspaceId:'workspace-a',transport:serverWebsiteTransport})));
 await act(async()=>button('Check this website request').click());expect(bodies).toHaveLength(2);expect(bodies[1]).toBe(bodies[0]);expect(provider.generate).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('Private preview ready');expect(document.activeElement).toBe(container.querySelector('h1'));
});
it.each([false,true])('keeps the pending draft through failed read and recovers without another write, outsidefocus=%s',async(moved)=>{
 const {service,record}=await setup(true);let posts=0;let failRead=false;let release!:(r:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{if(String(input).includes('/connections'))return Response.json({tenants:[]});if(init?.method==='POST'){posts++;const {action:_action,...body}=JSON.parse(String(init.body));await service.revise(owner,record.workId,body);return new Promise<Response>(resolve=>{release=resolve;});}if(failRead)throw new Error('read failed');return Response.json(await service.read(owner,record.workId));}));
 await mount(record.workId);await change(field(brief.description),'Keep my correction');const source=button('Generate a new preview');source.focus();await act(async()=>source.click());
 const outside=document.createElement('button');outside.textContent='Other System';document.body.append(outside);if(moved)outside.focus();
 await act(async()=>release(Response.json(null)));expect(posts).toBe(1);expect(field('Keep my correction').disabled).toBe(true);expect(document.activeElement).toBe(moved?outside:button('Reload current state'));
 failRead=true;await act(async()=>button('Reload current state').click());expect(field('Keep my correction').value).toBe('Keep my correction');expect(button('Generate a new preview').disabled).toBe(true);
 failRead=false;await act(async()=>button('Reload current state').click());expect(posts).toBe(1);expect(field('Keep my correction').value).toBe('Keep my correction');expect(container.textContent).not.toContain('Approved revision');outside.remove();
});
it('discards delayed authority reads after loss and regain, and keeps unknown state',async()=>{
 const {service,record}=await setup();let reads=0;let finish!:(r:Response)=>void;let posts=0;
 vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{if(String(input).includes('/connections'))return Response.json({tenants:[]});if(init?.method==='POST'){posts++;throw new TypeError('unknown');}reads++;if(reads===2)return new Promise<Response>(resolve=>{finish=resolve;});return Response.json(await service.read(owner,record.workId));}));
 await mount(record.workId);await act(async()=>button('Approve this preview').click());await act(async()=>button('Reload current state').click());
 await act(async()=>root.render(createElement(WebsiteExperience,{workspaceId:'workspace-a',workId:record.workId,readOnly:true,transport:serverWebsiteTransport})));
 await act(async()=>root.render(createElement(WebsiteExperience,{workspaceId:'workspace-a',workId:record.workId,transport:serverWebsiteTransport})));
 await act(async()=>finish(Response.json(record)));expect(button('Reload current state')).toBeDefined();expect(button('Approve this preview').disabled).toBe(true);expect(posts).toBe(1);
 await act(async()=>button('Reload current state').click());expect(button('Reload current state')).toBeUndefined();
});
it.each(['stale','foreign','wrong-candidate','false-approval'] as const)('rejects valid-schema but %s approval acknowledgement',async(kind)=>{
 const {service,record}=await setup();const candidate=record.website.candidate!;let ack=await service.approve(owner,record.workId,{expectedRevision:record.website.revision,candidateRevision:candidate.revision,candidateContentHash:candidate.contentHash});
 if(kind==='stale')ack=record;if(kind==='foreign')ack={...ack,workId:'other-work'};if(kind==='wrong-candidate')ack={...ack,website:{...ack.website,candidate:{...ack.website.candidate!,contentHash:'f'.repeat(64),preview:{...ack.website.candidate!.preview,contentHash:'f'.repeat(64)}}}};if(kind==='false-approval')ack={...ack,website:{...ack.website,approvedCandidateRevision:null}};
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(ack)));
 await expect(serverWebsiteTransport.approve({workspaceId:record.workspaceId,workId:record.workId,expectedRevision:record.website.revision,candidateRevision:candidate.revision,candidateContentHash:candidate.contentHash})).rejects.toThrow('could not be confirmed');
});
it('accepts the actual saved candidate approval and launch where work revision advances separately',async()=>{
 const {service,record}=await setup();route(service,record.workId,async({action,...body})=>Response.json(action==='approve'?await service.approve(owner,record.workId,body):await service.prepareLaunch(owner,record.workId,body)));
 await mount(record.workId);await act(async()=>button('Approve this preview').click());const approved=await service.read(owner,record.workId);expect(approved.website.revision).toBe(2);expect(approved.website.candidate!.revision).toBe(1);expect(button('Prepare launch')).toBeDefined();await act(async()=>button('Prepare launch').click());expect(container.textContent).toContain('Launch preparation is still pending');expect((await service.read(owner,record.workId)).website.revision).toBe(4);
});
it('keeps an unknown creation frozen when its explicit check later loses authorization',async()=>{
 let posts=0;vi.stubGlobal('fetch',vi.fn(async()=>{posts++;if(posts===1)throw new TypeError('unknown');return Response.json({error:'Sign in to create website work.'},{status:401});}));
 await mount();await change(container.querySelector('input')!,'Fictional Florist');await change(container.querySelector('textarea')!,'Local flowers.');await act(async()=>button('Generate a private preview').click());await act(async()=>button('Check this website request').click());expect(posts).toBe(2);expect(container.querySelector('textarea')!.disabled).toBe(true);expect(button('Check this website request')).toBeDefined();expect(button('Generate a private preview').disabled).toBe(true);
});
it('does not adopt a successful write completed under an earlier permission generation',async()=>{
 const {service,record}=await setup();let finish!:(r:Response)=>void;
 route(service,record.workId,async({action:_action,...body})=>{const next=await service.approve(owner,record.workId,body);return new Promise<Response>(resolve=>{finish=()=>resolve(Response.json(next));});});
 await mount(record.workId);await act(async()=>button('Approve this preview').click());await act(async()=>root.render(createElement(WebsiteExperience,{workspaceId:'workspace-a',workId:record.workId,readOnly:true,transport:serverWebsiteTransport})));await act(async()=>finish(Response.json(null)));expect(button('Reload current state')).toBeDefined();expect(container.textContent).not.toContain('Approved revision');await act(async()=>button('Reload current state').click());expect(container.textContent).toContain('Approved revision');expect(button('Prepare launch')).toBeUndefined();
});
it('refuses a foreign recovery read without losing the retained correction or unlocking writes',async()=>{
 const {service,record}=await setup(true);let reads=0;
 vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{if(String(input).includes('/connections'))return Response.json({tenants:[]});if(init?.method==='POST')throw new TypeError('unknown');reads++;return Response.json(reads===1?record:{...await service.read(owner,record.workId),workspaceId:'other-workspace'});}));
 await mount(record.workId);await change(field(brief.description),'My retained draft');await act(async()=>button('Generate a new preview').click());await act(async()=>button('Reload current state').click());expect(field('My retained draft').value).toBe('My retained draft');expect(button('Generate a new preview').disabled).toBe(true);expect(button('Reload current state')).toBeDefined();
});
