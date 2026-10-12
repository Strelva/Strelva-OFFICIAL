"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StCopy, StEntry, StHead, StMono, StNotice, StPill, StPillLink, StRow, StRows, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import type { ClaimReview, ClaimReviewAccepted, OwnerClaimAccepted, OwnerClaimPreview } from "@/products/agency-clients/contracts";
import { ClaimNextSteps, ClaimReviewForm, claimReviewInput, initialClaimReviewChoices, type ClaimReviewChoices } from "./OwnerClaimReview";

/**
 * The owner's side of an agency's claim link (#259): who set the business up,
 * which address the link is for, and one action. Accepting makes the signed-in
 * account the owner; the agency keeps working through the seat the owner can end.
 */
export function OwnerClaimAcceptance({ token, review = false }: { token: string; review?: boolean }) {
  if (review) return <OwnerClaimWithReview token={token} />;
  return <OwnerClaimPlain token={token} />;
}

function OwnerClaimPlain({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<OwnerClaimPreview | null>(null);
  const [accepted, setAccepted] = useState<OwnerClaimAccepted | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const target = `/workspace/claim/${token}`;

  useEffect(() => {
    let current = true;
    fetch(`/api/workspace-claims/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { claim?: OwnerClaimPreview; error?: string };
        if (!response.ok || !body.claim) throw new Error(body.error || "This link is missing or no longer works.");
        if (current) setPreview(body.claim);
      })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "This link is missing or no longer works."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token]);

  async function accept() {
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/workspace-claims/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json().catch(() => ({})) as { accepted?: OwnerClaimAccepted; error?: string };
      if (response.status === 401) { router.push(`/sign-in?next=${encodeURIComponent(target)}`); return; }
      if (!response.ok || !body.accepted) throw new Error(body.error || "The business couldn’t be claimed.");
      setAccepted(body.accepted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The business couldn’t be claimed.");
    } finally {
      setSubmitting(false);
    }
  }

  return <OwnerClaimPresentation preview={preview} accepted={accepted} loading={loading} submitting={submitting} error={error} target={target} onAccept={() => void accept()} />;
}

/** Presentation is shared with isolated, fictional previews; authority stays in the claim API. */
export function OwnerClaimPresentation({ preview, accepted, loading, submitting, error, target, onAccept }: {
  preview: OwnerClaimPreview | null; accepted: OwnerClaimAccepted | null; loading: boolean; submitting: boolean; error: string; target: string; onAccept: () => void;
}) {
  const expires = preview ? new Date(preview.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : "";
  return <StEntry brand={preview?.agencyName || "Agency identity unavailable"}>
    {loading ? <StSkeleton label="Checking your link" /> : accepted ? <>
      <StHead title={`${accepted.workspaceName} is yours`} />
      <StState kind="live">You’re the owner</StState>
      <StCopy>{accepted.alreadyAccepted ? "You already claimed it with this link." : "Check the details your agency added, and confirm what’s right."} You decide what goes live, and you can end your agency’s access at any time.</StCopy>
      <StPillLink href={`/workspace?workspaceId=${encodeURIComponent(accepted.workspaceId)}`}>Open your business</StPillLink>
    </> : preview ? <>
      <StHead title={`Take ownership of ${preview.workspaceName}`} meta={`From ${preview.agencyName}`} />
      <StCopy>{preview.agencyName} set up {preview.workspaceName} on Strelva. As the owner you confirm its details, approve what goes live, and choose who works on it.</StCopy>
      <StRows><StRow kind="For" title={<StMono tone="text">{preview.recipientEmail}</StMono>} /><StRow kind="Works until" title={<StMono tone="text">{expires}</StMono>} end={<StState kind={preview.status === "pending" ? "need" : "draft"}>{preview.status === "pending" ? "Needs you" : preview.status === "revoked" ? "Replaced" : preview.status === "expired" ? "Expired" : "Claimed"}</StState>} /></StRows>
      {preview.status === "pending" ? <>
        <StCopy muted>Sign in with {preview.recipientEmail} to accept. The link alone grants nothing.</StCopy>
        <StPill block busy={submitting} onClick={onAccept}>{submitting ? "Claiming…" : "Become the owner"}</StPill>
        <StTextButton href={`/sign-in?next=${encodeURIComponent(target)}`} tone="accent">Sign in</StTextButton>
        <StTextButton href={`/sign-up?next=${encodeURIComponent(target)}`}>Create an account</StTextButton>
      </> : <StNotice>{preview.status === "revoked" ? `${preview.agencyName} replaced this link with a newer one. Use the latest link they sent.` : preview.status === "expired" ? `This link expired. Ask ${preview.agencyName} for a new one.` : "This business has already been claimed with this link."}</StNotice>}
    </> : <StHead title="This link doesn’t work" />}
    {preview ? <p className="text-sm text-gray-muted">Runs on Strelva. Same account as strelva.com.</p> : null}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
  </StEntry>;
}

type ReviewLoad = { kind: "loading" } | { kind: "signed_out" } | { kind: "ready"; review: ClaimReview } | { kind: "error"; message: string };

/**
 * Behind STRELVA_CLAIM_REVIEW_RELEASE: the signed-in recipient sees what the
 * agency found (with sources) and prepared, decides each found fact and each
 * area, claims, then may connect Google and a calendar or skip both.
 */
function OwnerClaimWithReview({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<OwnerClaimPreview | null>(null);
  const [load, setLoad] = useState<ReviewLoad>({ kind: "loading" });
  const [choices, setChoices] = useState<ClaimReviewChoices | null>(null);
  const [accepted, setAccepted] = useState<ClaimReviewAccepted | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const target = `/workspace/claim/${token}`;
  const base = `/api/workspace-claims/${encodeURIComponent(token)}`;

  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const response = await fetch(base, { cache: "no-store" });
        const body = await response.json().catch(() => ({})) as { claim?: OwnerClaimPreview; error?: string };
        if (!response.ok || !body.claim) throw new Error(body.error || "This link is missing or no longer works.");
        if (!current) return;
        setPreview(body.claim);
        const reviewed = await fetch(`${base}/review`, { cache: "no-store" });
        const result = await reviewed.json().catch(() => ({})) as { review?: ClaimReview; error?: string };
        if (!current) return;
        if (reviewed.status === 401) { setLoad({ kind: "signed_out" }); return; }
        if (!reviewed.ok || !result.review) { setLoad({ kind: "error", message: result.error || "This link couldn’t be checked. Try again." }); return; }
        setLoad({ kind: "ready", review: result.review });
        setChoices(initialClaimReviewChoices(result.review));
      } catch (cause) {
        if (current) { setLoad({ kind: "error", message: cause instanceof Error ? cause.message : "This link is missing or no longer works." }); }
      }
    })();
    return () => { current = false; };
  }, [base]);

  async function accept() {
    if (load.kind !== "ready" || !choices) return;
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`${base}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(claimReviewInput(load.review, choices)) });
      const body = await response.json().catch(() => ({})) as { accepted?: ClaimReviewAccepted; error?: string };
      if (response.status === 401) { router.push(`/sign-in?next=${encodeURIComponent(target)}`); return; }
      if (!response.ok || !body.accepted) throw new Error(body.error || "The business couldn’t be claimed.");
      setAccepted(body.accepted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The business couldn’t be claimed.");
    } finally { setSubmitting(false); }
  }

  return <OwnerClaimReviewPresentation preview={preview} load={load} choices={choices} accepted={accepted} submitting={submitting} error={error}
    target={target} onChange={setChoices} onAccept={() => void accept()} />;
}

/** Shared with isolated, fictional previews; authority stays in the claim review API. */
export function OwnerClaimReviewPresentation({ preview, load, choices, accepted, submitting, error, target, onChange, onAccept, navigate }: {
  preview: OwnerClaimPreview | null; load: ReviewLoad; choices: ClaimReviewChoices | null; accepted: ClaimReviewAccepted | null;
  submitting: boolean; error: string; target: string; onChange: (next: ClaimReviewChoices) => void; onAccept: () => void; navigate?: (url: string) => void;
}) {
  const brand = preview?.agencyName || (load.kind === "ready" ? load.review.agencyName : "Agency identity unavailable");
  let body;
  if (accepted) {
    body = <ClaimNextSteps workspaceId={accepted.workspaceId} workspaceName={accepted.workspaceName} returnTo={target} alreadyAccepted={accepted.alreadyAccepted} navigate={navigate} />;
  } else if (load.kind === "ready" && load.review.status === "accepted") {
    body = <ClaimNextSteps workspaceId={load.review.workspaceId} workspaceName={load.review.workspaceName} returnTo={target} alreadyAccepted navigate={navigate} />;
  } else if (load.kind === "ready" && load.review.status === "pending" && choices) {
    body = <ClaimReviewForm review={load.review} choices={choices} onChange={onChange} submitting={submitting} onAccept={onAccept} />;
  } else if (load.kind === "loading") {
    body = <StSkeleton label="Checking your link" />;
  } else if (preview) {
    const status = load.kind === "ready" ? load.review.status : preview.status;
    body = <>
      <StHead title={`Take ownership of ${preview.workspaceName}`} meta={`From ${preview.agencyName}`} />
      {status === "pending" ? <>
        <StCopy>{preview.agencyName} set up {preview.workspaceName} on Strelva. Sign in with {preview.recipientEmail} to see what they found on your website and what they prepared, and to choose what they may do.</StCopy>
        <StCopy muted>The link alone grants nothing and shows nothing private.</StCopy>
        <StPillLink href={`/sign-in?next=${encodeURIComponent(target)}`}>Sign in</StPillLink>
        <StTextButton href={`/sign-up?next=${encodeURIComponent(target)}`}>Create an account</StTextButton>
      </> : <StNotice>{status === "revoked" ? `${preview.agencyName} replaced this link with a newer one. Use the latest link they sent.` : status === "expired" ? `This link expired. Ask ${preview.agencyName} for a new one.` : "This business has already been claimed with this link."}</StNotice>}
    </>;
  } else {
    body = <StHead title="This link doesn’t work" />;
  }
  return <StEntry brand={brand} width="account">
    {body}
    {load.kind === "error" ? <StNotice tone="critical">{load.message}</StNotice> : null}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    <p className="text-sm text-gray-muted">Runs on Strelva. Same account as strelva.com.</p>
  </StEntry>;
}
