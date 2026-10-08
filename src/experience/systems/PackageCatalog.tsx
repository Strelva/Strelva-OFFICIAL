"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { PackageInstallDelegation } from "./PackageInstallDelegation";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { packageCatalogSchema, type PackageListing } from "@/platform/system-versions/listing-contracts";
const receiptSchema = z.object({ workspaceId: z.string().uuid(), systemId: z.string().uuid(), versionId: z.string().uuid(), rowRevision: z.literal(1), outcome: z.literal("created") }).strict();
function failure(value: unknown, fallback: string) { return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback; }
/** Qualified revisions only. Installation prepares a business-owned draft;
 * accounts and the owner's live decision remain in the existing Version flow. */
export function PackageCatalog({ workspaceId, canInstall, canGrantInstall = false, requestOverride }: { workspaceId: string; canInstall: boolean; canGrantInstall?: boolean; requestOverride?: typeof fetch }) {
  const workspaceRequest = useWorkspaceRequest(), request = requestOverride ?? workspaceRequest;
  const [listings, setListings] = useState<PackageListing[] | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void request(`/api/workspace/packages?${new URLSearchParams({ workspaceId })}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failure(body, "Qualified apps could not be read."));
      const parsed = packageCatalogSchema.parse(body);
      if (parsed.workspaceId !== workspaceId) throw new Error("Apps returned for another business.");
      if (!controller.signal.aborted) setListings(parsed.listings);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Qualified apps could not be read."); });
    return () => controller.abort();
  }, [request, workspaceId, attempt]);
  return <section aria-labelledby="qualified-apps-title" className="space-y-5 border-t border-gray-border pt-6">
    <header><h2 id="qualified-apps-title" className="font-display text-xl text-warm-black">Apps from creators</h2><p className="mt-2 text-sm text-gray-muted">Review what an app can use. Install a private draft with your business’s own records and accounts, then approve its release in Needs you.</p></header>
    {!listings && !error ? <p role="status" className="text-sm text-gray-muted">Reading qualified apps…</p> : null}
    {error ? <div className="space-y-3"><p role="alert" className="text-sm text-critical">{error}</p><Button size="sm" variant="secondary" onClick={() => { setListings(null); setError(""); setAttempt(value => value + 1); }}>Retry apps</Button></div> : null}
    {listings?.length === 0 ? <p className="text-sm text-gray-muted">No qualified apps are available for this business yet.</p> : null}
    {!canInstall ? <p className="text-sm text-gray-muted">An owner or admin of this business can install an app.</p> : null}
    <ul className="space-y-5">{listings?.map(listing => <li key={listing.revision.source.revisionId}><ListedPackage key={`${workspaceId}:${listing.revision.source.revisionId}`} workspaceId={workspaceId} listing={listing} canGrantInstall={canGrantInstall} canInstall={canInstall} request={request} /></li>)}</ul>
  </section>;
}
function ListedPackage({ workspaceId, listing, canInstall, canGrantInstall, request }: { workspaceId: string; listing: PackageListing; canInstall: boolean; canGrantInstall: boolean; request: typeof fetch }) {
  const [name, setName] = useState(listing.name), [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState<z.infer<typeof receiptSchema> | null>(null);
  const pending = useRef<string | null>(null), inFlight = useRef(false);
  async function install() {
    if (inFlight.current || !canInstall || receipt) return;
    pending.current ??= JSON.stringify({ action: "install", workspaceId, source: listing.revision.source, name: name.trim(), commandId: crypto.randomUUID() });
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await request("/api/workspace/packages", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: pending.current });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failure(body, "Installation could not be confirmed. Retry this same request."));
      const result = receiptSchema.parse(body);
      if (result.workspaceId !== workspaceId) throw new Error("Installation returned for another business.");
      setReceipt(result); pending.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Installation could not be confirmed."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const declaration = listing.revision.declaration, supported = listing.revision.definition.kind === "internal_app";
  return <article className="space-y-4 rounded-2xl border border-gray-border p-5">
    <header><h3 className="text-base font-medium text-warm-black">{listing.name}</h3><p className="mt-1 text-sm text-gray-muted">Made by {listing.creatorName} · Source revision {listing.revision.source.number}</p><p className="mt-2 text-sm">{listing.revision.summary}</p></header>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">{([
      ["Reads records", declaration.recordsRead], ["Writes records", declaration.recordsWritten], ["Business information", declaration.businessRecordFields], ["Outside actions", declaration.outsideEffects], ["Required accounts", declaration.bindingKinds], ["Data leaving your business", declaration.dataLeavingBusiness],
    ] as const).map(([label, values]) => <div key={label} className="min-w-0"><dt className="text-gray-muted">{label}</dt><dd className="mt-1 break-words">{values.map(value => ({"application.records":"App records","contacts.id":"Contact identity","contacts.name":"Contact names","people.id":"Staff identity","people.name":"Staff names","email_sender":"Business email account","booking_calendar":"Business calendar"}[value] ?? value)).join(", ") || "None"}</dd></div>)}</dl>
    <p className="text-xs text-gray-muted">This exact revision passed automated checks and human review. Your release still requires a separate decision.</p>
    {!supported ? <p className="text-sm text-gray-muted">An install adapter for this package is still being prepared.</p> : null}
    {supported && !receipt ? <><TextInput label="Name in your business" value={name} maxLength={160} disabled={!canInstall || busy || Boolean(pending.current)} onChange={event => setName(event.target.value)} /><Button type="button" size="sm" disabled={!canInstall || busy || !name.trim()} loading={busy} onClick={() => void install()}>{pending.current ? "Retry this installation" : "Install private draft"}</Button></> : null}
    {canGrantInstall && supported ? <PackageInstallDelegation workspaceId={workspaceId} revisionId={listing.revision.source.revisionId} agencyWorkspaceId={listing.source.creatorWorkspaceId} creatorName={listing.creatorName} request={request} /> : null}
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    {receipt ? <div className="space-y-2"><p role="status" className="text-sm">Your private Version is ready. Bind this business’s required accounts and prepare its release in Needs you.</p><Link className="text-sm underline" href={`/workspace?${new URLSearchParams({ workspaceId, system: receipt.systemId })}`}>Open your System</Link></div> : null}
  </article>;
}
