import { describe, expect, it, vi } from 'vitest';
import { neutralCreatorMoneyCommandSchema, neutralVersionCollectionCommandSchema, neutralReceiptMatches, neutralReviewedReceiptMatches, reconcileNeutralVersionMoney, type NeutralPaidVersionReceipt } from '@/platform/connect/neutral-creator-contract';
import { prepareNeutralVersionCollection, readNeutralCreatorSources, readNeutralVersionMoney, recordNeutralCreatorMoney } from '@/platform/connect/neutral-creator-money';
const workspaceId='11111111-1111-4111-8111-111111111111', actorId='22222222-2222-4222-8222-222222222222', other='33333333-3333-4333-8333-333333333333';
const actor={userId:actorId,verifiedEmail:'owner@example.test'};
const command={workspaceId,versionId:other,releaseNumber:1,lineId:actorId,priceVersion:'Explicit source price',amountCents:1700,currency:'cad',periodStart:'2099-01-01T00:00:00.000001Z',periodEnd:'2099-02-01T00:00:00.000002Z'};
const receipt:NeutralPaidVersionReceipt={line_id:command.lineId,business_workspace_id:workspaceId,version_id:other,release_number:1,source_system_id:actorId,source_revision_id:other,listing_id:actorId,creator_workspace_id:other,price_version:command.priceVersion,period_start:command.periodStart,period_end:command.periodEnd,maintainer_state:'creator',agreement_version:'Explicit creator agreement',rate_reference:'Explicit rate',rate_bps:170,payer_kind:'business',payer_workspace_id:workspaceId,accepted_by:actorId,accepted_at:'2026-10-09T10:00:00+00:00',amountCents:1700,currency:'cad',collectionDispatch:'not_configured'};
const db=(data:unknown,error:string|null=null)=>({rpc:vi.fn(async()=>({data,error:error?{message:error}:null}))});
describe('neutral qualified source and paid Version money contracts',()=>{
 it('never accepts client actor, source, creator, customer, payer, offering or royalty-rate overrides in owner commands',()=>{
  expect(neutralVersionCollectionCommandSchema.parse(command)).toEqual(command);
  for(const changed of [{userId:other},{sourceRevisionId:other},{creatorWorkspaceId:other},{customerId:'cus_Forged'},{payerWorkspaceId:other},{installationId:other},{rateBps:9999}]) expect(()=>neutralVersionCollectionCommandSchema.parse({...command,...changed})).toThrow();
 });
 it('compares positive periods at exact PostgreSQL microseconds rather than rounded milliseconds',()=>{
  expect(()=>neutralVersionCollectionCommandSchema.parse({...command,periodStart:'2099-01-01T00:00:00.000001Z',periodEnd:'2099-01-01T00:00:00.000002Z'})).not.toThrow();
  expect(()=>neutralVersionCollectionCommandSchema.parse({...command,periodStart:'2099-01-01T00:00:00.000002Z',periodEnd:'2099-01-01T00:00:00.000001Z'})).toThrow();
  expect(()=>neutralVersionCollectionCommandSchema.parse({...command,periodEnd:command.periodStart})).toThrow();
 });
 it('binds receipt to exact owner, real Version, quote and microseconds while allowing equivalent UTC offsets',()=>{
  expect(neutralReceiptMatches(receipt,command,actorId)).toBe(true);
  expect(neutralReceiptMatches({...receipt,period_start:'2098-12-31T19:00:00.000001-05:00'},command,actorId)).toBe(true);
  for(const changed of [{accepted_by:other},{version_id:actorId},{price_version:'Foreign price'},{amountCents:1701},{currency:'usd'},{period_start:'2099-01-01T00:00:00.000002Z'}]) expect(neutralReceiptMatches({...receipt,...changed},command,actorId)).toBe(false);
 });
 it('requires explicit creator commercial values, no defaults, and a real source revision without caller-selected definition identity',()=>{
  const agreement={action:'record_creator_agreement',sourceRevisionId:other,version:'Written agreement',rateReference:'Written rate',rateBps:170,effectiveFrom:'2099-01-01T00:00:00.000001Z',effectiveUntil:null};
  expect(neutralCreatorMoneyCommandSchema.parse(agreement)).toEqual(agreement);
  for(const changed of [{rateBps:undefined},{definitionId:'private_staff_requests'},{approvedBy:other},{beneficiaryWorkspaceId:other}]) expect(()=>neutralCreatorMoneyCommandSchema.parse({...agreement,...changed})).toThrow();
 });
 it('uses server-authenticated owner identity and sends no provider request to record a period',async()=>{
  const database=db(receipt);expect(await prepareNeutralVersionCollection(actor,command,database)).toEqual(receipt);expect(database.rpc).toHaveBeenCalledWith('prepare_neutral_version_collection',{p_command:command,p_user_id:actorId,p_verified_email:'owner@example.test'});
  await expect(prepareNeutralVersionCollection(actor,command,db({...receipt,accepted_by:other}))).rejects.toThrow('exact command');
 });
 it('refuses a foreign creator workspace or invented source definition in current readback',async()=>{
  const source={sourceSystemId:actorId,sourceRevisionId:other,creatorWorkspaceId:workspaceId,definitionId:`system-source:${actorId}`,name:'Qualified native source',revision:1,qualified:true,listingId:null,listingAgreementVersion:null,listingRateReference:null};
  const graph={workspaceId,canRegister:true,sources:[source],agreements:[]};expect(await readNeutralCreatorSources(actor,workspaceId,db(graph))).toEqual(graph);
  await expect(readNeutralCreatorSources(actor,workspaceId,db({...graph,sources:[{...source,creatorWorkspaceId:other}]}))).rejects.toThrow('this workspace');
  await expect(readNeutralCreatorSources(actor,workspaceId,db({...graph,sources:[{...source,definitionId:'private_staff_requests'}]}))).rejects.toThrow('this workspace');
 });
 it('keeps retained paid-period reads available without pretending a new price or current source is qualified',async()=>{
  const graph={workspaceId,canPrepare:false,customerConfigured:false,payerKind:'business' as const,payerWorkspaceId:workspaceId,installations:[],prices:[],history:[receipt],collectionDispatch:'not_configured'};
  expect(await readNeutralVersionMoney(actor,workspaceId,db(graph))).toEqual(graph);await expect(readNeutralVersionMoney(actor,workspaceId,db({...graph,history:[{...receipt,business_workspace_id:other}]}))).rejects.toThrow('this workspace');
 });
 it('does not confirm a foreign operator acknowledgment even for matching exact written terms',async()=>{
  const written={action:'record_source_price' as const,sourceRevisionId:other,version:'Explicit source price',amountCents:1700,currency:'cad',effectiveFrom:'2099-01-01T00:00:00Z',effectiveUntil:null};
  await expect(recordNeutralCreatorMoney(actor,written,db({action:written.action,recordedBy:other,replayed:false,creatorWorkspaceId:workspaceId,definitionId:`system-source:${actorId}`,command:written}))).rejects.toThrow();
 });
 it('refuses current owner/creator/qualification/exit loss as an actual RPC failure',async()=>{
  for(const error of ['collection_owner_required','workspace_exit_future_work_blocked','creator_listing_unqualified','neutral_creator_not_configured']) await expect(prepareNeutralVersionCollection(actor,command,db(null,error))).rejects.toThrow();
 });
});

