import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import {authenticatedCronRequest} from "@/__tests__/support/cron";
const deps=vi.hoisted(()=>({release:vi.fn(),list:vi.fn(),save:vi.fn(),fetch:vi.fn(),send:vi.fn(),heartbeat:vi.fn(),prune:vi.fn(),tenants:vi.fn(),domainSnapshot:vi.fn(),probe:vi.fn(),scans:vi.fn(),heartbeats:vi.fn(),saveCoverage:vi.fn()}));
vi.mock("@/products/websites/rebuild-release",()=>({websiteRebuildReleaseEnabled:deps.release,websiteRebuildReleaseMayBeOn:(...args:unknown[])=>deps.release(...args),websiteRebuildReleaseEnabledForWorkspace:async(...args:unknown[])=>deps.release(...args),websiteRebuildReleaseEnabledForTenant:async(...args:unknown[])=>deps.release(...args),websiteRebuildReleasedFor:async(...args:unknown[])=>deps.release(...args)}));
vi.mock("@/products/websites/document-store",()=>({websiteDocumentStore:{listPublished:deps.list,recordHealth:deps.save,pruneCrawls:deps.prune}}));
vi.mock("@/lib/pinned-public-text",()=>({fetchPinnedPublicText:deps.fetch}));
vi.mock("@/lib/email/send",()=>({sendEmailWithReceipt:deps.send}));
vi.mock("@/lib/delivery-email",()=>({resolveLeadNotifyRecipients:()=>["operator@example.com"]}));
vi.mock("@/lib/heartbeat",async(original)=>({...(await original<typeof import("@/lib/heartbeat")>()),recordHeartbeat:deps.heartbeat,checkHeartbeats:deps.heartbeats}));
vi.mock("@/lib/tenants",()=>({getActiveTenants:deps.tenants}));
vi.mock("@/lib/domain-monitor-store",()=>({getDomainHealth:deps.domainSnapshot}));
vi.mock("@/lib/domain-monitor",()=>({checkTenantDomains:deps.probe}));
vi.mock("@/lib/scan-store",()=>({getScanSummaries:deps.scans}));
vi.mock("@/platform/operator-queue/site-health-store",()=>({saveSiteHealth:deps.saveCoverage}));
import {GET} from "@/app/api/cron/website-health/route";
import type {SiteHealthSnapshot} from "@/platform/operator-queue/site-coverage";

// The nine live custom-repo clients from release-manifest.json, as fictional tenant rows.
const CUSTOM_REPOS=["gldf","mclears","rohlax","twintrees","twintrees-market","mooney","leslie","rhm","wellness"];
function domainHealth(tenantId:string,state:"up"|"down"="up"){const checkedAt=new Date().toISOString();return{tenantId,siteName:tenantId,ownerName:"Owner",primaryHost:`${tenantId}.example.test`,checks:[{host:`${tenantId}.example.test`,kind:"custom" as const,url:`https://${tenantId}.example.test`,httpStatus:state==="up"?200:503,bytes:5000,state,expiresAt:null,daysToExpiry:200,checkedAt,latencyMs:80}],worst:state,nearestExpiryDays:200};}
beforeEach(()=>{vi.resetAllMocks();deps.release.mockReturnValue(true);deps.prune.mockResolvedValue(0);deps.list.mockResolvedValue([{workspaceId:"workspace",workId:"website",tenantId:"mooney",revision:1,contentHash:"a".repeat(64)}]);deps.save.mockResolvedValue(undefined);deps.send.mockResolvedValue({status:"suppressed",reason:"disabled"});
 deps.tenants.mockResolvedValue(CUSTOM_REPOS.map(id=>({id,stableId:`00000000-0000-4000-8000-${String(CUSTOM_REPOS.indexOf(id)).padStart(12,"0")}`,siteName:id,deliveryModel:"custom_repo",customRepo:{revalidationHealth:id==="gldf"?"failing":"healthy"}})));
 deps.domainSnapshot.mockResolvedValue({scannedAt:new Date().toISOString(),results:CUSTOM_REPOS.filter(id=>id!=="leslie").map(id=>domainHealth(id,id==="rohlax"?"down":"up"))});
 deps.probe.mockImplementation(async(tenant:{id:string})=>domainHealth(tenant.id));
 deps.scans.mockImplementation(async(ids:string[])=>Object.fromEntries(ids.map(id=>[id,{scannedAt:new Date().toISOString(),grade:"B",overallScore:82}])));
 deps.heartbeats.mockResolvedValue([{cron:"domain-monitor",lastSeen:new Date().toISOString(),ageSeconds:10,maxAgeSeconds:4200,stale:false,lastOk:true},{cron:"portfolio-scan",lastSeen:new Date().toISOString(),ageSeconds:10,maxAgeSeconds:93600,stale:false,lastOk:true}]);
 deps.saveCoverage.mockResolvedValue(undefined);});
