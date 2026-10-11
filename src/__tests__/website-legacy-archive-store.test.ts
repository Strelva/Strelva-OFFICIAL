import { describe, expect, it, vi } from "vitest";
import { createLegacyArchiveStore } from "@/products/websites/legacy-archive-store";
import { captureLegacyWebsiteArchive } from "@/products/websites/legacy-archive";
import { generateWebsiteArtifact } from "@/products/websites/generation";
import { archivedHistoryView } from "@/experience/websites/rebuild-transport";
import { V3_CATEGORIES } from "@/platform/workspace-exports/v3";
const key = { workspaceId:"11111111-1111-4111-8111-111111111111",workId:"22222222-2222-4222-8222-222222222222" };
const actor = { userId:"33333333-3333-4333-8333-333333333333",verifiedEmail:"owner@example.com" };
async function fixture() {
  const brief={businessName:"Juniper",description:"Fresh bread",primaryCallToAction:"Contact us"};
  const bundle=await generateWebsiteArtifact({...key,revision:1,brief});
  const work={id:key.workId,workspaceId:key.workspaceId,productId:"websites",resourceKind:"website",title:undefined,input:undefined,sourceWorkId:undefined,createdBy:actor.userId,createdAt:bundle.generatedAt,updatedAt:bundle.generatedAt,payload:{version:1,revision:1,title:"Juniper",brief,candidate:bundle.candidate,status:"preview_ready",approvedCandidateRevision:null,launch:{status:"not_requested",candidateRevision:null,receipt:null,failure:null},lastError:null,createdBy:actor.userId,createdAt:bundle.generatedAt,history:[]}};
  const archive=captureLegacyWebsiteArchive(work,key);
  const summary={archiveId:archive.archiveId,workspaceId:key.workspaceId,sourceWorkId:key.workId,sourceVersion:1,sourceRevision:1,sourceDigest:archive.sourceDigest,evidenceDigest:archive.evidenceDigest,retainedCandidates:1,unresolvedCandidates:0};
  return {work,archive,summary};
}
describe("concrete legacy archive RPC adapter and history/export wiring",()=>{
  it("dryruns/commits through current identity RPCs and verifies exact returned capture",async()=>{
    const {archive}=await fixture();
    const rpc=vi.fn(async(name:string)=>({data:name==="read_website_legacy_archive_source"?{source:JSON.parse(archive.sourceJson)}:name==="capture_website_legacy_archive"?{archive}:null,error:null}));
    const store=createLegacyArchiveStore({rpc});
    const plan=await store.dryRun(actor,key);expect(plan).toEqual(archive);
    expect(rpc.mock.calls.map(call=>call[0])).toEqual(["authorize_website_legacy_archive","read_website_legacy_archive_source"]);
    expect(await store.commit(actor,plan)).toEqual(archive);
    expect(rpc).toHaveBeenLastCalledWith("capture_website_legacy_archive",expect.objectContaining({p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_work_id:key.workId,p_workspace_id:key.workspaceId,p_archive:archive}));
  });
  it("validates scoped list/read responses and carries pagination",async()=>{
    const {archive,summary}=await fixture();
    const rpc=vi.fn(async(name:string)=>({data:name==="list_website_legacy_archives"?{viewerWorkId:key.workId,workspaceId:key.workspaceId,archives:[summary],nextCursor:archive.archiveId}:{viewerWorkId:key.workId,workspaceId:key.workspaceId,archive},error:null}));
    const store=createLegacyArchiveStore({rpc});
    expect(await store.list(actor,key)).toEqual({archives:[summary],nextCursor:archive.archiveId});
    expect(await store.read(actor,key,archive.archiveId)).toEqual(archive);
    expect(rpc).toHaveBeenCalledWith("list_website_legacy_archives",expect.objectContaining({p_limit:50,p_after_archive_id:null}));
    rpc.mockResolvedValueOnce({data:{viewerWorkId:"44444444-4444-4444-8444-444444444444",workspaceId:key.workspaceId,archive},error:null});
    await expect(store.read(actor,key,archive.archiveId)).rejects.toThrow();
  });
  it("refuses unavailable/denied RPCs and malformed source instead of inventing empty captures",async()=>{
    const unavailable=createLegacyArchiveStore({rpc:async()=>({data:null,error:{message:"function missing"}})});
    await expect(unavailable.list(actor,key)).rejects.toThrow("could not be confirmed");
    const denied=createLegacyArchiveStore({rpc:async()=>({data:null,error:{message:"workspace_access_denied"}})});
    await expect(denied.dryRun(actor,key)).rejects.toThrow();
    const {archive}=await fixture();const wrong={...JSON.parse(archive.sourceJson),workspaceId:"44444444-4444-4444-8444-444444444444"};
    const malformed=createLegacyArchiveStore({rpc:async(name)=>({data:name==="read_website_legacy_archive_source"?{source:wrong}:null,error:null})});
    await expect(malformed.dryRun(actor,key)).rejects.toThrow();
  });
  it("keeps unknown/mismatched archive history unavailable and adds archive portability without removing originals",async()=>{
    const {summary,archive}=await fixture();
    const history={...key,legacyArchives:[summary],legacyArchivesNextCursor:archive.archiveId,legacyArchivesUnavailable:false};
    expect(archivedHistoryView(history,key).legacyArchives).toEqual([summary]);
    expect(archivedHistoryView({...history,workId:"other"},key).legacyArchivesUnavailable).toBe(true);
    expect(archivedHistoryView(null,key).legacyArchivesUnavailable).toBe(true);
    expect(V3_CATEGORIES).toContain("website_legacy_archives");
    expect(V3_CATEGORIES).toContain("saved_system_work");expect(V3_CATEGORIES).toContain("website_documents");
  });
});
