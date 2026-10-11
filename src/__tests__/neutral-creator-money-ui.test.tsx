// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {VersionTerms} from '@/experience/workspace/money/VersionTerms';
import type {NeutralVersionMoneyGraph} from '@/platform/connect/neutral-creator-contract';
const workspace='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',version='33333333-3333-4333-8333-333333333333',source='44444444-4444-4444-8444-444444444444';
const installed={versionId:version,releaseNumber:1,name:'Live installed business app',sourceSystemId:source,sourceRevisionId:source,creatorWorkspaceId:source,definitionId:`system-source:${source}`,listingId:source,qualified:true,released:true};
const graph:NeutralVersionMoneyGraph={workspaceId:workspace,canPrepare:true,customerConfigured:true,payerKind:'business' as const,payerWorkspaceId:workspace,installations:[installed],prices:[{version:'Written source price',amountCents:1700,currency:'cad',definitionId:installed.definitionId,effectiveFrom:'2026-01-01T00:00:00Z',effectiveUntil:null}],history:[],collectionDispatch:'not_configured'};
const roots:ReturnType<typeof createRoot>[]=[];
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
async function mount(value=graph,request=vi.fn<typeof fetch>()){const node=document.createElement('div');document.body.append(node);const root=createRoot(node);roots.push(root);await act(async()=>root.render(createElement(VersionTerms,{graph:value,actorId:actor,request})));return{node,root,request};}
async function change(field:HTMLInputElement|HTMLSelectElement,value:string){const prototype=field instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event(field instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
async function fill(node:HTMLElement){await change(node.querySelectorAll('select')[0]!,version);await change(node.querySelectorAll('select')[1]!,graph.prices[0]!.version);await change(node.querySelectorAll('input')[0]!,'2099-01-01T10:00');await change(node.querySelectorAll('input')[1]!,'2099-02-01T10:00');}
async function submit(node:HTMLElement){await act(async()=>{node.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
async function reload(node:HTMLElement){await act(async()=>{[...node.querySelectorAll('button')].find(item=>item.textContent==='Reload Version terms and history')!.click();});}
function receipt(command:Record<string,unknown>){return {line_id:command.lineId,business_workspace_id:workspace,version_id:version,release_number:1,source_system_id:source,source_revision_id:source,listing_id:source,creator_workspace_id:source,price_version:command.priceVersion,period_start:command.periodStart,period_end:command.periodEnd,maintainer_state:'creator',agreement_version:'Written creator agreement',rate_reference:'Written creator rate',rate_bps:170,payer_kind:'business',payer_workspace_id:workspace,accepted_by:actor,accepted_at:'2026-10-09T10:00:00+00:00',amountCents:1700,currency:'cad',collectionDispatch:'not_configured'};}
beforeEach(()=>vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true));afterEach(async()=>{for(const root of roots.splice(0))await act(async()=>root.unmount());document.body.innerHTML='';vi.unstubAllGlobals();});
it('admits only released qualified real Versions and hides owner acceptance in read-only or unconfigured state',async()=>{
 for(const value of [{...graph,canPrepare:false},{...graph,customerConfigured:false}]){const{node}=await mount(value);expect(node.querySelector('form')).toBeNull();}
 const{node}=await mount({...graph,installations:[{...installed,qualified:false},{...installed,versionId:actor,released:false}]});expect([...node.querySelectorAll('option')].some(option=>option.value===version||option.value===actor)).toBe(false);
});
it('posts the actual selected Version/release and explicit quote, without actor/payer/source override or any collection request',async()=>{
 const request=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>response(receipt(JSON.parse(String(init!.body)))));const{node}=await mount(graph,request);await fill(node);await submit(node);
 const body=JSON.parse(String(request.mock.calls[0]![1]!.body));expect(body).toMatchObject({workspaceId:workspace,versionId:version,releaseNumber:1,priceVersion:'Written source price',amountCents:1700,currency:'cad'});for(const key of ['acceptedBy','payerWorkspaceId','sourceRevisionId','customerId','rateBps'])expect(body).not.toHaveProperty(key);
 expect(request.mock.calls).toHaveLength(1);expect(node.textContent).toContain('No payment was collected');expect(node.querySelector('input')!.disabled).toBe(true);
});
it('keeps the original graph and uncertain command when schema-valid GET changes source lineage, actor or publication',async()=>{
 for(const altered of [{creator_workspace_id:actor},{source_revision_id:actor},{release_number:2},{accepted_by:source}]){let issued:Record<string,unknown>={};const request=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>{if(init?.method==='POST'){issued=JSON.parse(String(init.body));return response({error:'Lost response'},500);}return response({...graph,history:[{...receipt(issued),...altered}]});});const{node}=await mount(graph,request);await fill(node);await submit(node);await reload(node);expect(node.textContent).toContain('facts changed');expect(node.textContent).toContain('No paid Version period has been recorded');expect(node.textContent).not.toContain('Written creator agreement');expect(node.querySelector('input')!.disabled).toBe(true);expect(request.mock.calls).toHaveLength(2);}
});
it('confirms an exact already-recorded response after owner future work closes, preserving original UTC precision',async()=>{
 let issued:Record<string,unknown>={};const request=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>{if(init?.method==='POST'){issued=JSON.parse(String(init.body));return response({error:'Lost response'},500);}return response({...graph,canPrepare:false,customerConfigured:false,history:[receipt(issued)]});});const{node}=await mount(graph,request);await fill(node);await submit(node);await reload(node);expect(node.textContent).toContain('Your exact paid Version period is recorded');expect(node.querySelector('form')).toBeNull();expect(request.mock.calls).toHaveLength(2);
});
