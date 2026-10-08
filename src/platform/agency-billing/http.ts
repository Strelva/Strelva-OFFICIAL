import { NextResponse } from "next/server";
import { businessBillingEnabled } from "@/platform/business-billing";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure } from "@/platform/workspaces/http";
import { commandAgencyInvoice, fulfillAgencyInvoice } from "./index";

export async function invoiceRequest(request:Request,kind:"rebill"|"pay_link",businessId?:string) {
 const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
 if(!workspaceReleaseEnabled()||!businessBillingEnabled()) return json({error:"Agency billing is not enabled."},503);
 try {
  const actor=await workspaceHttpActor();if(!actor)return json({error:"Sign in to manage agency billing."},401);
  if(request.method==="GET") {
   const intentId=new URL(request.url).searchParams.get("intentId");
   return json(await commandAgencyInvoice(actor,{action:"read",intentId,...(businessId?{businessWorkspaceId:businessId}:{})}));
  }
  if(request.headers.get("origin")!==new URL(request.url).origin || request.headers.get("sec-fetch-site")==="cross-site")return json({error:"Open Strelva directly to change billing."},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return json({error:"Send a JSON request."},415);
  const input=await readWorkspaceBody(request,16384);
  if(!input||typeof input!=="object"||Array.isArray(input))return json({error:"Check the invoice request."},400);
  const body=input as Record<string,unknown>;
  if(body.action==="fulfill") {
   if(businessId)await commandAgencyInvoice(actor,{action:"read",intentId:body.intentId,businessWorkspaceId:businessId});
   return json(await fulfillAgencyInvoice(actor,String(body.intentId??""),new URL(request.url).origin));
  }
  if(body.action==="propose") {
   if(body.kind!==undefined&&body.kind!==kind)return json({error:"Invoice kind does not match this route."},400);
   if(businessId&&body.businessWorkspaceId!==undefined&&body.businessWorkspaceId!==businessId)return json({error:"Choose the addressed business."},400);
   return json(await commandAgencyInvoice(actor,{...body,kind,...(businessId?{businessWorkspaceId:businessId}:{})}));
  }
  return json(await commandAgencyInvoice(actor,{...body,...(businessId?{businessWorkspaceId:businessId}:{})}));
 }catch(error){return workspaceHttpFailure(error);}
}
