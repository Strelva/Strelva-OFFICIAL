"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaAnswers, XaButton, XaButtonLink, XaEntry, XaEntryCaption, XaEntryStack, XaHeadline, XaInitial, XaPebbleScene, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "./agency-door.module.css";
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
export function OwnerClaimPresentation({ preview, accepted, loading, submitting, error, target, onAccept, mode }: {
  preview: OwnerClaimPreview | null; accepted: OwnerClaimAccepted | null; loading: boolean; submitting: boolean; error: string; target: string; onAccept: () => void; mode?: "light" | "dark";
}) {
  const expires = preview ? claimDate(preview.expiresAt) : "";
  const errorLine = error ? <p role="alert" className={styles.error}>{error}</p> : null;
  if (loading) return <ClaimEntry mode={mode}><div aria-busy="true"><StSkeleton label="Checking your link" /><StSkeleton width="70%" /></div></ClaimEntry>;
  if (accepted) return <ClaimOwned mode={mode} workspaceId={accepted.workspaceId} workspaceName={accepted.workspaceName} agencyName={preview?.agencyName ?? null}
    lead={accepted.alreadyAccepted ? "You already claimed it with this link." : `Check the details ${preview?.agencyName ?? "your agency"} added, and confirm what’s right.`} />;
  if (!preview) return <ClaimBroken mode={mode}>{errorLine}</ClaimBroken>;
  if (preview.status !== "pending") return <ClaimClosed preview={preview} status={preview.status} mode={mode}>{errorLine}</ClaimClosed>;
  return <ClaimEntry mode={mode} agencyName={preview.agencyName} businessName={preview.workspaceName}
    footnote={<>The link alone grants nothing. Only {preview.recipientEmail} can accept it.</>}>
    <XaEntryStack>
      <ClaimSetUpBy agencyName={preview.agencyName} />
      <XaHeadline quiet="Claim it to own the workspace and its data.">{preview.workspaceName} is ready for its owner.</XaHeadline>
      <XaAnswers labelWidth={124} rows={[
        ["Your site", "Keeps running whether or not you sign in."],
        [preview.agencyName, "Works through access you can end at any time."],
        ["This link", <>For {preview.recipientEmail}, until {expires}.</>],
      ]} />
      <div className={styles.claimActions}>
        <XaButton variant="primary" size="lg" block busy={submitting} onClick={onAccept}>Become the owner</XaButton>
        <p className={styles.sentence}>Sign in with {preview.recipientEmail} to accept. <XaTextLink href={`/sign-in?next=${encodeURIComponent(target)}`}>Sign in</XaTextLink> · <XaTextLink href={`/sign-up?next=${encodeURIComponent(target)}`}>Create an account</XaTextLink></p>
      </div>
      {errorLine}
    </XaEntryStack>
  </ClaimEntry>;
}

function claimDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/** The claim's entry frame (XA · C1, C2): the business keeps running on the right while the owner decides. */
function ClaimEntry({ children, agencyName, businessName, footnote, mode, aside, corner }: { children: ReactNode; agencyName?: string; businessName?: string; footnote?: ReactNode; mode?: "light" | "dark"; aside?: ReactNode; corner?: ReactNode }) {
  return <XaEntry mode={mode} corner={corner} footnote={footnote ?? (agencyName ? `Runs on Strelva. Same account as strelva.com.` : undefined)}
    aside={aside ?? (businessName ? <>
      <XaPebbleScene pose="resting" size={360} bare label={`Pebble keeping ${businessName} running`} />
      <XaEntryCaption title={`${businessName} keeps running.`}>Pebble keeps it going while you decide. Nothing changes until you say so.</XaEntryCaption>
    </> : undefined)}>
    {children}
  </XaEntry>;
}

function ClaimSetUpBy({ agencyName }: { agencyName: string }) {
  return <p className={styles.setUpBy}><XaInitial name={agencyName} size={26} /><span>{agencyName} set this up for you</span></p>;
}

/** XA · C2: the owner owns it. One way in; Pebble waves. */
export function ClaimOwned({ workspaceId, workspaceName, agencyName, lead, mode, children }: { workspaceId: string; workspaceName: string; agencyName: string | null; lead: string; mode?: "light" | "dark"; children?: ReactNode }) {
  const agency = agencyName ?? "Your agency";
  return <ClaimEntry mode={mode} footnote="Runs on Strelva. Same account as strelva.com." aside={<>
    <XaPebbleScene pose="waving" size={360} bare label="Pebble waving hello" />
    <XaEntryCaption title={`Welcome to ${workspaceName}.`}>Your site keeps running. Nothing changes until you say so.</XaEntryCaption>
  </>}>
    <XaEntryStack>
      <p className="sr-only" role="status">{workspaceName} is yours. You’re the owner.</p>
      <XaHeadline quiet={`${agency}’s changes come to you first.`}>You own {workspaceName}.</XaHeadline>
      <XaAnswers labelWidth={124} rows={[
        ["You decide", <>What goes live, and who works on {workspaceName}.</>],
        [agency, "Prepares changes. You can end their access at any time."],
        ["Your details", lead],
      ]} />
      {children}
      <XaButtonLink variant="primary" size="lg" block href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Open your business</XaButtonLink>
    </XaEntryStack>
  </ClaimEntry>;
}

