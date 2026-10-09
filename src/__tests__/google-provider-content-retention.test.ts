import { afterEach,expect,it,vi } from "vitest";
import { createMemoryReceiptStore } from "@/products/google-listing/receipts";
import { postReviewReply, undoListingChange } from "@/products/google-listing/service";
import type { ListingContext } from "@/products/google-listing/service";
const input={workspaceId:"workspace",bindingId:"binding",locationId:"location",action:"hours_patch" as const,targetRef:null,authority:{kind:"owner_approval" as const,actor:"owner",approvalRef:"exact"},before:{hours:"Google prior"},after:{hours:"Owner authored"},idempotencyKey:"approved-intent"};
afterEach(()=>{vi.useRealTimers();});
it("expires provider snapshots/readback/undo while retaining authored intent and immutable action history",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
 const store=createMemoryReceiptStore();
 const root=(await store.record(input)).receipt;
 await store.settle(root.id,"workspace",{status:"posted",readback:"matched",afterOrigin:"provider",after:{hours:"Google readback"},undo:{kind:"patch_snapshot",updateMask:["hours"],snapshot:{hours:"Google prior"}}});
 expect((await store.get(root.id,"workspace"))?.before).toEqual(input.before);
 vi.advanceTimersByTime(29*86400000);
 const expired=(await store.get(root.id,"workspace"))!;
 expect(expired).toMatchObject({id:root.id,status:"posted",readback:"matched",before:null,after:null,undo:null,authoredInput:input.after,providerPayloadExpired:true,intentDigest:root.intentDigest});
 expect(JSON.stringify(store.all())).not.toContain("Google prior");expect(JSON.stringify(store.all())).not.toContain("Google readback");
 const client={patchLocation:vi.fn()};
 const result=await undoListingChange({workspaceId:"workspace",bindingId:"binding",location:{locationId:"location"},receipts:store,client} as unknown as ListingContext,{receiptId:root.id,authority:{kind:"owner_undo",actor:"owner"}});
 expect(result).toMatchObject({status:"refused",reason:"snapshot_expired"});expect(client.patchLocation).not.toHaveBeenCalled();
});
it("keeps independently authored output and content-free delete undo after provider expiry",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));const store=createMemoryReceiptStore();
 const row=(await store.record({...input,action:"post_create",before:null,after:{summary:"Owner authored post"}})).receipt;
 await store.settle(row.id,"workspace",{status:"posted",undo:{kind:"delete_post",postName:"provider-id"}});
 vi.advanceTimersByTime(30*86400000);
 expect(await store.get(row.id,"workspace")).toMatchObject({after:{summary:"Owner authored post"},authoredInput:{summary:"Owner authored post"},undo:{kind:"delete_post",postName:"provider-id"}});
});
it("cannot extend a copied provider snapshot's original deadline",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));const store=createMemoryReceiptStore();const deadline=new Date(Date.now()+1000).toISOString();
 const row=(await store.record({...input,afterOrigin:"provider",providerPayloadExpiresAt:deadline})).receipt;
 await store.settle(row.id,"workspace",{status:"posted",afterOrigin:"provider",after:{hours:"Copied provider snapshot"}});
 vi.advanceTimersByTime(1000);
 expect(await store.get(row.id,"workspace")).toMatchObject({after:null,authoredInput:null,providerPayloadExpired:true});
});

it("keeps provider failure echo out of permanent receipt history",async()=>{
 const store=createMemoryReceiptStore();
 const client={getReview:vi.fn(async()=>({ok:true,data:{reviewId:"review",starRating:"FIVE"}})),updateReply:vi.fn(async()=>({ok:false,kind:"invalid",status:400,detail:"private Google provider content echo"}))};
 const result=await postReviewReply({workspaceId:"workspace",bindingId:"binding",location:{locationId:"location"},receipts:store,client} as unknown as ListingContext,{reviewId:"review",text:"Owner authored",authority:input.authority});
 expect(result.status).toBe("failed");expect(JSON.stringify(store.all())).not.toContain("private Google provider");
});
