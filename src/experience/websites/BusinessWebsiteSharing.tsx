"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ownerClaimSchema } from "@/products/agency-clients/contracts";
import { StNotice, StPill, StPillLink, StSkeleton, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import { FirstClientHandoff } from "@/experience/workspace/agency/FirstClientHandoff";
import type { RebuildView } from "./rebuild-transport";

const contextSchema = z.object({ kind: z.literal("customer"), workspaceId: z.string(), workId: z.string(), agencyWorkspaceId: z.string().uuid(), ownerClaimed: z.boolean(), pendingClaim: z.object({ claimId: z.string().uuid(), recipientEmail: z.string().email(), expiresAt: z.string() }).nullable() });
const issuedClaimSchema = ownerClaimSchema.extend({ claimPath: z.string().regex(/^\/workspace\/claim\/[a-zA-Z0-9_-]{43}$/) });
type Context = z.infer<typeof contextSchema>;
type Link = { href: string; expiresAt: string; claimId: string };
async function responseJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(z.object({ error: z.string() }).safeParse(body).data?.error ?? "Owner claim could not be confirmed.");
  return body;
}

/** The website already belongs to the business. Claiming the business transfers
 * no artifact and never substitutes source publication for verified client Live. */
export function BusinessWebsiteSharing({ record, readOnly }: { record: RebuildView; readOnly: boolean }) {
  const [current, setCurrent] = useState<Context | null>(null), [reading, setReading] = useState(true), [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false), [link, setLink] = useState<Link | null>(null), [copied, setCopied] = useState(false);
  const inFlight = useRef(false), generation = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const read = useCallback(async (signal?: AbortSignal) => {
    const attempt = ++generation.current;
    setReading(true);
    try {
      const next = contextSchema.parse(await responseJson(await fetch(`/api/websites/${encodeURIComponent(record.workId)}/sharing`, { credentials: "same-origin", cache: "no-store", signal })));
      if (next.workspaceId !== record.workspaceId || next.workId !== record.workId) throw new Error("The owner claim belongs to another website or business.");
      if (!mounted.current || signal?.aborted || attempt !== generation.current) return;
      setCurrent(next); setError(""); setUncertain(false);
      setLink(previous => previous && previous.claimId === next.pendingClaim?.claimId && !next.ownerClaimed ? previous : null);
    } catch (cause) {
      if (mounted.current && !signal?.aborted && attempt === generation.current) { setCurrent(null); setError(cause instanceof Error ? cause.message : "Owner claim status unavailable."); }
    } finally { if (mounted.current && !signal?.aborted && attempt === generation.current) setReading(false); }
  }, [record.workspaceId, record.workId]);
  useEffect(() => { const controller = new AbortController(); void read(controller.signal); return () => controller.abort(); }, [read]);
  async function prepareClaim() {
    if (inFlight.current || readOnly || !current || current.ownerClaimed || Boolean(current.pendingClaim && Date.parse(current.pendingClaim.expiresAt) > Date.now()) || uncertain || reading || !email.trim()) return;
    inFlight.current = true; setBusy(true); setError("");
    let confirmed = false;
    try {
      const response = await fetch("/api/workspace/agency-clients", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "owner_link", agencyWorkspaceId: current.agencyWorkspaceId, customerWorkspaceId: record.workspaceId, ownerEmail: email.trim() }) });
      confirmed = response.status >= 400 && response.status < 500;
      const body = z.object({ ownerClaim: issuedClaimSchema }).parse(await responseJson(response));
      const claim = body.ownerClaim;
      if (claim.customerWorkspaceId !== record.workspaceId || claim.recipientEmail.toLowerCase() !== email.trim().toLowerCase() || Date.parse(claim.expiresAt) <= Date.now()) throw new Error("The issued owner claim identity could not be confirmed.");
      confirmed = true;
      if (mounted.current) { setLink({ href: new URL(claim.claimPath, window.location.origin).href, expiresAt: claim.expiresAt, claimId: claim.claimId }); setCurrent(previous => previous ? { ...previous, pendingClaim: claim } : previous); }
    } catch (cause) {
      if (mounted.current) { setUncertain(!confirmed); setError(confirmed ? cause instanceof Error ? cause.message : "Claim refused." : "Outcome not confirmed. Read the current owner claim before preparing another link. No message was sent."); }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function copy() {
    if (!link || !current || current.ownerClaimed || current.pendingClaim?.claimId !== link.claimId || Date.parse(link.expiresAt) <= Date.now()) { setLink(null); setError("This owner claim is no longer current. Read current owner claim status."); return; }
    try { await navigator.clipboard.writeText(link.href); if (mounted.current) setCopied(true); }
    catch { if (mounted.current) setError("Copy did not work here. Select the private link below and copy it."); }
  }
  const claimed = current?.ownerClaimed === true;
  const live = claimed && record.status === "published" && record.readBack === "verified" && Boolean(record.publishedUrl);
  const pending = Boolean(current?.pendingClaim && Date.parse(current.pendingClaim.expiresAt) > Date.now());
  const reviewHref = `/workspace?${new URLSearchParams({ workspaceId: record.workspaceId, work: record.workId, view: "websites" })}`;
  return <div className="mt-8">
    {reading && !current ? <StSkeleton label="Reading business owner claim" /> : <form onSubmit={event => { event.preventDefault(); void prepareClaim(); }}>
      <FirstClientHandoff status={!current ? "Owner claim status unavailable" : live ? "Live, with publication verified" : claimed ? record.approved ? "Owner claimed the business · preview approved" : "Owner claimed the business · review needed" : pending ? "Waiting for the owner to claim the business" : "Website draft belongs to the client business"}
        detail="This website stays in the client business. The owner accepts the existing business claim, reviews the exact draft and makes it live there. No agency artifact is transferred."
        draft={record.candidate ? "done" : "unverified"} review={record.approved ? "done" : record.candidate ? "active" : "pending"} claim={claimed ? "done" : pending ? "active" : current ? "pending" : "unverified"} live={live ? "done" : record.status === "published" ? "unverified" : "pending"}
        action={reading || !current || uncertain ? <StPill variant="soft" disabled={busy || reading} onClick={() => void read()}>Read current owner claim</StPill> : claimed ? <StPillLink href={reviewHref}>Open client website review</StPillLink> : link && pending ? <StPill disabled={busy || readOnly} onClick={() => void copy()}>{copied ? "Copied · send it yourself" : "Copy business owner claim link"}</StPill> : pending ? <StTextButton onClick={() => void read()}>Check owner acceptance</StTextButton> : <><StTextField label="Owner's email" type="email" required maxLength={254} value={email} disabled={busy || readOnly} onChange={event => setEmail(event.target.value)} /><StPill className="mt-4" type="submit" disabled={busy || readOnly || !email.trim()} busy={busy}>Prepare business owner claim link</StPill></>} />
    </form>}
    {link && pending ? <StTextField label="Private business owner claim link" value={link.href} readOnly onFocus={event => event.currentTarget.select()} /> : null}
    {pending ? <p className="mt-4 text-sm text-gray-muted">For {current?.pendingClaim?.recipientEmail}. The recipient signs in with that address and accepts the business. No message was sent.</p> : null}
    {readOnly ? <StNotice>You have read-only access. An authorized agency owner or admin prepares owner claim links.</StNotice> : null}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    <StTextButton className="mt-4" disabled={busy || reading} onClick={() => void read()}>Refresh owner claim</StTextButton>
  </div>;
}
