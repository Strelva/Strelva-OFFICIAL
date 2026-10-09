import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { setClientRecordDb, type ClientRecordDb } from "@/platform/client-records/mirror";
import { readThroughFlag } from "@/platform/client-records/move";
import { saveConnection, saveConnectionMutation, getConnection, deleteConnection } from "@/lib/connections";
import { recordOrder, getOrders, getOrderSummary } from "@/lib/orders";
const rows = new Map<string,{ recordId:string; payload:Record<string,unknown>; capturedAt:string }>();
let fail: string | null = null;
const tombstones = new Map<string,string>();
const db: ClientRecordDb = { rpc(name,args) {
 if (name === fail) return Promise.resolve({ data:null,error:{message:"offline"} });
 if (name === "client_record_parity_streak") return Promise.resolve({data:{days:7},error:null});
 if (name === "mutate_tenant_provider_connection") {
  const key=`provider_connections|${args.p_provider}`;
  if(JSON.stringify(rows.get(key)?.payload)!==JSON.stringify(args.p_expected_payload))return Promise.resolve({data:{status:"kept"},error:null});
  rows.set(key,{recordId:String(args.p_provider),payload:args.p_payload as Record<string,unknown>,capturedAt:String(args.p_captured_at)});
  return Promise.resolve({data:{status:"updated"},error:null});
 }
 const key = `${args.p_store}|${args.p_record_id}`;
 if (name === "record_tenant_client_record") {
  if (args.p_mode === "remove") { tombstones.set(key,String(args.p_captured_at)); rows.delete(key); return Promise.resolve({data:{status:"removed"},error:null}); }
  if (String(args.p_captured_at) <= (tombstones.get(key) ?? "") || String(args.p_captured_at) < (rows.get(key)?.capturedAt ?? "")) return Promise.resolve({data:{status:"kept"},error:null});
  if (rows.has(key) && args.p_mode === "keep_first") return Promise.resolve({data:{status:"kept"},error:null});
  rows.set(key,{recordId:String(args.p_record_id),payload:args.p_payload as Record<string,unknown>,capturedAt:String(args.p_captured_at)});
  return Promise.resolve({data:{status:"recorded"},error:null});
 }
 if (name === "read_tenant_client_records_page") return Promise.resolve({data:[...rows].filter(([key])=>key.startsWith(`${args.p_store}|`)).map(([,row])=>row),error:null});
 return Promise.resolve({data:null,error:{message:name}});
} };
beforeEach(()=>{
 rows.clear(); tombstones.clear(); fail=null; setClientRecordDb(db);
 vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE","1"); vi.stubEnv("DUAL_WRITE_PG","1");
 vi.stubEnv("STRELVA_CLIENT_RECORDS_READ","orders,provider_connections");
 vi.stubEnv("SECRETS_ENC_KEY",Buffer.alloc(32,7).toString("hex"));
});
afterEach(()=>{setClientRecordDb(undefined);vi.unstubAllEnvs();});
describe("qualified durable client-record authority",()=>{
 it("saves, reads and revokes encrypted connections with Redis absent",async()=>{
  await saveConnection({tenantId:"acme",provider:"google",accessToken:"token",status:"connected"});
  expect(rows.get("provider_connections|google")?.payload.accessToken).toMatch(/^enc:v1:/);
  expect((await getConnection("acme","google"))?.accessToken).toBe("token");
  await deleteConnection("acme","google");
  expect(await getConnection("acme","google")).toBeNull();
 });
 it("rejects retained mutations after revoke and permits a distinct reconnect",async()=>{
  vi.useFakeTimers();
  try {
   vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
   await saveConnection({tenantId:"acme",provider:"google",accessToken:"old",refreshToken:"old-refresh",status:"connected"});
   const startedAt=new Date().toISOString();
   const retained=(await getConnection("acme","google"))!;
   vi.advanceTimersByTime(1000);
   await deleteConnection("acme","google");
   vi.advanceTimersByTime(1000);
   await expect(saveConnectionMutation(retained,{accessToken:"stale-refreshed"},startedAt)).rejects.toThrow(/superseded|revoked/);
   await expect(saveConnectionMutation(retained,{status:"needs_reauth"},startedAt)).rejects.toThrow(/superseded|revoked/);
   expect(await getConnection("acme","google")).toBeNull();
   await saveConnection({tenantId:"acme",provider:"google",accessToken:"new",refreshToken:"new-refresh",status:"connected"});
   await expect(saveConnectionMutation(retained,{accessToken:"stale-refreshed"},startedAt)).rejects.toThrow(/superseded|revoked/);
   expect((await getConnection("acme","google"))?.accessToken).toBe("new");
  } finally { vi.useRealTimers(); }
 });
 it("rejects stale refresh sharing the reconnect timestamp after a clock-skewed revoke",async()=>{
  vi.useFakeTimers();
  try {
   vi.setSystemTime(new Date("2026-10-07T23:59:59.999Z"));
   await saveConnection({tenantId:"acme",provider:"google",accessToken:"old",status:"connected"});
   vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
   const retained=(await getConnection("acme","google"))!;
   vi.setSystemTime(new Date("2026-10-07T23:59:59.999Z"));
   await deleteConnection("acme","google");
   vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
   await saveConnection({tenantId:"acme",provider:"google",accessToken:"new",status:"connected"});
   for(const captured of ["2026-10-08T00:00:00Z","2036-10-08T00:00:00Z"])
    await expect(saveConnectionMutation(retained,{accessToken:"stale"},captured)).rejects.toThrow(/superseded|revoked/);
   expect((await getConnection("acme","google"))?.accessToken).toBe("new");
  } finally {vi.useRealTimers();}
 });
 it("captures concurrent/restarted order beacons once without Redis",async()=>{
  const input={externalId:"provider-order",amountCents:2500,currency:"USD",items:[],verification:"site-signature" as const};
  const results=await Promise.all([recordOrder("acme",input),recordOrder("acme",input)]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await recordOrder("acme",input)).toBeNull();
  expect(await getOrders("acme")).toHaveLength(1);
  expect(await getOrderSummary("acme")).toMatchObject({orderCount:1,revenueCents:2500});
 });
 it("does not acknowledge failed authoritative writes and permits clean retries",async()=>{
  const input={externalId:"retry",amountCents:2500,currency:"USD",items:[],verification:"site-signature" as const};
  fail="record_tenant_client_record";
  await expect(recordOrder("acme",input)).rejects.toThrow(/write_failed/);
  expect(rows.size).toBe(0);
  fail=null;
  expect(await recordOrder("acme",input)).not.toBeNull();
 });
 it.each(["client_record_parity_streak","read_tenant_client_records_page"])("makes %s outage explicit instead of serving incomplete Redis",async name=>{
  fail=name;
  const redis=vi.fn(async()=>["capped legacy"]);
  await expect(readThroughFlag("orders","acme",redis,rows=>rows.map(row=>row.recordId))).rejects.toThrow();
  expect(redis).not.toHaveBeenCalled();
 });
});
