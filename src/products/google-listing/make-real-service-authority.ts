import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import type { UnifiedEvent } from "@/platform/infra/event-contract";
import type { LiveMakeRealServiceContext } from "@/platform/make-real/live";
import type { GoogleMakeRealRequest } from "@/platform/make-real/google-adapter";
import { googleMakeRealDraftDigest } from "./make-real-draft";
const identity=z.object({userId:z.string().uuid(),verifiedEmail:z.string().email(),bindingId:z.string().uuid(),possibilityId:z.string().uuid()});
const prefix=/^make-real-service:([0-9a-f-]{36}):([0-9a-f-]{36})$/;
export function googleServiceActor(context:LiveMakeRealServiceContext):string {
 if(!context.approvalId || !z.string().uuid().safeParse(context.session.sessionId).success || !z.string().uuid().safeParse(context.approvalId).success)throw new Error("Google service approval is unavailable.");
 return `make-real-service:${context.session.sessionId}:${context.approvalId}`;
}
export async function checkGoogleMakeRealService(input:{workspaceId:string;actorId:string;request:GoogleMakeRealRequest;mode?:"inspect"|"approve"|"undo";context?:LiveMakeRealServiceContext}) {
 const match=prefix.exec(input.actorId);if(!match || !z.string().uuid().safeParse(match[1]).success || !z.string().uuid().safeParse(match[2]).success)throw new Error("Google service authority is unavailable.");
 if(input.context && (input.context.session.workspaceId!==input.workspaceId || googleServiceActor(input.context)!==input.actorId))throw new Error("Google service scope changed.");
 const db=getSupabase();if(!db)throw new Error("Google service authority is unavailable.");
 const {data,error}=await (db as unknown as {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}).rpc("check_google_make_real_service_authority",{p_workspace_id:input.workspaceId,p_session_id:match[1],p_decision_id:match[2],p_request:input.request,p_mode:input.mode??"inspect",p_possibility_id:input.context?.possibilityId??null,p_activation_id:input.context?.activationId??null});
 if(error)throw new Error("The owner's Google plan authority ended.");
 const result=identity.parse(data);
 if(input.context && (result.userId!==input.context.session.actor.userId || result.verifiedEmail.toLowerCase()!==input.context.session.actor.verifiedEmail.toLowerCase()))throw new Error("Google service identity changed.");
 return result;
}
export async function authorizeGoogleServiceEvent(input:{tenantId:string;event:UnifiedEvent;actorId:string}) {
 const m=input.event.metadata;if(m?.kind!=="workspace_google_listing_draft" || typeof m.workspaceId!=="string" || typeof m.locationId!=="string")throw new Error("Google service target is unavailable.");
 return checkGoogleMakeRealService({workspaceId:m.workspaceId,actorId:input.actorId,request:{tenantId:input.tenantId,eventId:input.event.id,locationId:m.locationId,draftDigest:googleMakeRealDraftDigest(m)},mode:"approve"});
}
