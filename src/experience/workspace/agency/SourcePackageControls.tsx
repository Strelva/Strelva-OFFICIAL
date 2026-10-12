"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { StLabel, StPill, StRow, StRows, StSection, StSkeleton, StState } from "@/components/ui/strelva/Kit";
import { PackageDeclaration } from "@/experience/systems/PackageDeclaration";
import { SelectInput, TextArea } from "@/components/ui/TextInput";
import { packageDeclarationSchema, revisionQualificationSchema } from "@/platform/system-versions/declaration";
const schema = z.object({ workspaceId: z.string().uuid(), systemId: z.string().uuid(), source: z.object({ listingState: z.enum(["private", "clients", "listed"]) }).passthrough(), revision: z.object({ source: z.object({ revisionId: z.string().uuid(), number: z.number().int().positive() }).passthrough(), declaration: packageDeclarationSchema.optional(), qualification: revisionQualificationSchema.nullable().optional() }).passthrough().nullable(), canReview: z.boolean() }).passthrough();
function errorMessage(body: unknown) { return body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error.trim() ? body.error : "The package request could not be confirmed."; }
/** The source's visibility never grants authority over its installed Versions. */
type Command = { action: "listing"; systemId: string; state: "private" | "clients" | "listed" }
 | { action: "qualify"; revisionId: string }
 | { action: "review"; revisionId: string; approve: boolean; note: string };
