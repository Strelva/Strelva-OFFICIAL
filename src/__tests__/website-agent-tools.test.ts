import {describe,it,expect,vi,beforeEach} from "vitest";
const deps=vi.hoisted(()=>({published:vi.fn(),read:vi.fn(),patch:vi.fn(),release:vi.fn()}));
vi.mock("@/products/websites/document-store",()=>({websiteDocumentStore:{published:deps.published}}));
vi.mock("@/products/websites/rebuild-service",()=>({readWebsiteRebuild:deps.read,patchWebsiteRebuild:deps.patch}));
vi.mock("@/products/websites/rebuild-release",()=>({websiteRebuildReleaseEnabled:deps.release,websiteRebuildReleaseMayBeOn:(...args:unknown[])=>deps.release(...args),websiteRebuildReleaseEnabledForWorkspace:async(...args:unknown[])=>deps.release(...args),websiteRebuildReleaseEnabledForTenant:async(...args:unknown[])=>deps.release(...args),websiteRebuildReleasedFor:async(...args:unknown[])=>deps.release(...args)}));
vi.mock("@/lib/ai-auto-approve",()=>({maybeAutoApprove:vi.fn()}));
import {buildSiteDocumentTools} from "@/lib/agent-shared";
import {siteDocumentSchema} from "@/products/websites/site-document";
const document=siteDocumentSchema.parse({version:2,siteName:"The Mooney Firm",theme:{palette:"light",typeScale:"standard"},pages:[{path:"/",title:"Firm",description:"",root:"hero"}],nodes:{hero:{id:"hero",type:"Hero",variant:"statement",props:{title:"Firm"},children:[],factIds:[]}},facts:{},assets:{},redirects:[],provenance:{composer:"rules"}});
const actor={userId:"user",verifiedEmail:"owner@example.com"};const opts={toolCallId:"call",messages:[]};
beforeEach(()=>{vi.resetAllMocks();deps.release.mockReturnValue(true);deps.published.mockResolvedValue({workspaceId:"workspace",workId:"website"});deps.read.mockResolvedValue({workId:"website",workspaceId:"workspace",rebuild:{tenantId:"tenant",revision:4,candidate:{revision:2,contentHash:"a".repeat(64),document}}});});
describe("v2 site agent tools",()=>{
 it("requires verified actor and release before resolving site data",async()=>{const tools=buildSiteDocumentTools({tenantId:"tenant",actor:null});expect(await tools.read_site.execute!({},opts)).toHaveProperty("error");expect(deps.published).not.toHaveBeenCalled();deps.release.mockReturnValue(false);const enabled=buildSiteDocumentTools({tenantId:"tenant",actor});expect(await enabled.read_site.execute!({},opts)).toHaveProperty("error");expect(deps.published).not.toHaveBeenCalled();});
 it("returns stable IDs and exact document selection from authorized saved work",async()=>{const tools=buildSiteDocumentTools({tenantId:"tenant",actor});expect(await tools.read_site.execute!({path:"/"},opts)).toMatchObject({workId:"website",expectedRevision:4,candidateRevision:2,allPages:[{path:"/",root:"hero"}],patchRoots:["/nodes","/pages"],nodes:{hero:{id:"hero"}}});expect(deps.read).toHaveBeenCalledWith(actor,"website");});
 it("rejects tenant/workspace mismatches and does not edit",async()=>{deps.read.mockResolvedValue({workId:"website",workspaceId:"other",rebuild:{tenantId:"tenant"}});const tools=buildSiteDocumentTools({tenantId:"tenant",actor});const result=await tools.patch_site.execute!({expectedRevision:4,candidateRevision:2,candidateContentHash:"a".repeat(64),ops:[{op:"replace",path:"/nodes/hero/props/title",value:"New"}]},opts);expect(result).toMatchObject({success:false});expect(deps.patch).not.toHaveBeenCalled();});
 it("accepts a typed page plan and still forces exact candidate owner review",async()=>{
  const tools=buildSiteDocumentTools({tenantId:"tenant",actor});
  const patch={expectedRevision:4,candidateRevision:2,candidateContentHash:"a".repeat(64),ops:[{op:"add" as const,path:"/nodes/estate",value:{id:"estate",type:"Hero",variant:"statement",props:{title:"Estate planning"},children:[],factIds:[]}},{op:"add" as const,path:"/pages/-",value:{path:"/estate-planning",title:"Estate planning",description:"",root:"estate"}}]};
  expect(await tools.patch_site.execute!(patch,opts)).toMatchObject({success:true,agentResultStatus:"queued"});
  expect(deps.patch).toHaveBeenCalledWith(actor,"website",{...patch,forceReview:true});
 });
 it("uses canonical governance service and forces review for agent drafts",async()=>{const onResult=vi.fn();const tools=buildSiteDocumentTools({tenantId:"tenant",actor,onResult});const patch={expectedRevision:4,candidateRevision:2,candidateContentHash:"a".repeat(64),ops:[{op:"replace" as const,path:"/nodes/hero/props/title",value:"New"}]};expect(await tools.patch_site.execute!(patch,opts)).toMatchObject({success:true,agentResultStatus:"queued"});expect(deps.patch).toHaveBeenCalledWith(actor,"website",{...patch,forceReview:true});expect(onResult).toHaveBeenCalledWith("queued",expect.any(String));});
});
