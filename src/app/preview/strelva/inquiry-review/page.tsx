import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OperatorInquiryReview, type InquiryReviewLoad } from "@/app/admin/client-leads/inquiries/OperatorInquiryReview";
import type { InquiryReviewView } from "@/platform/operator-queue";
export const dynamic="force-dynamic";
export default async function InquiryReviewPreview({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  if(!strelvaUiPreviewEnabled())notFound();
  const params=await searchParams;
  const view:InquiryReviewView=params.view==="notices"?"notices":params.view==="released"?"released":params.view==="spam"?"spam":"held";
  const state:InquiryReviewLoad["state"]=params.state==="error"?"unavailable":params.state==="loading"?"loading":params.state==="denied"?"denied":params.state==="off"?"off":"ready";
  const id="ca500000-0000-4000-8000-000000000020";
  const show=state==="ready"&&params.state!=="empty";
  const load:InquiryReviewLoad={state,next:null,held:show&&view!=="notices"?[{id,workspaceId:null,businessName:"Fixture coffee house",tenantId:"fixture",connectedSiteId:null,leadId:"lead_fixture",name:"Dana Reed",email:"dana@example.test",message:"We’re organizing a private party for thirty people, including a few guests who need step-free access. Is the back room available?",capturedAt:"2026-10-06T12:00:00Z",intakeState:view==="released"?"released":view==="spam"?"confirmed_spam":"held_as_spam",heldReason:"Message matched a spam signal; review before routing."}]:[],notices:show&&view==="notices"?[{id,workspaceId:"ca500000-0000-4000-8000-000000000010",businessName:"Fixture coffee house",tenantId:params.connected==="1"?null:"fixture",connectedSiteId:null,inquiryId:params.connected==="1"?id:"lead_fixture",name:"Dana Reed",at:"2026-10-06T12:00:00Z",status:"bounced",reason:"provider_bounced"}]:[]};
  return <div data-dashboard className="min-h-screen bg-surface-base text-warm-white"><main className="mx-auto max-w-4xl px-4 py-8"><p className="mb-4 text-xs text-gray-muted">Fictional operator preview. Email is disabled.</p><OperatorInquiryReview load={load} view={view} recordsOpen noticesOpen /></main></div>;
}