afterEach(()=>vi.unstubAllEnvs());
function savedCoverage():SiteHealthSnapshot{return deps.saveCoverage.mock.calls.at(-1)![0];}
describe("website health cron",()=>{
 it("authenticates before scanning, and with the rebuild release off still covers every custom-repo site",async()=>{vi.stubEnv("CRON_SECRET","test-cron-secret");expect((await GET(new Request("https://app.strelva.com/api/cron/website-health"))).status).toBe(401);expect(deps.list).not.toHaveBeenCalled();expect(deps.tenants).not.toHaveBeenCalled();
  deps.release.mockReturnValue(false);const response=await GET(authenticatedCronRequest());const body=await response.json();
  expect(body).toMatchObject({hosted:{skipped:true},coverage:{sites:9,customRepos:9,probed:1}});expect(body.skipped).toBeUndefined();
  expect(deps.list).not.toHaveBeenCalled();expect(deps.prune).not.toHaveBeenCalled();expect(deps.send).not.toHaveBeenCalled();
  const results=savedCoverage().results;expect(results.map(result=>result.tenantId).sort()).toEqual([...CUSTOM_REPOS].sort());
  for(const result of results)expect(["healthy","degraded","blocked","unknown"]).toContain(result.status);
  expect(results.find(result=>result.tenantId==="rohlax")!.status).toBe("blocked");
  expect(results.find(result=>result.tenantId==="gldf")!.status).toBe("degraded");
  expect(results.find(result=>result.tenantId==="mclears")!.status).toBe("healthy");
  expect(results.find(result=>result.tenantId==="leslie")!.domainEvidence).toBe("probe");
  expect(deps.probe).toHaveBeenCalledTimes(1);
  expect(deps.heartbeat).toHaveBeenCalledWith("website-health",expect.objectContaining({ok:true,processed:9}));});
 it("never shows a site with no evidence as healthy",async()=>{deps.release.mockReturnValue(false);deps.domainSnapshot.mockResolvedValue(null);deps.probe.mockRejectedValue(Error("network down"));deps.scans.mockImplementation(async(ids:string[])=>Object.fromEntries(ids.map(id=>[id,null])));deps.heartbeats.mockResolvedValue([]);
  const response=await GET(authenticatedCronRequest());expect(response.status).toBe(207);const results=savedCoverage().results;expect(results).toHaveLength(9);expect(results.some(result=>result.status==="healthy")).toBe(false);expect(results.filter(result=>result.tenantId!=="gldf").every(result=>result.status==="unknown")).toBe(true);
  expect(await response.json()).toMatchObject({coverage:{probeFailed:9}});expect(deps.heartbeat).toHaveBeenLastCalledWith("website-health",expect.objectContaining({ok:false}));});
 it("treats a domain result with no host checked as no evidence",async()=>{deps.release.mockReturnValue(false);deps.domainSnapshot.mockResolvedValue({scannedAt:new Date().toISOString(),results:[{...domainHealth("mclears"),checks:[],worst:"up"}]});deps.probe.mockImplementation(async(tenant:{id:string})=>({...domainHealth(tenant.id),checks:[],worst:"up"}));
  const response=await GET(authenticatedCronRequest());expect(response.status).toBe(200);expect(savedCoverage().results.find(result=>result.tenantId==="mclears")!.status).toBe("unknown");expect(await response.json()).toMatchObject({coverage:{noHosts:9}});});
 it("reports a coverage storage failure instead of hiding it",async()=>{deps.release.mockReturnValue(false);deps.saveCoverage.mockRejectedValue(Error("redis down"));const response=await GET(authenticatedCronRequest());expect(response.status).toBe(207);expect(await response.json()).toMatchObject({coverage:{saved:false}});});
 it("prunes expired crawl pages independently of published document health",async()=>{deps.prune.mockResolvedValue(3);deps.fetch.mockResolvedValue(`<meta name="strelva-site-hash" content="${"a".repeat(64)}">`);const response=await GET(authenticatedCronRequest());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({crawlRetention:{status:"pruned",removed:3},hosted:{processed:1,failed:0},failed:0});expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({status:"healthy"}));deps.prune.mockRejectedValue(Error("retention unavailable"));const failed=await GET(authenticatedCronRequest());expect(failed.status).toBe(207);expect(await failed.json()).toMatchObject({crawlRetention:{status:"failed"},hosted:{processed:1},failed:1});expect(deps.save).toHaveBeenCalledTimes(2);expect(deps.heartbeat).toHaveBeenLastCalledWith("website-health",expect.objectContaining({ok:false,failed:1}));});
 it("records missing hash, feeds it into the site's health, and alerts only through shared operator transport",async()=>{deps.fetch.mockResolvedValue("<html>unexpected</html>");expect((await GET(authenticatedCronRequest())).status).toBe(207);expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({status:"hash_missing",contentHash:"a".repeat(64)}));expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({audience:"operator",fromAddress:"health@updates.strelva.com"}));expect(savedCoverage().results.find(result=>result.tenantId==="mooney")!.reasons.some(reason=>reason.signal==="site.published_revision")).toBe(true);expect(deps.heartbeat).toHaveBeenCalledWith("website-health",expect.objectContaining({ok:false,failed:1}));});
 it("records healthy checks without notifying and does not conceal receipt storage failures",async()=>{deps.fetch.mockResolvedValue(`<meta name="strelva-site-hash" content="${"a".repeat(64)}">`);expect((await GET(authenticatedCronRequest())).status).toBe(200);expect(deps.send).not.toHaveBeenCalled();deps.save.mockRejectedValue(Error("durable storage down"));expect((await GET(authenticatedCronRequest())).status).toBe(503);expect(deps.heartbeat).toHaveBeenLastCalledWith("website-health",expect.objectContaining({ok:false,failed:1}));});
});