type Pending = Readonly<{ input: Readonly<Command>; confirmed: boolean }>;
type View = z.infer<typeof schema>;
function observed(view: View, pending: Pending) {
 if (pending.confirmed) return true;
 const input = pending.input;
 if (input.action === "listing") return view.source.listingState === input.state;
 const q = view.revision?.qualification;
 if (view.revision?.source.revisionId !== input.revisionId || q?.revisionId !== input.revisionId) return false;
 return input.action === "qualify" || q.humanReview.state === (input.approve ? "approved" : "rejected") && q.humanReview.note === input.note;
}
function confirm(body: unknown, input: Command, workspaceId: string, systemId: string) {
 if (input.action === "listing") {
  z.object({ source: z.object({ businessId: z.literal(workspaceId), systemId: z.literal(systemId) }), listingState: z.literal(input.state) }).passthrough().parse(body);
 } else {
  const q = revisionQualificationSchema.parse(body);
  if (q.revisionId !== input.revisionId || q.evidence.some(check => check.revisionId !== input.revisionId)
   || input.action === "review" && (q.humanReview.state !== (input.approve ? "approved" : "rejected") || q.humanReview.note !== input.note)) throw new Error("The response did not confirm this exact revision request.");
 }
}
export function SourcePackageControls(props: { request: typeof fetch; workspaceId: string; systemId: string }) {
 return <ScopedPackageControls key={`${props.workspaceId}:${props.systemId}`} {...props}/>;
}
function ScopedPackageControls({ request, workspaceId, systemId }: { request: typeof fetch; workspaceId: string; systemId: string }) {
 const [opened, setOpened] = useState(false), [view,setView]=useState<View|null>(null), [error,setError]=useState(""), [busy,setBusy]=useState(false), [note,setNote]=useState(""), [attempt,setAttempt]=useState(0), [pending,setPending]=useState<Pending|null>(null);
 const alive=useRef(false), writing=useRef(false), pendingRef=useRef<Pending|null>(null), controllers=useRef(new Set<AbortController>()), sequence=useRef(0), heading=useRef<HTMLElement>(null);
 useEffect(()=>{alive.current=true;const active=controllers.current;return()=>{alive.current=false;for(const controller of active)controller.abort();active.clear();};},[]);
 const load=useCallback(async(signal:AbortSignal)=>{
  const current=++sequence.current;
  const response=await request(`/api/workspace/packages?${new URLSearchParams({workspaceId,sourceSystemId:systemId})}`,{credentials:"same-origin",cache:"no-store",signal});
  const body:unknown=await response.json().catch(()=>null);if(!response.ok)throw new Error(errorMessage(body));const parsed=schema.parse(body);
  if(parsed.workspaceId!==workspaceId||parsed.systemId!==systemId||parsed.revision?.qualification&&[parsed.revision.qualification.revisionId,...parsed.revision.qualification.evidence.map(check=>check.revisionId)].some(id=>id!==parsed.revision?.source.revisionId))throw new Error("Package returned for another source or revision.");
  if(!alive.current||signal.aborted||current!==sequence.current)return;
  setView(parsed);
  const outstanding=pendingRef.current;
  if(outstanding&&(!writing.current||outstanding.confirmed)&&observed(parsed,outstanding)){pendingRef.current=null;setPending(null);setError("");}
  else if(outstanding&&!writing.current)setError("The current package does not confirm the previous request. Changes stay held; read current state again without sending another command.");
 },[request,workspaceId,systemId]);
 useEffect(()=>{if(!opened)return;const controller=new AbortController(), active=controllers.current;active.add(controller);void load(controller.signal).catch(cause=>{if(alive.current&&!controller.signal.aborted)setError(cause instanceof Error&&cause.message.trim()?cause.message:"The package could not be read.");}).finally(()=>active.delete(controller));return()=>{controller.abort();active.delete(controller);};},[opened,load,attempt]);
 async function command(raw:Command){
  if(writing.current||pendingRef.current)return;
  const input=Object.freeze({...raw}) as Readonly<Command>, outstanding=Object.freeze({input,confirmed:false});
  pendingRef.current=outstanding;writing.current=true;++sequence.current;setPending(outstanding);setBusy(true);setError("");
  const controller=new AbortController();controllers.current.add(controller);
  try{
   const response=await request("/api/workspace/packages",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({workspaceId,...input})});
   const body:unknown=await response.json().catch(()=>null);
   if(!response.ok){
    if(response.status>=400&&response.status<500&&body&&typeof body==="object"&&"error" in body&&typeof body.error==="string"&&body.error.trim()&&alive.current&&!controller.signal.aborted){
     const rejected=Object.freeze({input,confirmed:true});pendingRef.current=rejected;setPending(rejected);await load(controller.signal);
    }
    throw new Error(errorMessage(body));
   }
   confirm(body,input,workspaceId,systemId);
   if(!alive.current||controller.signal.aborted)return;
   const confirmed=Object.freeze({input,confirmed:true});pendingRef.current=confirmed;setPending(confirmed);
   await load(controller.signal);
  }catch(cause){if(alive.current&&!controller.signal.aborted)setError(`${cause instanceof Error&&cause.message.trim()?cause.message:"The package request could not be confirmed."} Read current state before another change.`);}
  finally{controllers.current.delete(controller);writing.current=false;if(alive.current&&!controller.signal.aborted)setBusy(false);}
 }
 const locked=busy||pending!==null;
 const revision=view?.revision, q=revision?.qualification;
 return <details className="my-4 text-sm" onToggle={event=>setOpened(event.currentTarget.open)}><summary ref={heading} className="cursor-pointer">Declaration, review and listing</summary><div className="mt-4 max-w-2xl space-y-4">
 {!view&&!error?<div role="status"><StLabel>Reading this source’s exact revision…</StLabel><StSkeleton /></div>:null}{error?<><p role="alert" className="text-critical">{error}</p><StPill variant="soft" disabled={busy} onClick={()=>{setError("");setAttempt(v=>v+1);heading.current?.focus();}}>Read current package</StPill></>:null}
 {pending?<p role="status">Previous request held until its exact result or a confirmed response and current source can be read. No command is sent by reading.</p>:null}
 {view?<><p className="text-gray-muted">Private keeps the source with your workspace. Clients puts qualified revisions in your delegated clients’ Apps, shown with your agency’s name. Each installed client Version keeps its source lineage. Listed makes qualified revisions available to other businesses. Each business owns its accounts, records and release decisions.</p><SelectInput label="Who can find this source" value={view.source.listingState} disabled={locked} options={[{value:"private",label:"Private"},{value:"clients",label:"Clients"},{value:"listed",label:"Listed"}]} onChange={event=>void command({action:"listing",systemId,state:event.target.value as "private" | "clients" | "listed"})}/>
 {revision?<><p>Source revision {revision.source.number} · {q?.status==="qualified"?"Qualified":q?.humanReview.state==="rejected"?"Review rejected":"Qualification pending"}</p>{revision.declaration?<PackageDeclaration declaration={revision.declaration} />:<p className="text-warning">This historical revision has no declaration. Publish a supported native revision before sharing it as a qualified internal tool.</p>}
 <StPill variant="soft" disabled={locked} busy={busy} onClick={()=>void command({action:"qualify",revisionId:revision.source.revisionId})}>Run exact revision checks</StPill>
 {q?<><StSection title="Exact revision checks"><StRows label="Qualification evidence">{q.evidence.map(check=><StRow key={check.check} title={check.check.replaceAll("_"," ")} detail={<details><summary className="cursor-pointer">Evidence</summary><p className="mt-2 break-words">{check.note}</p></details>} end={<StState kind={check.status==="failed"?"down":check.status==="passed"?"live":"need"}>{check.status}</StState>} />)}</StRows></StSection><p className="text-gray-muted">Human review: {q.humanReview.state}. {q.humanReview.note}</p></>:null}
 {view.canReview&&q?.humanReview.state==="pending"?<><TextArea label="Review of this exact revision" value={note} rows={3} disabled={locked} onChange={event=>setNote(event.target.value)} /><div className="flex flex-wrap gap-3"><StPill disabled={locked||!note.trim()||q.evidence.some(check=>check.status!=="passed")} onClick={()=>void command({action:"review",revisionId:revision.source.revisionId,approve:true,note:note.trim()})}>Approve qualification</StPill><StPill variant="soft" disabled={locked||!note.trim()} onClick={()=>void command({action:"review",revisionId:revision.source.revisionId,approve:false,note:note.trim()})}>Reject qualification</StPill></div></>:q?.status!=="qualified"?<p className="text-gray-muted">A configured reviewer must approve this exact revision before it can be listed or installed. A review standard and reviewer have to be designated first.</p>:null}</>:<p>No immutable revision has been published.</p>}</>:null}
 </div></details>;
}
