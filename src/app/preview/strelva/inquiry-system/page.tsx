import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { InquirySystemDetailView } from "@/experience/places/InquirySystemDetails";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { InquirySystemSwitchPreview } from "@/experience/workspace/preview/InquirySystemSwitchPreview";
import type { InquirySystemDetail, WorkspaceLeads } from "@/products/inquiries";

export const dynamic = "force-dynamic";
export default async function InquirySystemPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  const detail: InquirySystemDetail = { site: "Juniper Bakery", lifecycle: state === "paused" ? "paused" : "live", health: "The owner email bounced. Strelva needs to fix the recipient.", forms: state === "paused" ? [] : [{ schemaVersion: 1, capabilityId: "fictional-cake-inquiry", version: 2, name: "Custom cakes", form: { component: "form", id: "cake-inquiry", title: "Tell us about your cake", intro: "Share the occasion and we will reply with what we can offer.", disclosure: "Strelva", fields: [{ id: "name", label: "Your name", kind: "text", component: "text_field", required: true }, { id: "service", label: "Service", kind: "select", component: "select_field", required: true, options: ["Custom cakes", "Catering trays"] }, { id: "message", label: "What are you planning?", kind: "textarea", component: "textarea_field", required: true }] } }], connections: [{ kind: "appears in", target: "Juniper Bakery", sentence: "Receives the site's forms. Pausing replies keeps incoming inquiries." }, { kind: "reads", target: "Business details", sentence: "Uses the current owner, people, hours and services." }, { kind: "acts on", target: "Email", sentence: "Each reply follows its approval and sending permissions." }], history: [{ id: "fixture-history", sentence: "Published the updated cake inquiry form after the owner approved it.", at: "2026-10-06T12:00:00Z" }] };
  const data: WorkspaceLeads = { sites: [{ key: "juniper", tenantId: "juniper", siteName: "Juniper Bakery", unavailable: false, lastThirtyDays: 1, leads: [{ id: "fixture-lead", rowId: "5e000000-0000-4000-8000-0000000000d4", name: "Priya S.", email: "priya@example.test", message: "Could you make a cake for 60 people on November 14?", source: "site form", fields: [], createdAt: "2026-10-07T12:00:00Z" }] }], denied: [], durable: true, workspaceReplies: true, bookingOffers: true };
  return <main className="mx-auto max-w-4xl bg-canvas text-warm-black">{state === "fetch" ? <InquirySystemSwitchPreview /> : <InquirySystemDetailView details={[detail]} records={<WorkspaceInquiries workspaceId="5e000000-0000-4000-8000-000000000010" state={{ kind: "ready", data: state === "empty" ? { ...data, sites: data.sites.map(site => ({ ...site, leads: [], lastThirtyDays: 0 })) } : data }} embedded />} />}</main>;
}
