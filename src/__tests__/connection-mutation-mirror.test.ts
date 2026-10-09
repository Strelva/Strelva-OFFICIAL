import { beforeEach, expect, it, vi } from "vitest";
import type { Connection } from "@/lib/types";
const state=vi.hoisted(()=>({value:null as Connection|null,mirror:vi.fn(),eval:vi.fn()}));
vi.mock("@/platform/infra/redis",()=>({getRedis:()=>({get:async()=>state.value,eval:state.eval})}));
vi.mock("@/lib/client-records",()=>({
 durableRecordAuthority:async()=>false,
 readRecord:async(_store:unknown,_tenant:unknown,_provider:unknown,read:()=>Promise<unknown>)=>read(),
 mirrorRecord:state.mirror,removeRecord:vi.fn(),readRecords:vi.fn(),writeDurableRecord:vi.fn(),removeDurableRecord:vi.fn(),
}));
import { getConnection,saveConnectionMutation } from "@/lib/connections";
beforeEach(()=>{
 vi.clearAllMocks();state.value={provider:"google",tenantId:"fixture",status:"connected",accessToken:"old",refreshToken:"old-refresh"};
 state.eval.mockImplementation(async(_script:unknown,_keys:unknown,args:string[])=>{
  if(JSON.stringify(state.value)!==args[0])return 0;
  state.value=JSON.parse(args[1]);return 1;
 });state.mirror.mockResolvedValue(undefined);
});
it("mirrors a successful CAS with the original capture time and rotated credentials",async()=>{
 const retained=(await getConnection("fixture","google"))!;
 const captured="2026-10-08T00:00:00.000Z";
 await saveConnectionMutation(retained,{accessToken:"fresh",refreshToken:"rotated"},captured);
 expect(state.mirror).toHaveBeenCalledWith("provider_connections","fixture","google",expect.objectContaining({accessToken:"fresh",refreshToken:"rotated"}),captured);
 expect((await getConnection("fixture","google"))?.refreshToken).toBe("rotated");
});
it("never mirrors a CAS rejected by a disconnect or distinct reconnect",async()=>{
 const retained=(await getConnection("fixture","google"))!;
 state.value=null;
 await expect(saveConnectionMutation(retained,{status:"needs_reauth"},"2026-10-08T00:00:00Z")).rejects.toThrow(/revoked/);
 state.value={...retained,accessToken:"reconnected"};
 await expect(saveConnectionMutation(retained,{accessToken:"stale"},"2026-10-08T00:00:00Z")).rejects.toThrow(/revoked/);
 expect(state.mirror).not.toHaveBeenCalled();expect(state.value.accessToken).toBe("reconnected");
});
it("does not return usable refreshed authority if disconnect lands during mirroring",async()=>{
 const retained=(await getConnection("fixture","google"))!;
 state.mirror.mockImplementation(async()=>{state.value=null;});
 await expect(saveConnectionMutation(retained,{accessToken:"fresh"},"2026-10-08T00:00:00Z")).rejects.toThrow(/revoked/);
 expect(state.value).toBeNull();
});
