import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverRebuildTransport } from '@/experience/websites/rebuild-transport';
import { fixtureSiteDocument } from '@/experience/websites/rebuild-fixture';
const key={workId:'22222222-2222-4222-8222-222222222222',workspaceId:'11111111-1111-4111-8111-111111111111'};
const summary={archiveId:'a'.repeat(64),workspaceId:key.workspaceId,sourceWorkId:'44444444-4444-4444-8444-444444444444',sourceVersion:1,sourceRevision:4,sourceDigest:'b'.repeat(64),evidenceDigest:'c'.repeat(64),retainedCandidates:1,unresolvedCandidates:2};
function envelope(candidate:boolean){return {...key,rebuild:{version:2,revision:1,title:'Retained website',input:{requestId:'archive-read',url:'https://example.test'},status:candidate?'review_ready':'building',stages:[],checkpoint:null,candidate:candidate?{revision:1,contentHash:'d'.repeat(64),document:fixtureSiteDocument,previewHref:`/api/websites/${key.workId}/preview`}:null,approvedCandidateRevision:null,tenantId:null,launch:{receipt:null,readBack:null},lastError:null,createdBy:'33333333-3333-4333-8333-333333333333',createdAt:'2026-10-09T12:00:00.000Z',history:[]}};}
afterEach(()=>vi.unstubAllGlobals());
describe('independent actual production transport retained-history admission',()=>{
 for(const candidate of [true,false])it(`reads scoped retained history with candidate=${candidate}`,async()=>{
 const fetch=vi.fn(async(url:unknown)=>Response.json(String(url).includes('/history?')?{...key,revisions:[],legacyArchives:[summary],legacyArchivesNextCursor:null,legacyArchivesUnavailable:false}:envelope(candidate)));
 vi.stubGlobal('fetch',fetch);const record=await serverRebuildTransport.read(key.workspaceId,key.workId);
 expect(record.legacyArchives).toEqual([summary]);expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('reports unknown history before the new native candidate exists',async()=>{
 const fetch=vi.fn(async(url:unknown)=>String(url).includes('/history?')?Response.json({error:'Unavailable'},{status:503}):Response.json(envelope(false)));
 vi.stubGlobal('fetch',fetch);const record=await serverRebuildTransport.read(key.workspaceId,key.workId);expect(record.legacyArchivesUnavailable).toBe(true);
 });
});
