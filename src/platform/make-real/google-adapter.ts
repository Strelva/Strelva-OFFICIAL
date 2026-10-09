import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { DeclaredEffect } from "@/platform/possibilities/contracts";
import type { EffectAdapter } from "./ports";
import type { LiveChannelContext } from "./live-adapters";
export const googleMakeRealRequestSchema = z.object({ tenantId:z.string().min(1).max(200),locationId:z.string().min(1).max(64),eventId:z.string().min(1).max(200),draftDigest:z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type GoogleMakeRealRequest = z.infer<typeof googleMakeRealRequestSchema>;
export interface GoogleMakeRealState {
 ready:boolean; reason?:string; resolved?:boolean;
 receipt: { id:string; status:string; readback:string|null; undo:boolean } | null;
}
export interface GoogleMakeRealPorts {
 forService?(context: import("./live").LiveMakeRealServiceContext): GoogleMakeRealPorts;
 inspect(actor:WorkspaceActor,businessId:string,request:GoogleMakeRealRequest):Promise<GoogleMakeRealState>;
 approve(actor:WorkspaceActor,businessId:string,request:GoogleMakeRealRequest):Promise<{changed:boolean;reason?:string}>;
 verify(actor:WorkspaceActor,businessId:string,request:GoogleMakeRealRequest,receiptId:string|null):Promise<{ok:boolean;detail:string}>;
 undo(actor:WorkspaceActor,businessId:string,request:GoogleMakeRealRequest,receiptId:string):Promise<{status:string}>;
}
const refSchema=z.object({businessId:z.string(),request:googleMakeRealRequestSchema,receiptId:z.string().nullable()});
const accepted=(state:GoogleMakeRealState)=>state.receipt && ["posted","posted_unverified","held_by_google"].includes(state.receipt.status);
export function createGoogleListingAdapter(ports:GoogleMakeRealPorts,ctx:LiveChannelContext):EffectAdapter {
 const request=(effect:DeclaredEffect|undefined)=>googleMakeRealRequestSchema.parse(effect?.request);
 const ref=(businessId:string,req:GoogleMakeRealRequest,state:GoogleMakeRealState)=>JSON.stringify({businessId,request:req,receiptId:state.receipt?.id??null});
 const inspectRef=async(businessId:string,providerRef:string)=>{
  const parsed=refSchema.parse(JSON.parse(providerRef));
  if(parsed.businessId!==businessId)throw new Error("Google receipt belongs to another business.");
  const state=await ports.inspect(ctx.actor,businessId,parsed.request);
  if((state.receipt?.id??null)!==parsed.receiptId)throw new Error("Google receipt could not be confirmed.");
  return {parsed,state};
 };
 return {
  kind:"publish",mode:"live",channel:"google_listing",idempotentByKey:false,
  reversibility:()=>"compensable",
  async rehearse(){return {ok:false,detail:"Google rehearsal uses an isolated adapter."};},
  async ready({businessId,effect}){
   if(!(await ctx.enabled("google_listing")))return {ok:false,reason:"Google Make real is not enabled for this business."};
   const state=await ports.inspect(ctx.actor,businessId,request(effect));
   return state.ready||Boolean(accepted(state))?{ok:true}:{ok:false,reason:state.reason??"The exact Google draft is unavailable."};
  },
  async perform({businessId,effect}){
   const req=request(effect);const before=await ports.inspect(ctx.actor,businessId,req);
   if(accepted(before))return {status:"accepted",providerRef:ref(businessId,req,before)};
   if(!before.ready)return {status:"rejected",reason:before.reason??"Google draft is unavailable."};
   const result=await ports.approve(ctx.actor,businessId,req);
   const after=await ports.inspect(ctx.actor,businessId,req);
   if(accepted(after))return {status:"accepted",providerRef:ref(businessId,req,after)};
   if(!after.receipt && after.resolved && (await ports.verify(ctx.actor,businessId,req,null)).ok)return {status:"accepted",providerRef:ref(businessId,req,after)};
   if(after.receipt?.status==="posting" || result.changed || ["google_write_unconfirmed","already_resolved","action_reconciliation_required"].includes(result.reason??""))throw new Error("Google's effect is unconfirmed. Reconcile the existing receipt before retrying.");
   return {status:"rejected",reason:result.reason??after.reason??"Google refused this change."};
  },
  async find({businessId,effect}){
   const req=request(effect);const state=await ports.inspect(ctx.actor,businessId,req);
   if(accepted(state))return {found:true,providerRef:ref(businessId,req,state)};
   if(!state.receipt && state.resolved && (await ports.verify(ctx.actor,businessId,req,null)).ok)return {found:true,providerRef:ref(businessId,req,state)};
   if(state.receipt?.status==="failed")return {found:false};
   return null; // Absence cannot prove an interrupted provider write did not land.
  },
  async readBack({businessId,providerRef}){
   const {parsed}=await inspectRef(businessId,providerRef);
   return ports.verify(ctx.actor,businessId,parsed.request,parsed.receiptId);
  },
  async compensate({businessId,providerRef}){
   const {parsed,state}=await inspectRef(businessId,providerRef);
   if(state.receipt?.status==="undone")return {ok:true,detail:"The Google change is already undone."};
   if(!parsed.receiptId)return {ok:true,detail:"Google already matched; there is no change to undo."};
   if(!state.receipt?.undo)return {ok:false,detail:"This Google change requires manual recovery."};
   const result=await ports.undo(ctx.actor,businessId,parsed.request,parsed.receiptId);
   if(result.status==="posted")return {ok:true,detail:"Google confirmed the compensating change."};
   if(["write_unconfirmed","posted_unverified","held_by_google"].includes(result.status))throw new Error("Google undo is unconfirmed; reconcile before another attempt.");
   return {ok:false,detail:"Google refused the compensating change."};
  },
 };
}
