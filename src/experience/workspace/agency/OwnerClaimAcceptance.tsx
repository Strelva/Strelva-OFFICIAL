"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaAnswers, XaButton, XaButtonLink, XaWaiting, XaEntry, XaEntryCaption, XaEntryStack, XaHeadline, XaInitial, XaLabel, XaPebbleAvatar, XaPebbleScene, XaTextLink } from "@/components/ui/strelva/Xa";
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
    lead={accepted.alreadyAccepted ? "You already claimed it with this link." : `${preview?.agencyName ?? "Your agency"} added them from your site. Confirm what’s right in ${accepted.workspaceName}.`} />;
  if (!preview) return <ClaimBroken mode={mode}>{errorLine}</ClaimBroken>;
  if (preview.status !== "pending") return <ClaimClosed preview={preview} status={preview.status} mode={mode}>{errorLine}</ClaimClosed>;
  return <ClaimEntry mode={mode} agencyName={preview.agencyName} businessName={preview.workspaceName}
    footnote={<>The link alone grants nothing. Only {preview.recipientEmail} can accept it.</>}>
    <XaEntryStack>
      <ClaimSetUpBy agencyName={preview.agencyName} />
      <XaHeadline quiet="Claim it to own the business and its records.">{preview.workspaceName} is ready for its owner.</XaHeadline>
      <XaAnswers labelWidth={124} rows={[
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
function ClaimEntry({ children, agencyName, businessName, footnote, mode, aside, corner, asideOnPhone }: { children: ReactNode; agencyName?: string; businessName?: string; footnote?: ReactNode; mode?: "light" | "dark"; /** null: no panel at all. */ aside?: ReactNode; corner?: ReactNode; asideOnPhone?: "below" | "hidden" }) {
  // C1: the panel is where "keeps running" is said, once, with Pebble tending the site.
  // On a phone it drops; a small Pebble sits beside "set this up for you" instead.
  return <XaEntry mode={mode} corner={corner} asideOnPhone={asideOnPhone ?? (aside ? "below" : "hidden")} footnote={footnote ?? (agencyName ? `Runs on Strelva. Same account as strelva.com.` : undefined)}
    aside={aside === null ? undefined : aside ?? (businessName ? <>
      <XaPebbleScene pose="adds" size={360} bare label={`Pebble tending ${businessName}’s site`} />
      <XaEntryCaption title={`${businessName} keeps running.`}>Nothing on it changes until you say so.</XaEntryCaption>
    </> : undefined)}>
    {children}
  </XaEntry>;
}

function ClaimSetUpBy({ agencyName }: { agencyName: string }) {
  return <p className={styles.setUpBy}><XaInitial name={agencyName} size={26} /><span>{agencyName} set this up for you</span><span className={styles.phonePebble}><XaPebbleAvatar size={36} label="Pebble, keeping your site running" /></span></p>;
}

/**
 * XA · C2: the owner owns it. One way in. The panel is a true preview: the
 * first thing waiting in their business, as their composer will show it, when
 * the claim response says how many details wait. With nothing waiting there
 * is no panel; an idle Pebble would be decoration. The column says who
 * confirms the details and when, never the count the preview already shows.
 */
export function ClaimOwned({ workspaceId, workspaceName, agencyName, lead, agencyLine, waiting, mode, children }: { workspaceId: string; workspaceName: string; agencyName: string | null; lead: string | null; agencyLine?: string; waiting?: number | null; mode?: "light" | "dark"; children?: ReactNode }) {
  const agency = agencyName ?? "Your agency";
  const details = waiting === 1 ? "1 detail" : `${waiting} details`;
  // Said once: the preview shows how many wait; the row says who confirms them and when.
  const detailsRow = waiting ? `You confirm them on Home, the first time you open ${workspaceName}.` : lead;
  return <ClaimEntry mode={mode} footnote="Runs on Strelva. Same account as strelva.com." aside={waiting ? <div className={styles.seen}>
      <XaLabel>The first thing you’ll see</XaLabel>
      <div className={styles.seenComposer} inert aria-hidden="true">
        <XaWaiting item={{ kicker: <>Waits for you · from {agency}</>, title: `Confirm ${details} read from your site`, from: { name: agency, color: "#2f5236" }, action: null }} />
      </div>
    </div> : null}>
    <XaEntryStack>
      <p className="sr-only" role="status">{workspaceName} is yours. You’re the owner.</p>
      <XaHeadline quiet={`${agency}’s changes come to you first.`}>You own {workspaceName}.</XaHeadline>
      <XaAnswers labelWidth={124} rows={[
        ["You decide", <>What goes live, and who works on {workspaceName}.</>],
        [agency, agencyLine ?? "Prepares changes and asks you first. You can end their access at any time."],
        ...(detailsRow ? [["Your details", detailsRow] as const] : []),
      ]} />
      {children}
      <XaButtonLink variant="primary" size="lg" block href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Open {workspaceName}</XaButtonLink>
    </XaEntryStack>
  </ClaimEntry>;
}

/** What the agency may now do, from the areas the owner chose. */
function agencyLineFor(accepted: ClaimReviewAccepted | null): string | undefined {
  const areas = accepted?.areas;
  if (!areas) return undefined;
  const full = Object.entries(areas).filter(([, choice]) => choice === "full_control").map(([area]) => AREA_WORDS[area] ?? area);
  const prepare = Object.values(areas).some(choice => choice === "prepare");
  if (full.length && prepare) return `Runs ${joinWords(full)} once they accept. Prepares everything else and asks you first.`;
  if (full.length) return `Runs ${joinWords(full)} once they accept. You can end their access at any time.`;
  if (prepare) return "Prepares changes and asks you first. You can end their access at any time.";
  return "Has no access yet. You can give it any time.";
}
const AREA_WORDS: Record<string, string> = { website: "your website", inquiries: "inquiries", bookings: "bookings", google: "your Google listing", internal_tools: "internal tools" };
function joinWords(words: readonly string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** What waits in "Your details" after a claim, from the counts the claim returned. */
function detailsLead(accepted: ClaimReviewAccepted): string | null {
  if (accepted.alreadyAccepted) return "You already claimed it with this link.";
  const waiting = accepted.facts?.waiting;
  if (waiting === undefined) return null;
  if (waiting === 0) return "Everything found on your site is confirmed.";
  return `${waiting} ${waiting === 1 ? "waits" : "wait"} for you to confirm.`;
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
    const result = accepted ?? null;
    return <ClaimOwned mode={mode} workspaceId={owned.workspaceId} workspaceName={owned.workspaceName} agencyName={agencyName}
      lead={result ? detailsLead(result) : "You already claimed it with this link."} agencyLine={agencyLineFor(result)} waiting={result && !result.alreadyAccepted ? result.facts?.waiting ?? null : null}>
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
        <XaHeadline quiet="Claim it to own the business and its records.">{preview.workspaceName} is ready for its owner.</XaHeadline>
        <XaAnswers labelWidth={124} rows={[
          ["Your details", `What ${preview.agencyName} found waits for you to confirm.`],
          [preview.agencyName, "Works with the access you choose."],
        ]} />
        <div className={styles.claimActions}>
          <XaButtonLink variant="primary" size="lg" block href={`/sign-up?next=${encodeURIComponent(target)}`}>Create an account</XaButtonLink>
          <p className={styles.sentence}>Sign in with {preview.recipientEmail} to see what {preview.agencyName} found and prepared, and to choose what {preview.agencyName} may do. <XaTextLink href={`/sign-in?next=${encodeURIComponent(target)}`}>Sign in</XaTextLink></p>
        </div>
        {alerts}
      </XaEntryStack>
    </ClaimEntry>;
  }
  return <ClaimBroken mode={mode}>{alerts}</ClaimBroken>;
}
