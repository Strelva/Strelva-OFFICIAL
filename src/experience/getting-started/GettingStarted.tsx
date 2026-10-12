"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { StEmpty, StHead, StLabel, StNotice, StPage, StPill, StRow, StRows, StSection, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { heldBriefKey, type FoundFact, type GettingStartedBusiness, type WebsiteReading } from "@/products/getting-started/contracts";

export interface GettingStartedLinks {
  home: string;
  details: string;
  agency: string;
  /** Null when Google isn't open for this business yet. */
  google: string | null;
  /** Null when keeping your site (connected sites) isn't open for this business yet. */
  connect: string | null;
  /** A request filed to the business's agency at setup. */
  request: string | null;
}

const noSubscription = () => () => undefined;

function errorText(body: unknown, fallback: string): string {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : fallback;
}

function sourceLabel(url: string): string {
  try { const parsed = new URL(url); return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`; }
  catch { return url; }
}

/**
 * Getting started: the first view of a new business. Its name, its website
 * when known, and the next steps, each using something the business already
 * has. Found facts from the website are shown with their source and join the
 * record only when the owner adds them.
 */
export function GettingStarted({ business, links }: { business: GettingStartedBusiness; links: GettingStartedLinks }) {
  const [website, setWebsite] = useState(business.website);
  const [revision, setRevision] = useState(business.revision);
  const storedBrief = useSyncExternalStore(noSubscription, () => {
    try { return window.sessionStorage.getItem(heldBriefKey(business.workspaceId))?.slice(0, 3000) || ""; }
    catch { return ""; /* Storage unavailable: nothing held here. */ }
  }, () => "");
  const [dismissed, setDismissed] = useState(false);
  const heldBrief = dismissed ? "" : storedBrief;

  return <StPage>
    <StHead crumb={{ label: "Business home", href: links.home }} title={business.name} meta={website ? <>Website <a className="underline underline-offset-4" href={website} target="_blank" rel="noopener noreferrer">{sourceLabel(website)}</a></> : "No website on your business yet."} />
    {links.request ? <StNotice action={<StTextButton href={links.request}>Open request</StTextButton>}>Your request went to your agency. Nothing is agreed until they reply with scope and timing.</StNotice> : null}
    {!links.request && heldBrief ? <StSection title="Your request is waiting" meta="Not sent">
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-warm-black">{heldBrief}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-gray-muted">No agency works with your business yet, so this wasn&rsquo;t sent or saved to your business. It stays in this browser until you bring one in.</p>
      <div className="mt-3 flex flex-wrap gap-4"><StTextButton href={links.agency}>Bring in an agency</StTextButton><StTextButton onClick={() => { try { window.sessionStorage.removeItem(heldBriefKey(business.workspaceId)); } catch { /* Nothing stored. */ } setDismissed(true); }}>Dismiss</StTextButton></div>
    </StSection> : null}
    <StSection title="Start from what you already have" meta="Nothing has to move">
      <UseCurrentWebsite business={business} website={website} revision={revision} detailsHref={links.details} onSaved={(next, savedWebsite) => { setRevision(next); if (savedWebsite) setWebsite(savedWebsite); }} />
      <StRows label="Next steps">
        <StRow kind="Google" title="Connect Google" detail={links.google ? "Bring in your Google listing: hours, phone and reviews." : "Not open for your business yet."} href={links.google ?? undefined} />
        <StRow kind="Website" title="Keep your site" detail={links.connect ? "Keep the site you have. Add two lines and Strelva works beside it." : "Not open for your business yet."} href={links.connect ?? undefined} />
        {website ? <StRow kind="Check" title="See how AI answers about you" detail="The free check, already filled in with your business and website." href={`/ai-visibility?${new URLSearchParams({ business: business.name, url: website })}`} /> : null}
        <StRow kind="Help" title="Bring in an agency" detail="Choose an agency to do the work. You stay the owner." href={links.agency} />
      </StRows>
    </StSection>
    <div><StTextButton href={links.home}>Go to your business home</StTextButton></div>
  </StPage>;
}

function UseCurrentWebsite({ business, website, revision, detailsHref, onSaved }: { business: GettingStartedBusiness; website: string | null; revision: number; detailsHref: string; onSaved: (revision: number, website: string | null) => void }) {
  const transport = useWorkspaceRequest();
  const [url, setUrl] = useState(website ?? "");
  const [reading, setReading] = useState<WebsiteReading | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [useAsWebsite, setUseAsWebsite] = useState(!website);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string[] | null>(null);
  const inFlight = useRef(false);
  const resultsId = useId();
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Controls are disabled while a request runs; once they're enabled again, put focus back where the person can act.
  const pendingFocus = useRef<{ current: HTMLElement | null } | null>(null);
  const refocus = (target: { current: HTMLElement | null }) => { pendingFocus.current = target; };
  useEffect(() => { if (reading) resultsRef.current?.focus(); }, [reading]);
  useEffect(() => { if (busy === null && pendingFocus.current) { pendingFocus.current.current?.focus(); pendingFocus.current = null; } }, [busy]);

  async function post(body: unknown) {
    const response = await transport("/api/workspace/getting-started", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const parsed: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorText(parsed, "That didn't go through. Try again."));
    return parsed;
  }

  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!url.trim()) { setError("Enter your website address, like yourbusiness.com."); return; }
    inFlight.current = true; setBusy("read"); setError(""); setSaved(null); setReading(null);
    try {
      const body = await post({ action: "read_website", workspaceId: business.workspaceId, url: url.trim() }) as { reading?: WebsiteReading };
      if (!body.reading) throw new Error("The reading couldn't be confirmed. Try again.");
      setReading(body.reading);
      setChosen(new Set(body.reading.facts.filter(fact => !fact.current).map(fact => fact.id)));
      setUseAsWebsite(!website);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't read this website."); refocus(urlRef); }
    finally { inFlight.current = false; setBusy(null); }
  }

  async function confirm() {
    if (!reading || inFlight.current) return;
    const facts = reading.facts.filter(fact => chosen.has(fact.id));
    inFlight.current = true; setBusy("save"); setError("");
    try {
      const body = await post({ action: "confirm_found_facts", workspaceId: business.workspaceId, revision: reading.revision, ...(useAsWebsite ? { website: reading.url } : {}), facts: facts.map(fact => ({ key: fact.key, value: fact.value })) }) as { saved?: string[]; revision?: number };
      setSaved(body.saved ?? []);
      onSaved(typeof body.revision === "number" ? body.revision : revision, useAsWebsite ? reading.url : null);
      setReading(null);
      refocus(urlRef);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your details couldn't be added. Nothing changed."); refocus(confirmRef); }
    finally { inFlight.current = false; setBusy(null); }
  }

  const toggle = (fact: FoundFact) => setChosen(current => { const next = new Set(current); if (next.has(fact.id)) next.delete(fact.id); else next.add(fact.id); return next; });
  const count = chosen.size + (useAsWebsite && reading ? 1 : 0);

  return <div className="mb-6 flex flex-col gap-4">
    <StLabel as="h3">Use my current website</StLabel>
    <p className="text-[14px] leading-relaxed text-gray-muted">We read your public pages and show what we find, with where we found it. Nothing is added to your business until you choose it. Your site doesn&rsquo;t change.</p>
    {!business.canConfirm ? <StNotice>Only the business owner can add details found on the website.</StNotice> : <>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event => void read(event)}>
        <div className="flex-1"><StTextField ref={urlRef} label="Your website" type="url" inputMode="url" autoComplete="url" spellCheck={false} autoCapitalize="none" placeholder="yourbusiness.com" value={url} maxLength={2048} disabled={busy !== null} onChange={event => { setUrl(event.target.value); setError(""); }} /></div>
        <StPill type="submit" variant={reading ? "soft" : "primary"} busy={busy === "read"} disabled={busy === "save"}>{reading ? "Read again" : "Read my website"}</StPill>
      </form>
      {busy === "read" ? <p role="status" className="text-[13px] text-gray-muted">Reading up to five pages. This can take a few seconds…</p> : null}
      {error ? <StNotice tone="critical">{error}</StNotice> : null}
      <div role="status">{saved ? <StNotice action={<StTextButton href={detailsHref}>Review business details</StTextButton>}>{saved.length ? "Added to your business. You can change any of it in Business details." : "Nothing new to add. Your business already has these details."}</StNotice> : null}</div>
      {reading ? <div className="flex flex-col gap-3" aria-labelledby={resultsId}>
        <h4 id={resultsId} ref={resultsRef} tabIndex={-1} className="text-[15px] font-medium text-warm-black outline-none">Found on {sourceLabel(reading.url)}</h4>
        {reading.facts.length === 0 ? <StEmpty action={<StTextButton href={detailsHref}>Add details yourself</StTextButton>}>We read {reading.pagesRead === 1 ? "1 page" : `${reading.pagesRead} pages`} but found no details we could add.</StEmpty>
          : <ul className="flex flex-col" aria-label="Found facts">{reading.facts.map(fact => <li key={fact.id} className="border-b border-gray-border py-3 last:border-b-0">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 size-4 shrink-0 accent-warm-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" checked={chosen.has(fact.id)} disabled={busy !== null} onChange={() => toggle(fact)} />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] text-gray-muted">{fact.label}</span>
                <span className="break-words text-[14px] text-warm-black">{fact.display}</span>
                {fact.current ? <span className="text-[12px] text-gray-muted">Replaces {fact.current}</span> : null}
                {fact.source ? <span className="break-words text-[12px] text-gray-muted">From <a className="underline underline-offset-2" href={fact.source.url} target="_blank" rel="noopener noreferrer">{sourceLabel(fact.source.url)}</a>: &ldquo;{fact.source.quote}&rdquo;</span> : <span className="text-[12px] text-gray-muted">Source not recorded</span>}
              </span>
            </label>
          </li>)}</ul>}
        {!website ? <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-warm-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" checked={useAsWebsite} disabled={busy !== null} onChange={event => setUseAsWebsite(event.target.checked)} />
          <span className="text-[14px] text-warm-black">Use {sourceLabel(reading.url)} as my business&rsquo;s website</span>
        </label> : null}
        <div><StPill ref={confirmRef} busy={busy === "save"} disabled={busy === "read" || count === 0} onClick={() => void confirm()}>{count ? `Add ${count === 1 ? "1 detail" : `${count} details`} to my business` : "Choose details to add"}</StPill></div>
      </div> : null}
    </>}
  </div>;
}
