import { afterEach,beforeEach,expect,it,vi } from "vitest";
const rpc=vi.hoisted(()=>vi.fn());
const heartbeat=vi.hoisted(()=>vi.fn());
vi.mock("@/platform/infra/db/client",()=>({getSupabase:()=>({rpc})}));
vi.mock("@/platform/infra/heartbeat",()=>({recordHeartbeat:heartbeat}));
import { GET } from "@/app/api/cron/google-content-retention/route";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("CRON_SECRET","fictional-cron-secret");vi.stubEnv("STRELVA_WORKSPACE_RELEASE","0");rpc.mockResolvedValue({data:3,error:null});heartbeat.mockResolvedValue(undefined);});
afterEach(()=>{vi.unstubAllEnvs();});
it("purges behind real cron authorization even with workspace flags off",async()=>{
 const response=await GET(new Request("http://localhost/api/cron/google-content-retention",{headers:{authorization:"Bearer fictional-cron-secret"}}));
 expect(response.status).toBe(200);expect(await response.json()).toEqual({removed:3});expect(rpc).toHaveBeenCalledWith("purge_expired_google_receipt_payloads",{p_limit:10000});
});
it("denies unauthenticated purge without storage access",async()=>{
 expect((await GET(new Request("http://localhost/api/cron/google-content-retention"))).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
});
it("reports failure without exposing provider content or credential details",async()=>{
 rpc.mockResolvedValue({data:null,error:{message:"private provider snapshot secret"}});
 const response=await GET(new Request("http://localhost/api/cron/google-content-retention",{headers:{authorization:"Bearer fictional-cron-secret"}}));
 expect(response.status).toBe(503);expect(await response.text()).not.toContain("private provider");expect(heartbeat).toHaveBeenCalledWith("google-content-retention",{ok:false,failed:1});
});
