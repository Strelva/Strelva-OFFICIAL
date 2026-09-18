"use client";

import { useState } from "react";
import type { PublicContinuation } from "@/lib/public-continuation";
import { Button } from "@/components/ui/Button";
import { SelectInput } from "@/components/ui/TextInput";

type Destination = { id: string; name: string; kind: "personal" | "agency" | "customer" };

export function PublicContinuationCard({ brief, destinations, actorEmail }: { brief: PublicContinuation; destinations: Destination[]; actorEmail: string }) {
  const [workspaceId, setWorkspaceId] = useState(destinations[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!workspaceId || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/public-continuation/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const body = await response.json() as { error?: string; location?: string };
      if (!response.ok || !body.location) throw new Error(body.error || "The brief could not be saved.");
      window.location.assign(body.location);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The brief could not be saved."); }
    finally { setBusy(false); }
  }
  return <section className="border-b border-gray-border py-8" aria-labelledby="continuation-title">
    <p className="text-[14px] font-medium text-accent-text">Public session ready</p>
    <h2 id="continuation-title" className="mt-2 text-[20px] font-medium text-warm-black">Continue “{brief.resultTitle}”</h2>
    <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-muted">{brief.request}</p>
    <p className="mt-4 text-[14px] leading-relaxed text-gray-muted">Signed in as <span className="font-medium text-warm-black">{actorEmail}</span>. Confirm this is the account that should own the brief, then choose its workspace.</p>
    <dl className="mt-5 grid gap-3 text-[14px] sm:grid-cols-2"><div><dt className="text-gray-muted">Public business context</dt><dd className="mt-1 text-warm-black">{brief.businessName}</dd></div><div><dt className="text-gray-muted">Local file names</dt><dd className="mt-1 text-warm-black">{brief.fileNames.length ? `${brief.fileNames.length} referenced; file contents were not uploaded` : "None"}</dd></div></dl>
    {destinations.length ? <div className="mt-6 max-w-xl"><SelectInput label="Save to" options={destinations.map((destination) => ({ value: destination.id, label: `${destination.name} · ${destination.kind}` }))} value={workspaceId} disabled={busy} onChange={(event) => setWorkspaceId(event.target.value)} helperText="Choose the workspace that owns this request. The public business name does not grant access or create a business." /><Button type="button" size="lg" loading={busy} disabled={!workspaceId} onClick={() => void save()} className="mt-4">Save private brief</Button></div> : <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-gray-muted">This account has no writable workspace for the brief. The public session and any downloaded copy are unchanged.</p>}
    {error ? <p role="alert" className="mt-4 text-[14px] text-critical">{error}</p> : null}
  </section>;
}