const reviewed={versionId:other,releaseNumber:1,name:'Installed real Version',sourceSystemId:actorId,sourceRevisionId:other,creatorWorkspaceId:other,definitionId:`system-source:${actorId}`,listingId:actorId,qualified:true,released:true};
it('binds direct ACK and unknown GET recovery to every reviewed source/listing/creator identity before graph adoption',()=>{
 expect(neutralReviewedReceiptMatches(receipt,command,actorId,reviewed)).toBe(true);
 for(const changed of [{release_number:2},{source_system_id:other},{source_revision_id:actorId},{listing_id:other},{creator_workspace_id:actorId},{accepted_by:other},{period_start:'2099-01-01T00:00:00.000002Z'}]) {
  const candidate={...receipt,...changed};expect(neutralReviewedReceiptMatches(candidate,command,actorId,reviewed)).toBe(false);
  const graph={workspaceId,canPrepare:true,customerConfigured:true,payerKind:'business' as const,payerWorkspaceId:workspaceId,installations:[reviewed],prices:[],history:[candidate],collectionDispatch:'not_configured' as const};
  expect(()=>reconcileNeutralVersionMoney(graph,workspaceId,actorId,{command,reviewed})).toThrow('facts changed');
 }
 const exact={workspaceId,canPrepare:false,customerConfigured:false,payerKind:'business' as const,payerWorkspaceId:workspaceId,installations:[],prices:[],history:[receipt],collectionDispatch:'not_configured' as const};
 expect(reconcileNeutralVersionMoney(exact,workspaceId,actorId,{command,reviewed})).toEqual(receipt);
 expect(reconcileNeutralVersionMoney({...exact,history:[]},workspaceId,actorId,{command,reviewed})).toBeNull();
});
