import { describe, expect, it } from "vitest";
import { deliveryActions, retainedDeliveryCommand, deliveryCommandKey, type DeliveryInspection } from "@/experience/operations/delivery-client";
const id="b9100000-0000-4000-8000-000000000001";
function inspection(status: string|null, manage=false, operate=false, stopped=false): DeliveryInspection {
 return {actorId:id,request:{status:"requested",providerAcceptance:{status:"accepted"},deliveryCommitment:status?{status}:null},permissions:{canManage:manage,canOperate:operate,stopped,websiteBindings:[{id,name:"Site",tenantId:"site"}]}} as unknown as DeliveryInspection;
}
describe("delivery affordances are constrained by current permissions",()=>{
 it("shows only proposing to the named operator before a commitment exists",()=>expect(deliveryActions(inspection(null,false,true))).toEqual(["propose"]));
 it("does not let an operator start the customer's clock",()=>expect(deliveryActions(inspection("proposed",false,true))).not.toContain("agree"));
 it("lets the managing customer agree or cancel a proposal",()=>expect(deliveryActions(inspection("proposed",true))).toEqual(["agree","cancel"]));
 it("lets the operator report work without granting publication",()=>expect(deliveryActions(inspection("running",false,true))).toEqual(["blocker","submit"]));
 it("keeps final acceptance and requested changes with the customer",()=>expect(deliveryActions(inspection("submitted",true))).toEqual(["accept_result","request_changes","cancel"]));
 it.each(["accepted","cancelled"])("makes terminal %s read-only",status=>expect(deliveryActions(inspection(status,true,true))).toEqual([]));
 it("allows cancellation but no further execution after stopping",()=>expect(deliveryActions(inspection("running",true,true,true))).toEqual(["cancel"]));
 it("does not offer submission without a current website binding",()=>{const value=inspection("running",false,true);value.permissions.websiteBindings=[];expect(deliveryActions(value)).toEqual(["blocker"]);});
 it("does not execute an unaccepted service request",()=>{const value=inspection(null,false,true);value.request.providerAcceptance.status="pending";expect(deliveryActions(value)).toEqual([]);});
 it("retains the exact submitted command for recovery",()=>{const value={action:"delivery_commitment",requestId:id,expectedRevision:4,idempotencyKey:"retained:command",change:{kind:"agree"}};expect(retainedDeliveryCommand(JSON.stringify(value),id)).toEqual(value);});
 it.each([null,"","invalid",JSON.stringify({action:"publish"}),"x".repeat(20001)])("rejects malformed retained state",raw=>expect(retainedDeliveryCommand(raw,id)).toBeNull());
 it("binds retained commands to their request and actor storage namespace",()=>{const raw=JSON.stringify({action:"delivery_commitment",requestId:id,expectedRevision:4,idempotencyKey:"test",change:{kind:"agree"}});expect(retainedDeliveryCommand(raw,"b9100000-0000-4000-8000-000000000002")).toBeNull();expect(deliveryCommandKey("one",id)).not.toBe(deliveryCommandKey("two",id));});
});
