"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicContinuation } from "@/lib/public-continuation";
import { Button } from "@/components/ui/Button";
import { SelectInput } from "@/components/ui/TextInput";
import type { WebsiteBrief } from "@/products/websites/contracts";
import { serverWebsiteTransport, type WebsiteExperienceTransport } from "@/experience/websites/contracts";

type Destination = { id: string; name: string; kind: "personal" | "agency" | "customer" };

export function websiteBriefFromPublicContinuation(brief: PublicContinuation): WebsiteBrief {
  return {
    businessName: brief.businessName,
    description: brief.request,
    primaryGoal: brief.result,
    primaryCallToAction: "Contact us",
  };
}

type PublicContinuationCardProps = {
  brief: PublicContinuation;
  destinations: Destination[];
  actorEmail: string;
  websiteTransport?: WebsiteExperienceTransport;
  onWebsiteSaved?: (location: string) => void;
};

export function PublicContinuationCard({ brief, destinations, actorEmail, websiteTransport = serverWebsiteTransport, onWebsiteSaved }: PublicContinuationCardProps) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(destinations[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [websiteBusy, setWebsiteBusy] = useState(false);
  const [error, setError] = useState("");
  const websiteRequestId = useRef(`public-website-${brief.id}`);
  async function save() {
    if (!workspaceId || busy || websiteBusy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/public-continuation/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const body = await response.json() as { error?: string; location?: string };
      if (!response.ok || !body.location) throw new Error(body.error || "The brief could not be saved.");
      router.push(body.location);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The brief could not be saved."); }
    finally { setBusy(false); }
  }
  async function startWebsite() {
    if (!workspaceId || busy || websiteBusy) return;
    setWebsiteBusy(true); setError("");
    try {
      const saved = await websiteTransport.create({
        workspaceId,
        requestId: websiteRequestId.current,
        brief: websiteBriefFromPublicContinuation(brief),
      });
      const location = `/workspace?workspaceId=${encodeURIComponent(saved.workspaceId)}&view=websites&work=${encodeURIComponent(saved.workId)}`;
      if (onWebsiteSaved) onWebsiteSaved(location);
      else router.push(location);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The website draft could not be created. Your brief is unchanged.");
    } finally { setWebsiteBusy(false); }
  }
  return <section className="border-b border-gray-border py-8" aria-labelledby="continuation-title">
    <p className="text-[14px] font-medium text-accent-text">Public session ready</p>
    <h2 id="continuation-title" className="mt-2 text-[20px] font-medium text-warm-black">Continue “{brief.resultTitle}”</h2>
    <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-muted">{brief.request}</p>
    <p className="mt-4 text-[14px] leading-relaxed text-gray-muted">Signed in as <span className="font-medium text-warm-black">{actorEmail}</span>. Confirm this is the account that should own the brief, then choose its workspace.</p>
    <dl className="mt-5 grid gap-3 text-[14px] sm:grid-cols-2"><div><dt className="text-gray-muted">Public business context</dt><dd className="mt-1 text-warm-black">{brief.businessName}</dd></div><div><dt className="text-gray-muted">Local file names</dt><dd className="mt-1 text-warm-black">{brief.fileNames.length ? `${brief.fileNames.length} referenced; file contents were not uploaded` : "None"}</dd></div></dl>
    {destinations.length ? <div className="mt-6 max-w-xl"><SelectInput label="Save to" options={destinations.map((destination) => ({ value: destination.id, label: `${destination.name} · ${destination.kind}` }))} value={workspaceId} disabled={busy || websiteBusy} onChange={(event) => setWorkspaceId(event.target.value)} helperText="Choose the workspace that owns this request. The public business name does not grant access or create a business." /><div className="mt-4 flex flex-wrap gap-3"><Button type="button" size="lg" variant="secondary" loading={busy} disabled={!workspaceId || websiteBusy} onClick={() => void save()}>Save private brief</Button><Button type="button" size="lg" loading={websiteBusy} disabled={!workspaceId || busy} onClick={() => void startWebsite()}>Start website draft</Button></div><p className="mt-3 text-[13px] leading-relaxed text-gray-muted">Carry this brief into a private website draft, or save it as a working document.</p></div> : <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-gray-muted">This account has no writable workspace for the brief. The public session and any downloaded copy are unchanged.</p>}
    {error ? <p role="alert" className="mt-4 text-[14px] text-critical">{error}</p> : null}
  </section>;
}
