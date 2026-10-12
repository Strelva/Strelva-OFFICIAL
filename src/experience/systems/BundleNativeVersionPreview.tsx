"use client";
import {useMemo} from "react";
import {WorkspaceRequestContext} from "@/experience/workspace/WorkspaceRequest";
import {SystemVersionManagement} from "./SystemVersionManagement";
import {SystemVersionImprovements} from "./SystemVersionImprovements";
export const nativePreviewIds={workspaceId:"bb000000-0000-4000-8000-000000000011",systemId:"bb000000-0000-4000-8000-000000000101",versionId:"bb000000-0000-4000-8000-000000000201"};
export function nativeVersionPreviewRequest(state:string):typeof fetch{
 const {workspaceId,systemId,versionId}=nativePreviewIds;let revision=3,conflicted=false;
 return async(_input,init)=>{
 if(state==="unavailable")return Response.json({error:"This business's native draft is unavailable."},{status:503});
 if(init?.method==="POST"){
 const body=JSON.parse(String(init.body));
 if(state==="stale")return Response.json({error:"The native website changed. Reload its current draft."},{status:409});
 if(state==="conflict"&&!body.nativeResolutions){conflicted=true;return Response.json({outcome:"conflicted",rowRevision:revision,receipt:null,conflict:{kind:"native_conflict",workspaceId,versionId,rowRevision:revision,nativeKind:"website_section",conflicts:[{path:"website_section",local:{title:"Elmwood's local questions"},source:{title:"Updated source questions"}}]}});}
 if(body.nativeResolutions?.some((r:{choice:string})=>r.choice==="local"))revision++;
 return Response.json({outcome:"prepared",rowRevision:revision,receipt:{kind:"native",receiptId:"bb000000-0000-4000-8000-000000000301",workspaceId,versionId,rowRevision:revision,workId:"bb000000-0000-4000-8000-000000000100",reviewHref:`/workspace?view=needs-you&workspaceId=${workspaceId}`,status:"awaiting_native_review"}});
 }
 const definition={kind:"website_section",title:conflicted?"Updated source questions":"Elmwood questions",items:[{question:"How do we start?",answer:"Contact Elmwood's team."}]};
 return Response.json({workspaceId,systemId,versionId,rowRevision:revision,canManage:state!=="readonly",canMakeReal:state!=="readonly",workingDefinition:definition,releases:[],overrides:[],bindings:[],bindingChoices:[],possibilities:[],pendingRelease:{id:`native:${versionId}`,system:{businessId:workspaceId,systemId},title:"Updated Elmwood FAQ",status:"ready",rowRevision:revision,decisionRevision:"a".repeat(64),current:null,preview:definition,changedPaths:["title"],makeReal:{kind:"version_release",versionId}},nativeRuntime:{kind:"website_section",status:state==="unverified"?"unverified":"draft",reviewHref:`/workspace?view=needs-you&workspaceId=${workspaceId}`}});
 };
}
export function BundleNativeVersionPreview({state}:{state:string}){const request=useMemo(()=>nativeVersionPreviewRequest(state),[state]);return <WorkspaceRequestContext.Provider value={request}><div className="space-y-8"><section><h2 className="mb-4 font-display text-2xl">Elmwood’s FAQ Version</h2><SystemVersionManagement {...nativePreviewIds} readOnly={state==="readonly"}/></section><section><h2 className="mb-4 font-display text-2xl">Possibilities</h2><SystemVersionImprovements {...nativePreviewIds} readOnly={state==="readonly"}/></section></div></WorkspaceRequestContext.Provider>;}
