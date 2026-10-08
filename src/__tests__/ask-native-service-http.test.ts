/** Invoked inside the socket-only SQL runner while its accepted setup exists. */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { taskPostgres } from "./support/ask-task-postgres";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { command,pgBinary,pgEnv } from "../../scripts/release-safety/postgres";
const boundary=vi.hoisted(()=>({db:null as ReturnType<typeof taskPostgres>|null,emailAllowed:true,emails:[] as string[],captures:0,legacyNative:true,legacyCalls:0}));
vi.mock("@/platform/infra/db/client",()=>({getSupabase:()=>boundary.db}));
vi.mock("@/lib/tenants",()=>({getTenantConfig:async()=>({active:true,stableId:"45600000-0000-4000-8000-000000000020",siteName:"Ask fixture"})}));
vi.mock("@/platform/infra/rate-limit",()=>({isRateLimitedAsync:async()=>false,rateLimitKey:()=>"isolated-fixture"}));
vi.mock("@/platform/bookings/public-read",()=>({limitPublicBookingRead:async()=>{},cachedPublicCalendarRead:async(_key:unknown,read:()=>Promise<unknown>)=>read()}));
vi.mock("@/platform/bookings/updates",async(importOriginal)=>({...await importOriginal<typeof import("@/platform/bookings/updates")>(),bookingCustomerEmailAllowed:async()=>boundary.emailAllowed,notifyBookingRequestNow:async()=>{},deliverBookingUpdates:async()=>{}}));
vi.mock("@/platform/infra/email/send",async(importOriginal)=>({...await importOriginal<typeof import("@/platform/infra/email/send")>(),sendEmailWithReceipt:async(input:{options:{button:{url:string}}})=>{boundary.emails.push(input.options.button.url);return {status:"accepted"};}}));
vi.mock("@/lib/leads",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/leads")>(),captureLead:async(_tenant:string,input:Record<string,unknown>)=>{boundary.captures++;return {status:"captured",lead:{...input,id:`fixture-inquiry-${boundary.captures}`,createdAt:new Date().toISOString()}};}}));
vi.mock("@/lib/tenant",()=>({getTenantFromHeaders:async()=>"ask456-fixture"}));
vi.mock("@/lib/storage",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/storage")>(),getContent:async()=>{
  const content={sectionLabel:"Services",headline:"Services",description:"",services:[{id:"45600000-0000-4000-8000-000000000077",name:"Ordinary Redis service",description:"",duration:"30",price:"",featured:false,who_its_for:"",booking_link:"",comingSoon:false,image_url:""}]};
  if(!boundary.legacyNative)return content;
  const services=boundary.db!.execute("select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',null,'priceText',null)) from business_services");
  return contentWithBusinessRecord("services",content,{revision:1,facts:{},services});
}}));
vi.mock("@/platform/bookings/legacy-store",async(importOriginal)=>({...await importOriginal<typeof import("@/platform/bookings/legacy-store")>(),getAvailableSlots:async()=>{boundary.legacyCalls++;return ["10:00"];},createBookingAtomic:async()=>{boundary.legacyCalls++;return {success:false,error:"Slot already taken"};}}));
import { contentWithBusinessRecord } from "@/lib/business-record-reader";
import { GET, POST, DELETE } from "@/app/api/v1/ask-service-bookings/[...path]/route";
import { GET as ordinaryGET } from "@/app/api/v1/bookings/[tenant]/route";
import { nativeSlots } from "@/platform/bookings/native";
import { createPublicWebsiteBookingService } from "@/products/scheduling/public-booking-server";
import { assertAskServiceTenantSource, guardAskServiceConfirmation } from "@/products/scheduling/ask-service-public-server";
import { setBookingStatus } from "@/platform/bookings/store";
import { resetBookingFlagCache } from "@/platform/bookings/flags";
import { GET as legacyAvailability } from "@/app/api/booking/availability/route";
import { POST as legacyReserve } from "@/app/api/booking/route";
import { POST as confirmationAction } from "@/app/booking-confirm/[token]/action/route";
const suite=process.env.ASK456_DB_URL?describe:describe.skip;
suite("actual accepted Ask setup HTTP and native booking store",()=>{
  const tenant="ask456-fixture";let cap="";let start="";let end="";let serviceId="";
  const context=(tail:string[]=[])=>({params:Promise.resolve({path:["api","v1","bookings",tenant,...tail]})});
  const request=(method:string,tail:string,body?:unknown)=>new Request(`http://localhost/api/v1/ask-service-bookings/api/v1/bookings/${tenant}${tail}`,{method,...(body?{body:JSON.stringify(body),headers:{"content-type":"application/json"}}:{})});
  const snapshot=()=>boundary.db!.execute("select jsonb_build_object('bookings',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from business_bookings b),'requests',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public_booking_requests r),'receipts',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public_website_bookings r),'inquiry',(select state from inquiry_workspaces limit 1))");
  beforeAll(()=>{
    boundary.db=taskPostgres(process.env.ASK456_DB_URL!);
    for(const [name,value] of Object.entries({STRELVA_BOOKING_STORE_WRITE:"1",STRELVA_BOOKING_STORE_READ:"postgres",STRELVA_BOOKING_CALENDAR_BUSY:"0",STRELVA_WORKSPACE_RELEASE:"1",STRELVA_SYSTEMS_RELEASE:"1",STRELVA_INQUIRIES_RELEASE:"1",STRELVA_MAKE_REAL_LIVE:"1",SECRETS_ENC_KEY:"11".repeat(32)}))vi.stubEnv(name,value);
    // Local fixture qualification, never a claim about a deployed parity streak.
    boundary.db.execute("create or replace function public.booking_parity_streak() returns jsonb language sql as $$select '{\"days\":7}'::jsonb$$");
    const setup=boundary.db.execute("select jsonb_build_object('cap',g.capability_id,'service',s.business_service_id,'availability',s.selection#>'{service,availability}') from ask_native_service_setups s join public_website_booking_grants g on g.id=s.grant_id");
    cap=setup.cap;serviceId=setup.service;start=setup.availability[0].start;end=setup.availability[0].end;resetBookingFlagCache();
  });
  it("serves exactly the approved interval through actual nativeSlots and both guarded HTTP readers",async()=>{
    const range={from:start,to:new Date(Date.parse(end)+1).toISOString()};
    expect((await nativeSlots(tenant,cap,range.from,range.to)).slots.map(({start,end})=>({start,end}))).toEqual([{start,end}]);
    const params=new URLSearchParams({capabilityId:cap,...range});
    const response=await GET(request("GET",`?${params}`),context());expect(response.status).toBe(200);
    expect((await response.json()).slots).toHaveLength(1);
    expect((await ordinaryGET(new Request(`http://localhost/api/v1/bookings/${tenant}?${params}`),{params:Promise.resolve({tenant})})).status).toBe(200);
  });
  it("refuses fallback and feature-off before any admission, inquiry or booking mutation; ordinary identifiers need no setup DB",async()=>{
    const baseline=snapshot();
    for(const mode of ["legacy","compare"]){vi.stubEnv("STRELVA_BOOKING_STORE_READ",mode);resetBookingFlagCache();
      expect((await GET(request("GET",`?capabilityId=${cap}`),context())).status).toBe(503);
      expect((await ordinaryGET(new Request(`http://localhost/api/v1/bookings/${tenant}?capabilityId=${cap}`),{params:Promise.resolve({tenant})})).status).toBe(503);
      expect((await POST(request("POST","/reservations",{capabilityId:cap,capabilityVersion:1,slotId:"unavailable-slot",visitor:{name:"Fixture",email:"fixture@example.test"}}),context(["reservations"]))).status).toBe(503);
      expect((await legacyAvailability(new Request(`http://localhost/api/booking/availability?date=${start.slice(0,10)}&serviceId=${serviceId}`))).status).toBeGreaterThanOrEqual(500);
      expect((await legacyReserve(new Request("http://localhost/api/booking",{method:"POST",body:JSON.stringify({serviceId,date:start.slice(0,10),startTime:"10:00",clientName:"Fixture",clientEmail:"fixture@example.test"}),headers:{"content-type":"application/json"}}))).status).toBeGreaterThanOrEqual(500);
      await expect(assertAskServiceTenantSource(tenant,serviceId,serviceId)).rejects.toThrow();expect(snapshot()).toEqual(baseline);
    }
    vi.stubEnv("STRELVA_BOOKING_STORE_READ","postgres");vi.stubEnv("STRELVA_SYSTEMS_RELEASE","0");resetBookingFlagCache();
    expect((await GET(request("GET",`?capabilityId=${cap}`),context())).status).toBe(503);expect(snapshot()).toEqual(baseline);
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE","1");
    boundary.db!.execute("create or replace function public.booking_parity_streak() returns jsonb language sql as $$select '{\"days\":6}'::jsonb$$");resetBookingFlagCache();
    expect((await GET(request("GET",`?capabilityId=${cap}`),context())).status).toBe(503);expect(snapshot()).toEqual(baseline);
    boundary.db!.execute("create or replace function public.booking_parity_streak() returns jsonb language sql as $$select '{\"days\":7}'::jsonb$$");resetBookingFlagCache();
    const db=boundary.db;boundary.db=null;boundary.legacyNative=false;
    await expect(assertAskServiceTenantSource(tenant,"existing-redis-service")).resolves.toBeUndefined();
    await expect(assertAskServiceTenantSource(tenant,"45600000-0000-4000-8000-000000000077")).resolves.toBeUndefined();
    expect((await legacyAvailability(new Request("http://localhost/api/booking/availability?date=2026-10-18&serviceId=45600000-0000-4000-8000-000000000077"))).status).toBe(200);
    const calls=boundary.legacyCalls;await legacyReserve(new Request("http://localhost/api/booking",{method:"POST",body:JSON.stringify({serviceId:"45600000-0000-4000-8000-000000000077",date:"2026-10-18",startTime:"10:00",clientName:"Fixture",clientEmail:"fixture@example.test"}),headers:{"content-type":"application/json"}}));expect(boundary.legacyCalls).toBe(calls+1);
    boundary.db=db;boundary.legacyNative=true;
    await expect(assertAskServiceTenantSource(tenant,serviceId,serviceId)).rejects.toThrow("booking request page");
  });
  it("uses email confirmation then owner confirmation, exact replay, cancellation and native status recovery without provider writes",async()=>{
    const schedule=await (await GET(request("GET",`?capabilityId=${cap}`),context())).json();
    const body={capabilityId:cap,capabilityVersion:1,slotId:schedule.slots[0].id,requestId:"ask456-isolated-request-"+"x".repeat(40),visitor:{name:"Fixture visitor",email:"visitor@example.test",message:"Test request"}};
    boundary.emailAllowed=false;const before=snapshot();expect((await POST(request("POST","/reservations",body),context(["reservations"]))).status).toBe(503);expect(snapshot()).toEqual(before);boundary.emailAllowed=true;
    const response=await POST(request("POST","/reservations",body),context(["reservations"]));const receipt=await response.json();expect(response.status,JSON.stringify(receipt)).toBe(201);expect(receipt.status).toBe("pending");
    const token=boundary.emails[0]!.split("/").at(-1)!;const held=snapshot();const captures=boundary.captures;
    vi.stubEnv("STRELVA_BOOKING_STORE_READ","legacy");resetBookingFlagCache();await expect(guardAskServiceConfirmation(token)).rejects.toThrow();
    await expect(createPublicWebsiteBookingService().confirm(token)).rejects.toThrow();expect(snapshot()).toEqual(held);expect(boundary.captures).toBe(captures);
    const originalRpc=boundary.db!.rpc.bind(boundary.db);
    const missingInspector=vi.spyOn(boundary.db!,"rpc").mockImplementation(async(name,args)=>name==="inspect_ask_service_confirmation"?{data:null,error:{code:"PGRST202",message:"Could not find function in schema cache"}}:originalRpc(name,args));
    await expect(createPublicWebsiteBookingService().confirm(token)).rejects.toThrow();
    expect(snapshot()).toEqual(held);expect(boundary.captures).toBe(captures);missingInspector.mockRestore();
    vi.stubEnv("STRELVA_BOOKING_STORE_READ","postgres");resetBookingFlagCache();
    const confirmation=await confirmationAction(new Request(`http://localhost/booking-confirm/${token}/action`,{method:"POST",headers:{origin:"http://localhost"}}),{params:Promise.resolve({token})});
    expect(confirmation.headers.get("location")).toContain("done=pending");
    expect(boundary.db!.execute("select to_jsonb(status) from business_bookings limit 1")).toBe("requested");
    expect(boundary.db!.execute("select to_jsonb(business_id) from inquiry_workspaces limit 1")).toBe("45600000-0000-4000-8000-000000000010");
    expect(boundary.db!.execute("select to_jsonb(state->'actionReceipts' @> '[{\"inquiryId\":\"fixture-inquiry-1\"}]'::jsonb) from inquiry_workspaces limit 1")).toBe(true);
    const replay=await POST(request("POST","/reservations",body),context(["reservations"]));const replayBody=await replay.json();expect(replay.status,JSON.stringify(replayBody)).toBe(201);expect(replayBody.reservationId).toBe(receipt.reservationId);expect(boundary.captures).toBe(captures);
    const nativeId=boundary.db!.execute("select to_jsonb(id) from business_bookings limit 1");
    expect((await setBookingStatus(tenant,nativeId,"confirmed","owner","Fixture owner approved")).status).not.toBe("conflict");
    const management={managementToken:receipt.managementToken};
    const readback=()=>POST(request("POST",`/reservations/${receipt.reservationId}/readback`,management),context(["reservations",receipt.reservationId,"readback"]));
    expect((await (await readback()).json()).status).toBe("confirmed");
    expect((await (await DELETE(request("DELETE",`/reservations/${receipt.reservationId}`,management),context(["reservations",receipt.reservationId]))).json()).status).toBe("cancelled");
    expect((await (await readback()).json()).status).toBe("cancelled");
  });
  it("holds verified identity against concurrent revocation through publish replay and scoped stop",async()=>{
    const url=process.env.ASK456_DB_URL!;const business="45600000-0000-4000-8000-000000000010";const owner="45600000-0000-4000-8000-000000000001";
    const commands=[`select public.publish_ask_native_service_setup('${business}','${owner}','owner456@example.test',(select jsonb_build_object('selection',s.selection,'workId',s.work_id,'capabilityId',g.capability_id,'inquiryId',g.inquiry_capability_id) from ask_native_service_setups s join public_website_booking_grants g on g.id=s.grant_id))`,
      `select public.revoke_ask_native_service_setup('${business}','${owner}','owner456@example.test',(select grant_id from ask_native_service_setups),'Local rollback test')`];
    for(const operation of commands){
      const child=spawn(pgBinary("psql"),["--dbname="+url,"-X","-qAt","-v","ON_ERROR_STOP=1"],{env:pgEnv()});
      const exited=once(child,"exit");let output="";
      const ready=new Promise<void>((resolve,reject)=>{child.stdout.on("data",chunk=>{output+=String(chunk);if(output.includes("IDENTITY_LOCKED"))resolve();});child.on("exit",code=>{if(code!==0)reject(new Error("Identity transaction failed"));});});
      child.stdin.end(`begin; ${operation};\n\\echo IDENTITY_LOCKED\nselect pg_sleep(0.4); rollback;`);await ready;
      const started=Date.now();command("psql",["--dbname="+url,"-X","-qAt","-v","ON_ERROR_STOP=1","-c",`update public.users set verified_at=null where id='${owner}'`]);
      expect(Date.now()-started).toBeGreaterThanOrEqual(250);await exited;
      boundary.db!.execute(`with restored as (update public.users set verified_at=clock_timestamp() where id='${owner}' returning id) select to_jsonb(count(*)) from restored`);
    }
  });
});
