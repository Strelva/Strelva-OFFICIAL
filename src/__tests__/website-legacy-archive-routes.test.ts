import { describe, expect, it, vi } from "vitest";
import { generateWebsiteArtifact } from "@/products/websites/generation";
import { captureLegacyWebsiteArchive, legacyArchiveExportFiles } from "@/products/websites/legacy-archive";
import { GET as readArchive } from "@/app/api/websites/[workId]/archives/[archiveId]/route";
import { GET as listArchives } from "@/app/api/websites/[workId]/archives/route";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
const state=vi.hoisted(()=>({actor:{userId:"33333333-3333-4333-8333-333333333333",verifiedEmail:"owner@example.com"} as {userId:string;verifiedEmail:string}|null,read:vi.fn(),list:vi.fn()}));
vi.mock("@/platform/workspaces/http",async()=>{
  const types=await import("@/platform/workspaces/types");
  return {workspaceHttpActor:async()=>state.actor,workspaceJson:(body:unknown,status=200)=>Response.json(body,{status}),workspaceHttpFailure:(error:unknown)=>Response.json({error:"refused"},{status:error instanceof types.WorkspaceAccessError?403:503})};
});
vi.mock("@/products/websites/index",async()=>{
  const archive=await import("@/products/websites/legacy-archive");const exports=await import("@/products/websites/rebuild-export");
  return {legacyArchiveStore:{read:state.read,list:state.list},legacyArchiveExportFiles:archive.legacyArchiveExportFiles,createWebsiteArchive:exports.createWebsiteArchive};
});
const key={workspaceId:"11111111-1111-4111-8111-111111111111",workId:"22222222-2222-4222-8222-222222222222"};
async function fixture(){
  const brief={businessName:"Juniper",description:"Bread",primaryCallToAction:"Contact us"};const bundle=await generateWebsiteArtifact({...key,revision:1,brief});
  return captureLegacyWebsiteArchive({id:key.workId,workspaceId:key.workspaceId,productId:"websites",resourceKind:"website",createdBy:"33333333-3333-4333-8333-333333333333",createdAt:bundle.generatedAt,updatedAt:bundle.generatedAt,payload:{version:1,revision:1,title:"Juniper",brief,candidate:bundle.candidate,status:"preview_ready",approvedCandidateRevision:null,launch:{status:"not_requested",candidateRevision:null,receipt:null,failure:null},lastError:null,createdBy:"33333333-3333-4333-8333-333333333333",createdAt:bundle.generatedAt,history:[]}},key);
}
describe("authenticated legacy archive read/export routes",()=>{
  it("requires current login before listing or downloading any archived source",async()=>{
    state.actor=null;state.read.mockClear();state.list.mockClear();
    const params={params:Promise.resolve({...key,archiveId:"a".repeat(64)})};
    expect((await readArchive(new Request(`https://local.test/archive?workspaceId=${key.workspaceId}&download=1`),params)).status).toBe(401);
    expect((await listArchives(new Request(`https://local.test/archive?workspaceId=${key.workspaceId}`),params)).status).toBe(401);
    expect(state.read).not.toHaveBeenCalled();expect(state.list).not.toHaveBeenCalled();
    state.actor={userId:"33333333-3333-4333-8333-333333333333",verifiedEmail:"owner@example.com"};
  });
  it("exports exact retained source evidence with private headers",async()=>{
    const archive=await fixture();state.read.mockResolvedValueOnce(archive);
    const response=await readArchive(new Request(`https://local.test/archive?workspaceId=${key.workspaceId}&download=1`),{params:Promise.resolve({workId:key.workId,archiveId:archive.archiveId})});
    expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain(archive.archiveId);
    const bytes=Buffer.from(await response.arrayBuffer());expect(bytes.toString()).toContain("original-saved-work.json");expect(bytes.toString()).toContain(archive.sourceDigest);
    expect(legacyArchiveExportFiles(archive).find(file=>file.path==="original-saved-work.json")!.bytes.toString()).toBe(archive.sourceJson);
    expect(state.read).toHaveBeenLastCalledWith(state.actor,key,archive.archiveId);
  });
  it("passes scope refusals through and never returns archive contents",async()=>{
    state.read.mockRejectedValueOnce(new WorkspaceAccessError());
    const response=await readArchive(new Request(`https://local.test/archive?workspaceId=${key.workspaceId}`),{params:Promise.resolve({workId:key.workId,archiveId:"a".repeat(64)})});
    expect(response.status).toBe(403);expect(await response.json()).not.toHaveProperty("archive");
  });
});
