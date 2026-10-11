"use client";
import { useState } from "react";
import { AgencyClientAvailability } from "@/experience/workspace/agency/AgencyClientAvailability";
import { SelectInput } from "@/components/ui/TextInput";
const agencyWorkspaceId="25600000-0000-4000-8000-000000000020",workspaceId="25600000-0000-4000-8000-000000000010";
export function AgencyClientAvailabilityFixture() {
 const [scenario,setScenario]=useState("permitted");
 const request:typeof fetch=async (_input,init)=>{
  if (scenario==="error") return Response.json({error:"Current agency access could not be confirmed. Nothing changed."},{status:503});
  if (init?.method==="POST"&&scenario==="conflict") return Response.json({error:"The platform changed this permission. Refresh before trying again."},{status:409});
  const body=init?.body?JSON.parse(String(init.body)):null;
  return Response.json({agencyWorkspaceId,workspaceId,flags:scenario==="empty"?[]:[{flag:"systems",label:"Systems",ceiling:scenario==="ceiling"?"off":"on",ceilingRevision:3,systemId:"25600000-0000-4000-8000-000000000040",systemName:"Fictional Buffalo client website with a deliberately long name",verificationEffect:"publish",verified:scenario!=="unverified",state:body?.state||"off",revision:body?3:2,changedAt:null,environment:scenario==="paused"?"off":"workspace",workspaceReleased:true}]});
 };
 return <div className="grid gap-8"><SelectInput label="Fixture state" value={scenario} onChange={event=>setScenario(event.target.value)} options={["permitted","empty","ceiling","unverified","paused","conflict","error"].map(value=>({value,label:value}))}/><AgencyClientAvailability key={scenario} agencyWorkspaceId={agencyWorkspaceId} workspaceId={workspaceId} request={request}/></div>;
}
