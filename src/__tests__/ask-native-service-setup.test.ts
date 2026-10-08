import { describe, expect, it, vi } from "vitest";
import { askNewServiceSchema, askServiceSetupSelectionSchema, askServiceSetupIds } from "@/platform/ask/new-service";
import { compiledAskServiceSetup } from "@/products/scheduling/server";
import { prepareAskServiceSetup } from "@/app/api/workspace/ask/service-setup-possibility-server";
import { createBookingPageAdapter } from "@/platform/make-real/live-adapters";
import { createAskPossibilityPort } from "@/app/api/workspace/ask/possibilities-server";
import { createInMemoryPossibilityRepository, createPossibility } from "@/platform/possibilities";
import type { AskPossibilityInput } from "@/platform/ask/ports";
import { contentWithBusinessRecord,nativeBusinessServiceReference } from "@/lib/business-record-reader";

import { syncAskServiceSetupPossibilities, storedPossibilityViews } from "@/experience/systems/stored-possibilities";
import type { SupabasePossibilityRepository } from "@/platform/possibilities/supabase-repository";
import { createInMemoryLiveSystems } from "@/platform/make-real";

const business = "45600000-0000-4000-8000-000000000010";
const actor = { userId:"45600000-0000-4000-8000-000000000001", verifiedEmail:"owner@example.test" };
const id = "45600000-0000-4000-8000-000000000099";
const at = "2026-10-08T12:00:00.000Z";
const service = {kind:"new-booking-service" as const,tenantId:"ask456-fixture",serviceName:"Consultation",durationMinutes:30,provider:"google" as const,timeZone:"America/New_York",availability:[{start:"2026-10-18T14:00:00.000Z",end:"2026-10-18T14:30:00.000Z"}]};
const current = {tenantStableId:"45600000-0000-4000-8000-000000000020",calendar:{id:"45600000-0000-4000-8000-000000000030",workspaceId:business,provider:"google" as const,calendarId:"fixture",calendarName:"Fixture",timeZone:"America/New_York",status:"connected" as const,scopes:[],reminderPolicy:{mode:"off" as const},tokenExpiresAt:null,lastCheckedAt:null,lastError:null,createdAt:at,updatedAt:at},snapshot:null,businessRecordRevision:0,recordHours:null};
const input:AskPossibilityInput = {workspaceId:business,systemId:null,title:"A consultation service",intent:"Collect requests and appointment times",check:"Service works",introduces:{key:"consultation",name:"Consultation",purpose:"Take consultation requests",summary:"30-minute consultation with configured times"},candidate:service};
const inspect = vi.fn(async () => current);
async function prepared() { return prepareAskServiceSetup(actor,input,id,{enabled:async()=>true,inspect,now:()=>at}); }

