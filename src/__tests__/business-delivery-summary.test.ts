import { describe, expect, it } from "vitest";
import type { ServiceRequest } from "@/platform/service-requests/types";
import { businessDeliveryItems } from "@/experience/workspace/business-delivery-summary";
function request(status: string | null, acceptance = "accepted", state = "requested"): ServiceRequest {
  return { id: "test", outcome: "A working website", status: state, providerAcceptance: { status: acceptance }, deliveryCommitment: status ? { status, blocker: null, dueAt: null } : null } as unknown as ServiceRequest;
}
describe("business home describes actual delivery state", () => {
  it("does not turn requesting a provider into running work", () => expect(businessDeliveryItems([request(null,"pending")])[0]).toMatchObject({attention:false,handling:false,detail:"Awaiting provider review; delivery has not started"}));
  it("does not turn review acceptance into a delivery deadline", () => expect(businessDeliveryItems([request(null)])[0]).toMatchObject({attention:false,handling:false,detail:"Accepted for review; no delivery deadline agreed"}));
  it.each(["proposed","submitted"])("puts %s decisions with the customer", status => expect(businessDeliveryItems([request(status)])[0]).toMatchObject({attention:true,handling:false}));
  it.each(["running","changes_requested"])("shows %s as accepted ongoing delivery", status => expect(businessDeliveryItems([request(status)])[0]).toMatchObject({attention:false,handling:true}));
  it.each(["accepted","cancelled"])("keeps %s history without fabricating a next action", status => expect(businessDeliveryItems([request(status)])[0]).toMatchObject({attention:false,handling:false}));
  it("does not surface draft requests as deliveries",()=>expect(businessDeliveryItems([request(null,"pending","draft")])).toEqual([]));
  it("does not revive withdrawn or declined work",()=>{expect(businessDeliveryItems([request("running","declined"),request("proposed","accepted","withdrawn")]).every(item=>!item.attention&&!item.handling)).toBe(true);});
});
