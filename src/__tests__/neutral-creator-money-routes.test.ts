import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),operator:vi.fn(),release:vi.fn(),limited:vi.fn(),read:vi.fn(),prepare:vi.fn(),listing:vi.fn(),record:vi.fn()}));
vi.mock('@/platform/infra/db/server-client',()=>({getSessionUser:mocks.session}));
vi.mock('@/platform/infra/auth',()=>({getAuthenticatedOperatorContext:mocks.operator}));
vi.mock('@/platform/workspace-release',()=>({workspaceReleaseEnabled:mocks.release}));
vi.mock('@/platform/infra/rate-limit',()=>({isRateLimitedWindowedAsync:mocks.limited}));
vi.mock('@/platform/connect/neutral-creator-money',async original=>({...await original<typeof import('@/platform/connect/neutral-creator-money')>(),readNeutralVersionMoney:mocks.read,prepareNeutralVersionCollection:mocks.prepare,registerNeutralCreatorListing:mocks.listing,recordNeutralCreatorMoney:mocks.record}));
import{GET,POST}from '@/app/api/workspace/version-money-preparation/route';
import{POST as listingPOST}from '@/app/api/workspace/creator-source-money/route';
import{POST as operatorPOST}from '@/app/api/admin/creator-source-money/route';
const workspaceId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const command={workspaceId,versionId:other,releaseNumber:1,lineId:other,priceVersion:'Written source price',amountCents:1700,currency:'cad',periodStart:'2099-01-01T10:00:00Z',periodEnd:'2099-02-01T10:00:00Z'};
const post=(body:unknown=command,headers:Record<string,string>={})=>new Request('https://strelva.test/api/workspace/version-money-preparation',{method:'POST',headers:{origin:'https://strelva.test','content-type':'application/json',...headers},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('STRELVA_REVENUE_SPLITS','1');mocks.release.mockReturnValue(true);mocks.session.mockResolvedValue({id:userId,email:'Owner@Example.test',email_confirmed_at:'2026-10-09'});mocks.operator.mockResolvedValue({actor:{userId,verifiedEmail:'operator@example.test'}});mocks.limited.mockResolvedValue(false);mocks.read.mockResolvedValue({workspaceId});mocks.prepare.mockResolvedValue({collectionDispatch:'not_configured'});mocks.listing.mockResolvedValue({});mocks.record.mockResolvedValue({});});
it('requires actual verified session and current release flags before selecting paid Version terms',async()=>{
 vi.stubEnv('STRELVA_REVENUE_SPLITS','0');expect((await POST(post())).status).toBe(503);expect(mocks.session).not.toHaveBeenCalled();vi.stubEnv('STRELVA_REVENUE_SPLITS','1');expect((await POST(post())).status).toBe(200);expect(mocks.prepare).toHaveBeenCalledWith({userId,verifiedEmail:'owner@example.test'},command);mocks.session.mockResolvedValue({id:userId,email:'owner@example.test'});expect((await POST(post())).status).toBe(401);
});
it('refuses actor/customer/payer/creator/source overrides, cross-origin, oversized body and missing publication pin',async()=>{
 for(const changed of [{userId:other},{customerId:'cus_Foreign'},{payerWorkspaceId:other},{sourceRevisionId:other},{rateBps:1},{releaseNumber:undefined}])expect((await POST(post({...command,...changed}))).status).toBe(400);
 expect((await POST(post(command,{origin:'https://foreign.test'}))).status).toBe(403);expect((await POST(post({...command,extra:'x'.repeat(9000)}))).status).toBe(413);expect(mocks.prepare).not.toHaveBeenCalled();
});
it('returns private current owner readback and rate limits before any mutation producer',async()=>{
 const result=await GET(new Request(`https://strelva.test/api/workspace/version-money-preparation?workspaceId=${workspaceId}`));expect(result.headers.get('cache-control')).toBe('private, no-store');expect(mocks.read).toHaveBeenCalledWith({userId,verifiedEmail:'owner@example.test'},workspaceId);mocks.limited.mockResolvedValue(true);expect((await POST(post())).status).toBe(429);expect(mocks.prepare).not.toHaveBeenCalled();
});
it('lists a real creator revision using the actual current actor, without offering/builtin override',async()=>{
 const listing={workspaceId,sourceRevisionId:other,agreementVersion:'Written creator agreement',rateReference:'Written rate'};expect((await listingPOST(post(listing))).status).toBe(200);expect(mocks.listing).toHaveBeenCalledWith({userId,verifiedEmail:'owner@example.test'},listing);expect((await listingPOST(post({...listing,definitionId:'private_staff_requests'}))).status).toBe(400);
});
it('records explicit written source terms only through the real platform operator',async()=>{
 const agreement={action:'record_creator_agreement',sourceRevisionId:other,version:'Written creator agreement',rateReference:'Written rate',rateBps:170,effectiveFrom:'2099-01-01T00:00:00Z',effectiveUntil:null};expect((await operatorPOST(post(agreement))).status).toBe(200);expect(mocks.record).toHaveBeenCalledWith({userId,verifiedEmail:'operator@example.test'},agreement);expect((await operatorPOST(post({...agreement,creatorWorkspaceId:workspaceId}))).status).toBe(400);mocks.operator.mockResolvedValue(null);expect((await operatorPOST(post(agreement))).status).toBe(403);
});
