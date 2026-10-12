"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { StPill, StPillLink, StNotice, StSurface, StTextButton, StSkeleton } from "@/components/ui/strelva/Kit";
import { TextInput } from "@/components/ui/TextInput";
import { FirstClientHandoff } from "@/experience/workspace/agency/FirstClientHandoff";
import { parseRebuildView, type RebuildView } from "./rebuild-transport";

const handoffSchema = z.object({
  id: z.string(), sourceWorkId: z.string(), recipientEmail: z.string().email(),
  status: z.enum(["pending", "accepted", "expired", "revoked"]),
  expiresAt: z.string().datetime({ offset: true }), createdAt: z.string().datetime({ offset: true }),
});
type Handoff = z.infer<typeof handoffSchema>;
const snapshotSchema = z.object({ workspaceId: z.string(), handoffs: z.array(handoffSchema) });
const onboardingSchema = z.object({ onboarding: z.object({ agency: z.object({ id: z.string() }), effects: z.array(z.object({ effect: z.string(), verified: z.boolean() })) }) });
const reviewLinkSchema = z.object({ previewHref: z.string(), expiresAt: z.string().datetime({ offset: true }), recipientEmail: z.string().email() });
const reviewIdentitySchema = z.object({ workspaceId: z.string(), workId: z.string(), revision: z.number(), contentHash: z.string(), recipientEmail: z.string(), expiresAt: z.number() });
const claimLinkSchema = z.object({ token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/), handoff: handoffSchema });
type PrivateLink = { action: "share" | "handoff"; href: string; expiresAt: string; recipientEmail: string; candidateHash: string; handoffId?: string };
type Current = { record: RebuildView; handoff: Handoff | null; claimKnown: boolean; publishing: boolean | null };

async function json(response: Response) {
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(value);
    throw new Error(error.success ? error.data.error : "The handoff could not be read.");
  }
  return value;
}

export function WebsiteRebuildSharing(props: { workId: string; readOnly: boolean; record?: RebuildView }) {
  return <ScopedSharing key={props.workId} {...props} />;
}