describe("Ask native service setup",()=>{
  it("keeps service provenance on the exact object, even when presentation IDs collide",()=>{
    const legacy={id:"legacy",name:"Consultation",description:"",duration:"30",price:"",featured:false,who_its_for:"",booking_link:"",comingSoon:false,image_url:""};
    const content={sectionLabel:"Services",headline:"Services",description:"",services:[legacy]};
    const projected=contentWithBusinessRecord("services",content,{revision:1,facts:{},services:[{id:"native-first",name:"Consultation",description:null,priceText:null},{id:"native-second",name:"Consultation",description:null,priceText:null}]});
    expect(projected.services.map(item=>item.id)).toEqual(["legacy","legacy"]);
    expect(nativeBusinessServiceReference(projected.services[0]!)).toBe("native-first");expect(nativeBusinessServiceReference(projected.services[1]!)).toBe("native-second");
    expect(nativeBusinessServiceReference(legacy)).toBeNull();expect(JSON.stringify(projected)).not.toContain("native-first");
  });
  it("refuses invalid duration/overlap/date/zone and fractional minute contracts",()=>{
    expect(askNewServiceSchema.safeParse({...service,durationMinutes:45}).success).toBe(false);
    expect(askNewServiceSchema.safeParse({...service,availability:[...service.availability,...service.availability]}).success).toBe(false);
    expect(askNewServiceSchema.safeParse({...service,timeZone:"not/a/zone"}).success).toBe(false);
    expect(askNewServiceSchema.safeParse({...service,availability:[{start:"bad date",end:"bad date"}]}).success).toBe(false);
    expect(askNewServiceSchema.safeParse({...service,availability:[{start:"2026-11-01T06:30:00.000Z",end:"2026-11-01T07:00:00.000Z"}]}).success).toBe(false);
    expect(askNewServiceSchema.safeParse({...service,availability:[{start:"2026-10-18T14:00:00.123Z",end:"2026-10-18T14:30:00.123Z"}]}).success).toBe(false);
  });
  it("prepares native inquiry + exact schedule without writing, consent, provider or website gate",async()=>{
    const result=await prepared(); const selection=askServiceSetupSelectionSchema.parse(result.content.selection);
    expect(result.effects).toHaveLength(1); expect(result.effects[0]!.request.setupAlternative).toEqual(selection);
    expect(result.previewHref).toBe(`/book/ask456-fixture/${askServiceSetupIds(selection).capabilityId}`);
    const native=await compiledAskServiceSetup(selection,actor.userId);
    expect(native.schedule.createdBy).toBe(actor.userId); expect(native.schedule.availability).toEqual(service.availability);
    expect(native.inquiryState.inquiries).toEqual([]); expect(native.inquiryState.capabilities[0]!.live).toMatchObject({routing:null,followUp:null});
    expect(result.content.rehearsal).toMatchObject({passed:true,nothingLive:true,externalWritesBlocked:true,outboundMessages:[]});
    const repository=createInMemoryPossibilityRepository(); const released=vi.fn();
    const port=createAskPossibilityPort(actor,{repository,released,serviceSetup:async()=>result});
    const opened=await port.open(actor,input); expect(opened.durable).toBe(true); expect(released).not.toHaveBeenCalled();
  });
  it("shows uncertain service authority as Exploring without changing saved pins, then recovers on a confirmed read", async () => {
    const result = await prepared();
    const original = { ...createPossibility({ title: input.title, intent: input.intent,
      introduces: [{ key: input.introduces!.key, name: input.introduces!.name, purpose: input.introduces!.purpose, candidate: { summary: input.introduces!.summary, content: result.content } }],
      effects: result.effects, checks: [{ id: "owner-tries-it", description: input.check }] }, { id, businessId: business, actorId: actor.userId, at }), status: "ready" as const };
    const inner = createInMemoryPossibilityRepository(); await inner.create(original);
    const save = vi.fn(inner.save);
    const repo: SupabasePossibilityRepository = { ...inner, save,
      createFromSource: async value => { await inner.create(value); return { possibility: value, replayed: false }; },
      listWithSources: async workspaceId => (await inner.list(workspaceId)).map(possibility => ({ possibility, sourceRef: null, lastActivityAt: at })) };
    const stored = await repo.listWithSources(business);
    const deps = { repo, live: createInMemoryLiveSystems().port, actorId: actor.userId, at, stored, canWrite: true };
    const uncertain = await syncAskServiceSetupPossibilities({ ...deps, current: async () => { throw Error("authority unavailable"); } });
    expect(storedPossibilityViews(uncertain, [])[0]).toMatchObject({ status: "exploring", staleReason: expect.stringContaining("could not be confirmed") });
    expect(await inner.get(business, id)).toEqual(original); expect(save).not.toHaveBeenCalled();
    save.mockRejectedValueOnce(Error("concurrent stale save refused"));
    const failedSave = await syncAskServiceSetupPossibilities({ ...deps, current: async () => false });
    expect(storedPossibilityViews(failedSave, [])[0]).toMatchObject({ status: "exploring", staleReason: expect.stringContaining("could not be confirmed") });
    expect(await inner.get(business, id)).toEqual(original);
    const confirmed = await syncAskServiceSetupPossibilities({ ...deps, current: async () => true });
    expect(storedPossibilityViews(confirmed, [])[0]).toMatchObject({ status: "ready", staleReason: null });
  });
  it("flag off refuses before lookup, and near/late times refuse before preparing",async()=>{
    const lookup=vi.fn(); await expect(prepareAskServiceSetup(actor,input,id,{enabled:async()=>false,inspect:lookup})).rejects.toThrow("not enabled"); expect(lookup).not.toHaveBeenCalled();
    await expect(prepareAskServiceSetup(actor,{...input,candidate:{...service,availability:[{start:"2026-10-08T13:00:00.000Z",end:"2026-10-08T13:30:00.000Z"}]}},id,{enabled:async()=>true,inspect:lookup,now:()=>at})).rejects.toThrow("four hours");
    await expect(prepareAskServiceSetup(actor,{...input,candidate:{...service,availability:[{start:"2027-10-18T14:00:00.000Z",end:"2027-10-18T14:30:00.000Z"}]}},id,{enabled:async()=>true,inspect:lookup,now:()=>at})).rejects.toThrow("sixty days"); expect(lookup).not.toHaveBeenCalled();
  });
  it("approved adapter uses only the scoped setup operation, reconciles and stops the same receipt",async()=>{
    const result=await prepared(); const publish=vi.fn(),revoke=vi.fn();
    const publishSetup=vi.fn(async()=>({id:"45600000-0000-4000-8000-000000000055",status:"published"}));
    const verifySetup=vi.fn(async()=>({ok:true,detail:"Native state read back"})); const revokeSetup=vi.fn();
    const adapter=createBookingPageAdapter({publish,list:vi.fn(async()=>[]),revoke,publishSetup,verifySetup,revokeSetup},{actor,enabled:async()=>true});
    const effect=result.effects[0]!; const accepted=await adapter.perform({businessId:business,effect,idempotencyKey:"reviewed"}); expect(accepted.status).toBe("accepted"); expect(publish).not.toHaveBeenCalled();
    if(accepted.status!=="accepted") throw Error("missing acceptance");
    expect(await adapter.readBack({businessId:business,providerRef:accepted.providerRef})).toEqual({ok:true,detail:"Native state read back"});
    expect(await adapter.compensate!({businessId:business,providerRef:accepted.providerRef,idempotencyKey:"stop"})).toMatchObject({ok:true}); expect(revokeSetup).toHaveBeenCalledOnce(); expect(revoke).not.toHaveBeenCalled();
    expect(await adapter.perform({businessId:business,effect:{...effect,request:{...effect.request,workId:"45600000-0000-4000-8000-000000000066"}},idempotencyKey:"changed"})).toMatchObject({status:"rejected"}); expect(publishSetup).toHaveBeenCalledOnce();
  });
});