function ClaimClosed({ preview, status, mode, children }: { preview: OwnerClaimPreview; status: OwnerClaimPreview["status"]; mode?: "light" | "dark"; children?: ReactNode }) {
  const copy = status === "revoked" ? { title: "This link was replaced.", quiet: `${preview.agencyName} replaced this link with a newer one. Use the latest link they sent.` }
    : status === "expired" ? { title: "This link expired.", quiet: `This link expired. Ask ${preview.agencyName} for a new one.` }
      : { title: `${preview.workspaceName} is already claimed.`, quiet: "This business has already been claimed with this link." };
  return <ClaimEntry mode={mode} businessName={preview.workspaceName}>
    <XaEntryStack><ClaimSetUpBy agencyName={preview.agencyName} /><XaHeadline quiet={copy.quiet}>{copy.title}</XaHeadline>{children}</XaEntryStack>
  </ClaimEntry>;
}

function ClaimBroken({ mode, children }: { mode?: "light" | "dark"; children?: ReactNode }) {
  return <ClaimEntry mode={mode} aside={<><XaPebbleScene pose="fixing" size={320} bare label="Pebble checking the link" /><XaEntryCaption title="Nothing was opened or changed.">A link that doesn’t work grants nothing.</XaEntryCaption></>}>
    <XaEntryStack><XaHeadline quiet="It may be mistyped, or replaced by a newer one. Ask whoever sent it for the latest link.">This link doesn’t work.</XaHeadline>{children}</XaEntryStack>
  </ClaimEntry>;
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
export function OwnerClaimReviewPresentation({ preview, load, choices, accepted, submitting, error, target, onChange, onAccept, navigate, mode }: {
  preview: OwnerClaimPreview | null; load: ReviewLoad; choices: ClaimReviewChoices | null; accepted: ClaimReviewAccepted | null;
  submitting: boolean; error: string; target: string; onChange: (next: ClaimReviewChoices) => void; onAccept: () => void; navigate?: (url: string) => void; mode?: "light" | "dark";
}) {
  const alerts = <>
    {load.kind === "error" ? <p role="alert" className={styles.error}>{load.message}</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </>;
  const agencyName = preview?.agencyName ?? (load.kind === "ready" ? load.review.agencyName : null);
  if (accepted || (load.kind === "ready" && load.review.status === "accepted")) {
    const owned = accepted ?? (load.kind === "ready" ? { workspaceId: load.review.workspaceId, workspaceName: load.review.workspaceName, alreadyAccepted: true } : null)!;
    return <ClaimOwned mode={mode} workspaceId={owned.workspaceId} workspaceName={owned.workspaceName} agencyName={agencyName}
      lead={owned.alreadyAccepted ? "You already claimed it with this link." : "Your choices are saved."}>
      <ClaimNextSteps workspaceId={owned.workspaceId} workspaceName={owned.workspaceName} returnTo={target} alreadyAccepted={owned.alreadyAccepted} navigate={navigate} />
      {alerts}
    </ClaimOwned>;
  }
  if (load.kind === "ready" && load.review.status === "pending" && choices) return <XaEntry mode={mode} width="wide" footnote="Runs on Strelva. Same account as strelva.com.">
    <div className={styles.reviewColumn}><ClaimReviewForm review={load.review} choices={choices} onChange={onChange} submitting={submitting} onAccept={onAccept} />{alerts}</div>
  </XaEntry>;
  if (load.kind === "loading") return <ClaimEntry mode={mode}><div aria-busy="true"><StSkeleton label="Checking your link" /><StSkeleton width="70%" /></div></ClaimEntry>;
  if (preview) {
    const status = load.kind === "ready" ? load.review.status : preview.status;
    if (status !== "pending") return <ClaimClosed preview={preview} status={status} mode={mode}>{alerts}</ClaimClosed>;
    return <ClaimEntry mode={mode} agencyName={preview.agencyName} businessName={preview.workspaceName} footnote="The link alone grants nothing and shows nothing private.">
      <XaEntryStack>
        <ClaimSetUpBy agencyName={preview.agencyName} />
        <XaHeadline quiet="Claim it to own the workspace and its data.">{preview.workspaceName} is ready for its owner.</XaHeadline>
        <XaAnswers labelWidth={124} rows={[
          ["Your site", "Keeps running whether or not you sign in."],
          ["Your details", `What ${preview.agencyName} found waits for you to confirm.`],
          [preview.agencyName, "Works with the access you choose."],
        ]} />
        <div className={styles.claimActions}>
          <XaButtonLink variant="primary" size="lg" block href={`/sign-up?next=${encodeURIComponent(target)}`}>Create an account</XaButtonLink>
          <XaButtonLink size="lg" block href={`/sign-in?next=${encodeURIComponent(target)}`}>Sign in</XaButtonLink>
          <p className={styles.sentence}>Sign in with {preview.recipientEmail} to see what they found on your website and what they prepared, and to choose what they may do.</p>
        </div>
        {alerts}
      </XaEntryStack>
    </ClaimEntry>;
  }
  return <ClaimBroken mode={mode}>{alerts}</ClaimBroken>;
}
