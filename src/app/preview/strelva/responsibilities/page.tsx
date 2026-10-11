import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ResponsibilityProof, type ResponsibilityProofData } from "@/experience/operations/ResponsibilityProof";
import type { ResponsibilityProofCard } from "@/platform/work-execution/responsibility-proof";
export const dynamic="force-dynamic";
const businessId="99100000-0000-4000-8000-000000000011";
const cards: ResponsibilityProofCard[] = ["Google review replies","Business hours","Website health","Inquiry reply time","Weekly proof"].map((title,index)=>({
 responsibilityId:`99100000-0000-4000-8000-00000000010${index}`,title,from:"2026-10-01T00:00:00.000Z",to:"2026-10-08T00:00:00.000Z",
 status:index===0?"verified":index===1?"partial":index===2?"failed":"unverified",
 did:index===0?"2 review replies posted. This proves these actions, not every expected outcome.":index===1?"Hours change accepted; Google read-back is pending.":index===2?"The website health check failed.":"No verified action receipt in this period.",
 verified:index===0?"Both Google replies matched on read-back.":index===1?"Accepted changes will not be retried.":index===2?"The website could not be reached. The agency needs to review it.":"No verified outcome receipt in this period.",
 receiptRefs:[],openHref:`/workspace?workspaceId=${businessId}&view=operations`,undoHref:index===0?`/workspace/google?workspaceId=${businessId}#google-receipt-fixture`:null,
}));
const data:ResponsibilityProofData={proof:{cards,verdict:"1 of 5 responsibility cards has verified action receipts; 4 need evidence or attention. This does not certify a maintained service condition."},state:{businessId,providerWorkspaceId:"99100000-0000-4000-8000-000000000012",canSetCadence:true,cadence:"weekly",mandates:[]}};
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
 if(!strelvaUiPreviewEnabled())notFound();
 const { state } = await searchParams;
 const fixture = state === "empty" ? { ...data, proof: { cards: [], verdict: "No accepted responsibilities recorded." }, state: { ...data.state, canSetCadence: false } } : state === "member" ? { ...data, state: { ...data.state, canSetCadence: false } } : data;
 return <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-8"><p className="text-sm text-gray-muted">Fictional local proof preview. Controls are disabled; no outside calls.</p><ResponsibilityProof workspaceId={businessId} readOnly={state === "member"} initial={state === "unavailable" ? undefined : fixture}/></main>;}