function ScopedSharing({ workId, readOnly, record: suppliedRecord }: { workId: string; readOnly: boolean; record?: RebuildView }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(true);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<Current | null>(null);
  const [link, setLink] = useState<PrivateLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const readGeneration = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const read = useCallback(async (signal?: AbortSignal, useSupplied = false) => {
    const generation = ++readGeneration.current;
    const active = () => mounted.current && !signal?.aborted && generation === readGeneration.current;
    setReading(true);
    try {
      const record = useSupplied && suppliedRecord ? suppliedRecord : parseRebuildView(await json(await fetch(`/api/websites/${encodeURIComponent(workId)}/rebuild`, { cache: "no-store", credentials: "same-origin", signal })));
      if (record.workId !== workId) throw new Error("The website returned belongs to a different handoff.");
      const [snapshotResult, onboardingResult] = await Promise.allSettled([
        fetch(`/api/workspace?workspaceId=${encodeURIComponent(record.workspaceId)}`, { cache: "no-store", credentials: "same-origin", signal }).then(json).then(value => snapshotSchema.parse(value)),
        fetch(`/api/agency-onboarding?workspaceId=${encodeURIComponent(record.workspaceId)}`, { cache: "no-store", credentials: "same-origin", signal }).then(json).then(value => onboardingSchema.parse(value)),
      ]);
      if (!active()) return;
      const snapshot = snapshotResult.status === "fulfilled" && snapshotResult.value.workspaceId === record.workspaceId ? snapshotResult.value : null;
      const latest = snapshot?.handoffs.filter(item => item.sourceWorkId === workId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
      const onboarding = onboardingResult.status === "fulfilled" && onboardingResult.value.onboarding.agency.id === record.workspaceId ? onboardingResult.value.onboarding : null;
      if (latest && ["revoked", "expired"].includes(latest.status)) setUncertain(false);
      setCurrent({ record, handoff: latest, claimKnown: Boolean(snapshot), publishing: onboarding?.effects.find(effect => effect.effect === "publish")?.verified ?? null });
      setError(snapshot ? "" : "Owner claim status could not be read. Preparing another claim stays unavailable until a current read succeeds.");
    } catch (cause) {
      if (active()) { setCurrent(null); setError(cause instanceof z.ZodError || cause instanceof SyntaxError ? "The saved handoff returned incomplete information. Refresh its current status." : cause instanceof Error ? cause.message : "The handoff could not be read."); }
    } finally { if (active()) setReading(false); }
  }, [workId, suppliedRecord]);

  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal, true);
    return () => controller.abort();
  }, [read]);

  const record = current?.record;
  const candidate = record?.candidate;
  const handoff = current?.handoff;
  const claimed = handoff?.status === "accepted";
  const pending = handoff?.status === "pending" && Date.parse(handoff.expiresAt) > Date.now();
  const published = record?.status === "published";
  const sourceLive = published && record.readBack === "verified" && Boolean(record.publishedUrl);
  const reviewLink = link?.action === "share" && link.candidateHash === candidate?.contentHash && Date.parse(link.expiresAt) > Date.now() ? link : null;
  const claimLink = link?.action === "handoff" && link.handoffId === handoff?.id && pending ? link : null;
  const visibleLink = claimed ? null : record?.approved ? claimLink : reviewLink;
  const readiness = current?.publishing === true ? "Agency publishing verification is recorded. The current business approval and publication authority still apply."
    : current?.publishing === false ? "Agency publishing is not verified. Drafting, private review and ownership acceptance can continue."
    : "Agency publishing verification could not be confirmed. Outside changes stay gated.";

  async function makeLink(action: "share" | "handoff") {
    if (inFlight.current || readOnly || reading || !candidate || !email.trim() || (action === "handoff" && (!current?.claimKnown || uncertain || pending || claimed || published))) return;
    inFlight.current = true;
    setBusy(true); setError(""); setCopied(false);
    let responseConfirmed = false;
    try {
      const response = await fetch(`/api/websites/${encodeURIComponent(workId)}/${action}`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: email.trim(), ...(action === "share" ? { expiresInHours: 72 } : {}) }),
      });
      // A structured refusal is distinct from a response lost after a persisted handoff.
      responseConfirmed = response.status >= 400 && response.status < 500;
      const value = await json(response);
      const issued = action === "share" ? reviewLinkSchema.parse(value) : claimLinkSchema.parse(value);
      const recipient = action === "share" ? reviewLinkSchema.parse(issued).recipientEmail : claimLinkSchema.parse(issued).handoff.recipientEmail;
      if (recipient.toLowerCase() !== email.trim().toLowerCase()) throw new Error("The private link recipient could not be confirmed.");
      let href: string, expiresAt: string, handoffId: string | undefined;
      if (action === "share") {
        const review = reviewLinkSchema.parse(issued);
        const url = new URL(review.previewHref, window.location.origin);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/websites/shared/") || url.hash || url.search) throw new Error("The private review address could not be confirmed.");
        const token = url.pathname.slice("/api/websites/shared/".length);
        const payload = token.split(".")[0];
        if (!payload || token.split(".").length !== 2) throw new Error("The private review identity could not be confirmed.");
        const identity = reviewIdentitySchema.parse(JSON.parse(window.atob(payload.replace(/-/g, "+").replace(/_/g, "/"))));
        if (identity.workId !== workId || identity.workspaceId !== record?.workspaceId || identity.revision !== candidate.revision || identity.contentHash !== candidate.contentHash || identity.recipientEmail.toLowerCase() !== recipient.toLowerCase() || identity.expiresAt !== Date.parse(review.expiresAt)) throw new Error("The draft changed before its review link was created. Refresh handoff and create a new review link.");
        href = url.toString(); expiresAt = review.expiresAt;
      } else {
        const claim = claimLinkSchema.parse(issued);
        if (claim.handoff.sourceWorkId !== workId || claim.handoff.status !== "pending") throw new Error("The owner claim belongs to a different handoff.");
        href = new URL(`/workspace#handoff=${encodeURIComponent(claim.token)}`, window.location.origin).toString();
        expiresAt = claim.handoff.expiresAt; handoffId = claim.handoff.id;
        if (mounted.current) setCurrent(value => value ? { ...value, handoff: claim.handoff } : value);
      }
      if (Date.parse(expiresAt) <= Date.now()) throw new Error("The private link has already expired.");
      responseConfirmed = true;
      if (mounted.current) setLink({ action, href, expiresAt, recipientEmail: recipient, candidateHash: candidate.contentHash, handoffId });
    } catch (cause) {
      if (mounted.current) {
        if (action === "handoff" && !responseConfirmed) setUncertain(true);
        setError(action === "handoff" && !responseConfirmed ? "Outcome not confirmed. Read current handoff status before preparing another owner claim. A link may already exist; no message was sent." : cause instanceof z.ZodError || cause instanceof SyntaxError ? "The private link identity could not be confirmed. Refresh handoff before continuing." : cause instanceof Error ? cause.message : "The private link could not be created.");
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function copy(value: PrivateLink) {
    if (Date.parse(value.expiresAt) <= Date.now()) { setLink(null); setError("This private link expired. Read current handoff status and prepare a fresh link."); return; }
    try { await navigator.clipboard.writeText(value.href); if (mounted.current) setCopied(true); }
    catch { if (mounted.current) setError("Copy did not work here. Select the private link below and copy it."); }
  }

  const needsRead = uncertain || !current?.claimKnown;
  const action: "share" | "handoff" = record?.approved ? "handoff" : "share";
  const needsEmail = Boolean(candidate && !published && !claimed && !pending && !visibleLink && !(action === "handoff" && needsRead));
  const status = sourceLive ? "Source website live · client launch unconfirmed" : published ? "Published · outcome not fully verified" : claimed ? "Owner accepted the handoff" : pending ? "Waiting for the owner to accept" : !candidate ? "Draft not ready" : record?.approved ? "Review approved · prepare owner claim" : "Draft ready for owner review";
  const detail = sourceLive ? "The source website has a verified read-back. This does not confirm the owner’s business copy is live. Ownership and publishing verification remain separate records."
    : published ? "Publication was recorded, but live read-back is not confirmed. Do not treat it as a completed launch."
    : claimed ? "The owner received a copy in their chosen business. They review and make that copy live there; this source does not prove the business copy is live."
    : pending ? `The claim is addressed to ${handoff.recipientEmail}. Preparing or copying its link does not record acceptance.`
    : !candidate ? "Finish the private website draft before sending it for review."
    : record?.approved ? "Approval is recorded for the current draft. Prepare a recipient-bound claim; the owner must sign in and accept it."
    : "Create a private link for the owner to inspect this exact draft. Only a saved approval completes review.";
  const nextAction = reading ? <StPill disabled busy>Reading handoff status</StPill>
    : sourceLive ? <StTextButton onClick={() => void read()}>Check current status</StTextButton>
    : !candidate && current ? <StPillLink href={`/workspace?workspaceId=${encodeURIComponent(current.record.workspaceId)}&work=${encodeURIComponent(workId)}`}>Open website draft</StPillLink>
    : published || claimed || !current || needsRead && action === "handoff" ? <StPill variant="soft" disabled={busy} onClick={() => void read()}>Read current handoff status</StPill>
    : visibleLink ? <StPill disabled={busy || readOnly} onClick={() => void copy(visibleLink)}>{copied ? "Copied · send it yourself" : visibleLink.action === "share" ? "Copy private review link" : "Copy owner claim link"}</StPill>
    : pending ? <StPill variant="soft" onClick={() => void read()}>Check owner acceptance</StPill>
    : <StPill type="submit" disabled={readOnly || busy || !email.trim()} busy={busy}>{action === "share" ? "Create private review link" : "Prepare owner claim link"}</StPill>;

  return <div className="mt-8">
    {!current && reading ? <StSkeleton label="Reading first client handoff" /> : <form onSubmit={event => { event.preventDefault(); void makeLink(action); }}>
      <FirstClientHandoff status={current ? status : "Handoff status unavailable"} detail={current ? detail : "A current saved read is required before continuing."}
        draft={candidate ? "done" : "unverified"} review={record?.approved ? "done" : candidate ? "active" : "pending"}
        claim={claimed ? "done" : pending ? "active" : current?.claimKnown ? "pending" : "unverified"}
        live={published || claimed ? "unverified" : "pending"} readiness={readiness}
        action={<>{needsEmail ? <div className="mb-4"><TextInput type="email" label="Owner's email" value={email} onChange={event => setEmail(event.target.value)} disabled={readOnly || busy} maxLength={254} required /></div> : null}{nextAction}</>} />
    </form>}
    {readOnly ? <StNotice>You have read-only access. An authorized agency member prepares private links.</StNotice> : null}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    {visibleLink ? <StSurface label={visibleLink.action === "share" ? "Private review link" : "Owner claim link"}>
      <TextInput label="Copy this private link" value={visibleLink.href} readOnly onFocus={event => event.currentTarget.select()} />
      <p className="mt-2 text-sm leading-6 text-gray-muted">For {visibleLink.recipientEmail}. Expires {new Date(visibleLink.expiresAt).toLocaleString()}. No message was sent. The recipient signs in with this address.</p>
    </StSurface> : null}
    {current ? <div className="mt-4 flex flex-wrap gap-4">
      <StTextButton disabled={reading || busy} onClick={() => void read()}>Refresh handoff</StTextButton>
      <StTextButton href={`/workspace/agency/start?workspaceId=${encodeURIComponent(current.record.workspaceId)}`}>Publishing verification</StTextButton>
      {pending && !claimLink ? <StTextButton href={`/workspace/invitations?workspaceId=${encodeURIComponent(current.record.workspaceId)}`}>Manage existing owner claim</StTextButton> : null}
    </div> : null}
    <p className="mt-4 text-sm leading-6 text-gray-muted">Private review links expire after 72 hours. Owner claims have their own deadline. Nothing is emailed automatically.</p>
  </div>;
}
