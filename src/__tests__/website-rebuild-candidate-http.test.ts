import { describe,it,expect,beforeEach,vi } from "vitest";
import { execFileSync } from "node:child_process";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { siteDocumentSchema,siteDocumentHash } from "@/products/websites/site-document";
import { websiteRebuildSchema } from "@/products/websites/rebuild-contracts";
const deps=vi.hoisted(()=>({read:vi.fn(),receipts:vi.fn(),assets:vi.fn(),work:vi.fn()}));
vi.mock("@/lib/db/server-client",()=>({getSessionUser:()=>({id:"11111111-1111-4111-8111-111111111111",email:"owner@example.test",email_confirmed_at:"2026-10-01"})}));
vi.mock("@/platform/workspace-release",()=>({workspaceReleaseEnabled:()=>true}));
vi.mock("@/platform/workspaces/repository",()=>({getWork:deps.work}));
vi.mock("@/products/websites/site-media",()=>({downloadWebsiteExportAssets:deps.assets}));
vi.mock("@/products/websites/server",async()=>({WebsiteCandidateMismatchError:(await import("@/products/websites/preview")).WebsiteCandidateMismatchError,readWebsite:vi.fn(),renderWebsiteCandidate:vi.fn(),exportWebsiteCandidate:vi.fn()}));
vi.mock("@/products/websites/index",async()=>({websiteRebuildReleaseEnabled:()=>true,readWebsiteRebuild:deps.read,websiteDocumentStore:{receipts:deps.receipts},safeSitePathSchema:(await import("@/products/websites/site-document-schema")).safeSitePathSchema,...await import("@/products/websites/rebuild-export")}));
import { websiteCandidateResponse } from "@/app/api/websites/candidate-http";
const workId="22222222-2222-4222-8222-222222222222",workspaceId="33333333-3333-4333-8333-333333333333";
const document=siteDocumentSchema.parse({version:2,siteName:"Example",theme:{palette:"light",typeScale:"standard"},pages:[{path:"/",title:"Example",description:"",root:"hero"},{path:"/about.html",title:"About",description:"",root:"hero"}],nodes:{hero:{id:"hero",type:"Hero",variant:"statement",props:{title:"Example"},children:[],factIds:[]}},facts:{},assets:{},redirects:[],provenance:{composer:"rules"}});
const hash=siteDocumentHash(document);
const receipts=[2,1].map(revision=>({status:"published" as const,provider:"strelva-hosted",providerUrl:"https://example.strelva.com/",receiptId:`publication-${revision}`,artifactHash:hash,candidateRevision:revision,publishedAt:"2026-10-01T12:00:00Z",evidence:"Committed publication"}));
const record={workId,workspaceId,rebuild:websiteRebuildSchema.parse({version:2,revision:5,title:"Example",input:{requestId:"request-1234",businessName:"Example",description:"Our business"},status:"published",candidate:{revision:2,contentHash:hash,document,previewHref:`/api/websites/${workId}/preview`},approvedCandidateRevision:2,tenantId:"example",launch:{receipt:receipts[0],readBack:null},createdBy:"owner",createdAt:"2026-10-01T12:00:00Z",stages:[],checkpoint:null,lastError:null,history:[]})};
const params=Promise.resolve({workId});
const request=(query="")=>new Request(`https://app.strelva.com/api/websites/${workId}/export?revision=2&contentHash=${hash}${query}`);
beforeEach(()=>{vi.resetAllMocks();deps.read.mockResolvedValue(record);deps.work.mockResolvedValue({productId:"websites",payload:{version:2}});deps.receipts.mockResolvedValue(receipts);deps.assets.mockResolvedValue([]);});
describe("real v2 preview/export HTTP adapter",()=>{
 it("exports all immutable receipts instead of reading nonexistent receipt fields from document history",async()=>{
  const response=await websiteCandidateResponse(request(),params,"export");expect(response.status).toBe(200);
  const bytes=Buffer.from(await response.arrayBuffer());
  const exported=execFileSync("tar",["-xOf","-","receipts.json"],{input:bytes,env:{...process.env,LC_ALL:"C"}}).toString();
  expect(JSON.parse(exported)).toEqual(receipts);expect(deps.receipts).toHaveBeenCalledWith({userId:"11111111-1111-4111-8111-111111111111",verifiedEmail:"owner@example.test"},{workspaceId,workId});
  expect(response.headers.get("X-Website-Content-Hash")).toBe(hash);
 });
 it("stops before media reads if private receipt access has been revoked",async()=>{
  deps.receipts.mockRejectedValue(new WorkspaceAccessError());expect((await websiteCandidateResponse(request(),params,"export")).status).toBe(403);expect(deps.assets).not.toHaveBeenCalled();
 });
 it("serves safe legacy .html page paths inside the exact-hash private preview",async()=>{
  const response=await websiteCandidateResponse(request("&page=%2Fabout.html"),params,"preview");expect(response.status).toBe(200);expect(await response.text()).toContain("<title>About</title>");expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'none'");expect(deps.receipts).not.toHaveBeenCalled();
 });
 it("rejects traversal and a stale candidate without fetching image bytes",async()=>{
  expect((await websiteCandidateResponse(request("&page=%2F..%2Fadmin"),params,"preview")).status).toBe(400);
  const stale=new Request(request().url.replace(hash,"f".repeat(64)));expect((await websiteCandidateResponse(stale,params,"export")).status).toBe(409);expect(deps.assets).not.toHaveBeenCalled();
 });
});
