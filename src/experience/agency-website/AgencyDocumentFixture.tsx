"use client";
import { useMemo } from "react";
import { AgencyWebsiteDocumentDraftExperience, AgencyDocumentTransportError, type AgencyDocumentState, type AgencyDocumentTransport } from "./AgencyWebsiteDocumentDraftExperience";

export function AgencyDocumentFixture({ scenario, initial }: { scenario: string; initial: AgencyDocumentState }) {
  const transport = useMemo<AgencyDocumentTransport>(() => { let reads = 0; return ({
    async read(_bindingId,signal) { await Promise.resolve(); if (signal?.aborted) throw new DOMException("Aborted","AbortError"); reads++; if (scenario === "agency-preview-expired" && reads > 1) throw new AgencyDocumentTransportError("Synthetic grant expired. The private preview and saving are unavailable.",403); if (scenario === "agency-loading") return new Promise<AgencyDocumentState>(() => {}); if (scenario === "agency-error") throw new Error("Synthetic permission read failed. Reload to try again."); const value=structuredClone(initial); if (scenario === "agency-preview-expired") { const website=value.website!; const candidate=website.rebuild.candidate!; value.previewHref=`/api/agency-website-draft-access?${new URLSearchParams({document:"preview",bindingId:value.grant!.managedWebsiteBindingId,websiteWorkId:website.workId,section:value.section!,revision:String(candidate.revision),contentHash:candidate.contentHash})}`; } return value; },
    async save(_bindingId, record, _section, ops) {
      if (scenario === "agency-stale") throw new Error("This website changed. Reload before preparing a draft.");
      const website = structuredClone(record);
      const candidate = website.rebuild.candidate!;
      for (const op of ops) { const [, , encoded, property] = op.path.split("/"); const id = encoded!.replace(/~1/g,"/").replace(/~0/g,"~"); const node = candidate.document.nodes[id]!; if (property === "props") node.props = op.value as typeof node.props; if (property === "children") node.children = op.value as string[]; }
      website.rebuild.revision++; candidate.revision++;
      const previewPages: Record<string,string> = {};
      for (const page of candidate.document.pages) {
        const response = await fetch(`/preview/strelva/rebuild/site?${new URLSearchParams({page:page.path})}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(candidate.document) });
        if (!response.ok) throw new Error("Fixture render failed.");
        previewPages[page.path] = await response.text();
      }
      const previewHtml = previewPages["/"]!;
      candidate.contentHash = new DOMParser().parseFromString(previewHtml,"text/html").querySelector('meta[name="strelva-site-hash"]')!.getAttribute("content")!;
      return { website, previewHtml, previewPages };
    },
  }); }, [scenario, initial]);
  return <><nav aria-label="Agency interface fixture states" className="flex flex-wrap gap-4 border-b border-gray-border px-5 py-4 text-sm text-gray-muted"><strong className="text-warm-black">Local agency fixture · no client changes</strong>{["active","loading","expired","revoked","no-permission","error","stale","preview-expired"].map(value => <a className="underline" key={value} href={`?scenario=agency-${value}`}>{value}</a>)}</nav><AgencyWebsiteDocumentDraftExperience key={scenario} bindingId={initial.grant?.managedWebsiteBindingId ?? "11111111-1111-4111-8111-111111111111"} transport={transport} /></>;
}
