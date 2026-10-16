"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  XaButton, XaButtonLink, XaChecklist, XaEntry, XaEntrySteps, XaField, XaHeadline, XaPage, XaPebbleAvatar, XaSays, XaStatus,
  XaSystemTile, XaTextLink, type XaChecklistItem, type XaEntryStage,
} from "@/components/ui/strelva/Xa";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { GETTING_STARTED_STEPS } from "@/experience/workspace/BusinessSetupPanel";
import { FOUND_FACT_SOURCE_LABELS } from "@/products/found-facts/contracts";
import { XA_PLACE_LABELS } from "@/platform/presentation/place-labels";
import type { FoundFact, GettingStartedBusiness, WebsiteReading } from "@/products/getting-started/contracts";
import styles from "./getting-started.module.css";

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
  /** The authorized saved check that started this business. */
  check?: string | null;
  /** The owner's first ask from B2, as saved, and where it can be seen. */
  ask?: { text: string; href: string } | null;
}

export type GettingStartedPhase = "site" | "check" | "next";
type Phase = GettingStartedPhase;

/** Where to open. Preview harnesses and deep links only; the server owns every fact shown. */
export interface GettingStartedStart {
  phase?: Phase;
  reading?: WebsiteReading;
  saved?: { added: number; later: number };
  /** Open mid-read (the request is the caller's). */
  readingNow?: boolean;
  /** Open on the moment a reading lands, before the facts (preview only). */
  landing?: WebsiteReading;
  error?: string;
}

function deviceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}

function errorText(body: unknown, fallback: string): string {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : fallback;
}

/** The address a person types: harbordental.com, never https://www. */
export function websiteHost(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

/** Owners see pages by name ("the Contact page"), never a path. */
export function sourcePageName(url: string): string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (!segment) return "Home page";
    const words = decodeURIComponent(segment).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
    return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)} page` : "Home page";
  } catch { return "Your website"; }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const USE_WEBSITE = "use-website";
/** The owner's Home, by the name the sidebar shows (one edit when Jacob settles Today or Home). */
const HOME = XA_PLACE_LABELS.today;
/** How long the page just read stays on the stage before the facts: long enough to read its title. */
const LANDING_MS = 1400;

/** New, addable facts from the site start ticked; anything that would replace a detail starts unticked. */
function defaultChosen(reading: WebsiteReading, website: string | null): Set<string> {
  return new Set([
    ...reading.facts.filter(fact => !fact.current && fact.confirmable && fact.sourceKind === "website_crawl").map(fact => fact.id),
    ...(website ? [] : [USE_WEBSITE]),
  ]);
}

/**
 * Getting started (XA · B3–B5): the owner's first minutes with one business.
 * Read the site they already have, tick what Strelva found, then pick what's
 * next. Found facts show where they came from and join the record only when
 * the owner adds them; anything left unticked waits on Home.
 */
export function GettingStarted({ business, links, account, mode, start }: { business: GettingStartedBusiness; links: GettingStartedLinks; account?: ReactNode; mode?: "light" | "dark"; start?: GettingStartedStart }) {
  const transport = useWorkspaceRequest();
  const [website, setWebsite] = useState(business.website);
  const [revision, setRevision] = useState(business.revision);
  const [phase, setPhase] = useState<Phase>(start?.phase ?? (!business.canConfirm ? "next" : business.waiting.length || start?.reading ? "check" : "site"));
  const [url, setUrl] = useState(business.website ? websiteHost(business.website) : "");
  const [reading, setReading] = useState<WebsiteReading | null>(start?.reading ?? null);
  // What waits for the owner, from any source; a reading replaces it with the latest list.
  const [facts, setFacts] = useState<FoundFact[]>(start?.reading?.facts ?? business.waiting);
  const [chosen, setChosen] = useState<Set<string>>(() => start?.reading ? defaultChosen(start.reading, business.website) : new Set());
  const [busy, setBusy] = useState<"read" | "save" | null>(start?.readingNow || start?.landing ? "read" : null);
  const [error, setError] = useState(start?.error ?? "");
  const [saved, setSaved] = useState<{ added: number; later: number } | null>(start?.saved ?? null);
  // The page just read, held on the stage for a moment before the facts (B3 to B4).
  const [landing, setLanding] = useState<WebsiteReading | null>(start?.landing ?? null);
  const inFlight = useRef(false);
  const headingId = useId();
  const urlRef = useRef<HTMLInputElement>(null);
  const moved = useRef(false);

  // A new step takes focus at its heading, so the next thing read is where the person is.
  useEffect(() => {
    if (!moved.current) return;
    document.getElementById(headingId)?.querySelector<HTMLElement>("[tabindex]")?.focus();
  }, [phase, headingId]);
  const go = (next: Phase) => { moved.current = true; setError(""); setPhase(next); };

  async function post(body: unknown) {
    const response = await transport("/api/workspace/getting-started", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const parsed: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorText(parsed, "That didn't go through. Try again."));
    return parsed;
  }

  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!url.trim()) { setError("Enter your website address, like yourbusiness.com."); urlRef.current?.focus(); return; }
    inFlight.current = true; setBusy("read"); setError(""); setSaved(null);
    try {
      const body = await post({ action: "read_website", workspaceId: business.workspaceId, url: url.trim() }) as { reading?: WebsiteReading };
      if (!body.reading) throw new Error("The reading couldn't be confirmed. Try again.");
      const done = body.reading;
      if (done.page) {
        // Show the page that was read (its own title and description) before asking about it.
        setLanding(done);
        await new Promise(resolve => window.setTimeout(resolve, LANDING_MS));
        setLanding(null);
      }
      setReading(done);
      setFacts(done.facts);
      setChosen(defaultChosen(done, website));
      go("check");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't read this website."); urlRef.current?.focus(); }
    finally { inFlight.current = false; setBusy(null); }
  }

  async function removeOne(fact: FoundFact) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy("save"); setError("");
    try {
      const body = await post({ action: "decide_found_facts", workspaceId: business.workspaceId, revision: reading?.revision ?? revision, decisions: [{ id: fact.id, decision: "remove" }] }) as { waiting?: FoundFact[]; revision?: number };
      const left = body.waiting ?? facts.filter(item => item.id !== fact.id);
      setFacts(left);
      // The server's list is the truth: only ticks on facts still shown survive.
      setChosen(current => new Set([...current].filter(id => id === USE_WEBSITE || (id !== fact.id && left.some(item => item.id === id)))));
      if (typeof body.revision === "number") { setRevision(body.revision); if (reading) setReading({ ...reading, revision: body.revision }); }
      if (!left.length && !reading) go("next");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That didn't go through. Nothing changed."); }
    finally { inFlight.current = false; setBusy(null); }
  }

  async function confirm() {
    if (inFlight.current) return;
    // Ticked: added to the business. Not ticked: kept for later on Home, never dropped.
    const decisions = facts.map(fact => ({ id: fact.id, decision: chosen.has(fact.id) ? "confirm" as const : "later" as const }))
      .filter(item => item.decision === "confirm" || facts.find(fact => fact.id === item.id)?.status === "unconfirmed");
    const websiteChosen = Boolean(reading && !website && chosen.has(USE_WEBSITE));
    if (!decisions.length && !websiteChosen) { go("next"); return; }
    inFlight.current = true; setBusy("save"); setError("");
    try {
      const body = await post({ action: "decide_found_facts", workspaceId: business.workspaceId, revision: reading?.revision ?? revision, ...(websiteChosen && reading ? { website: reading.url } : {}), decisions, timeZone: deviceTimeZone() }) as { confirmed?: number; websiteSaved?: boolean; revision?: number; waiting?: FoundFact[] };
      setSaved({ added: (body.confirmed ?? 0) + (body.websiteSaved ? 1 : 0), later: (body.waiting ?? []).length });
      setFacts(body.waiting ?? []);
      setChosen(new Set());
      if (typeof body.revision === "number") setRevision(body.revision);
      if (body.websiteSaved && reading) setWebsite(reading.url);
      setReading(null);
      go("next");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your details couldn't be added. Nothing changed."); }
    finally { inFlight.current = false; setBusy(null); }
  }

  const host = website ? websiteHost(website) : null;
  const ticked = facts.filter(fact => chosen.has(fact.id)).length + (reading && !website && chosen.has(USE_WEBSITE) ? 1 : 0);
  const readHost = landing ? websiteHost(landing.url) : reading ? websiteHost(reading.url) : url.trim() ? websiteHost(url.trim()) : host;
  const nothingFound = Boolean(reading && !facts.length);
  const stage = entryStage({ phase, busy: busy === "read", landing, error: Boolean(error), nothingFound, readHost, host, business, facts, chosen, reading, ticked });

  const carried = <>
    {links.check ? <XaSays links={[<XaTextLink key="check" href={links.check}>Open saved check</XaTextLink>]}>Your check is saved in this business. Its first fix waits there.</XaSays> : null}
    {links.request ? <XaSays links={[<XaTextLink key="request" href={links.request}>Open request</XaTextLink>]}>Your request went to your agency. Nothing is agreed until they reply with scope and timing.</XaSays> : null}
  </>;
  const failure = error ? <div role="alert"><XaSays>{error}</XaSays></div> : null;

  return <XaEntry account={account} mode={mode} stage={stage} width={phase === "next" ? "wide" : "form"}>
    <div key={phase} className={styles.phase} data-phase={phase}>
      {phase === "site" ? <>
        <XaEntrySteps steps={GETTING_STARTED_STEPS} current={1} />
        <div className={styles.head}>
          <XaHeadline id={headingId}><span tabIndex={-1} className={styles.focusTarget}>Start from the site you already have.</span></XaHeadline>
          <p className={styles.lede}>Strelva reads up to five public pages of {business.name}&rsquo;s site. Nothing on your site changes.</p>
        </div>
        {carried}
        <form className={styles.stack} onSubmit={event => void read(event)} noValidate aria-busy={busy === "read" || undefined}>
          <XaField ref={urlRef} label="Your website" type="url" inputMode="url" autoComplete="url" spellCheck={false} autoCapitalize="none" placeholder="yourbusiness.com" value={url} maxLength={2048} disabled={busy !== null} onChange={event => { setUrl(event.target.value); setError(""); }} />
          <XaButton type="submit" variant="primary" size="lg" block busy={busy === "read"}>{busy === "read" ? `Reading ${readHost ?? "your website"}` : "Read my website"}</XaButton>
          {busy === "read" ? <p className={styles.note} role="status">{landing ? `Read ${plural(landing.pagesRead, "page", "pages")} of ${websiteHost(landing.url)}.` : "This takes a few seconds."}</p> : null}
        </form>
        {failure}
        <p className={styles.after}><XaTextLink href={links.details}>Add details yourself instead</XaTextLink><span aria-hidden="true">·</span><XaTextLink onClick={() => go("next")}>Skip this step</XaTextLink></p>
      </> : null}

      {phase === "check" ? <>
        <XaEntrySteps steps={GETTING_STARTED_STEPS} current={2} />
        <div className={styles.head}>
          <XaHeadline id={headingId}><span tabIndex={-1} className={styles.focusTarget}>{nothingFound ? "Nothing to add yet." : "Is this right?"}</span></XaHeadline>
          <p className={styles.lede}>{reading
            ? nothingFound
              ? <>Strelva read {plural(reading.pagesRead, "page", "pages")} of {websiteHost(reading.url)} and found nothing to add.</>
              : <>Found on {websiteHost(reading.url)}, {plural(reading.pagesRead, "page", "pages")} read. Tick what&rsquo;s right.</>
            : "These details wait for you. Tick what's right."}</p>
        </div>
        {nothingFound ? <>
          {failure}
          <XaButtonLink href={links.details} variant="primary" size="lg" block>Add details yourself</XaButtonLink>
          <p className={styles.after}><XaTextLink onClick={() => go("site")}>Read another address</XaTextLink><span aria-hidden="true">·</span><XaTextLink onClick={() => go("next")}>Skip this step</XaTextLink></p>
        </> : <>
          <FoundList business={business} facts={facts} reading={reading} website={website} chosen={chosen} busy={busy !== null} onToggle={(id, on) => setChosen(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; })} onRemove={fact => void removeOne(fact)} />
          {failure}
          {facts.some(fact => !chosen.has(fact.id)) ? <p className={styles.note}>Anything you don&rsquo;t tick waits for you on {HOME}. Nothing joins your business until you add it.</p> : null}
          <ConfirmButton count={ticked} name={business.name} busy={busy === "save"} disabled={busy === "read"} keepOnly={!ticked && facts.some(fact => fact.status === "unconfirmed")} onClick={() => void confirm()} />
          {facts.length ? <p className={styles.after}><XaTextLink onClick={() => go("site")}>{reading ? "Read again" : "Read my website"}</XaTextLink><span aria-hidden="true">·</span><XaTextLink href={links.details}>Edit details yourself</XaTextLink></p> : null}
        </>}
      </> : null}

      {phase === "next" ? <NextSteps headingId={headingId} business={business} host={host} website={website} saved={saved} links={links} carried={carried} /> : null}
    </div>
  </XaEntry>;
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const countWord = (count: number) => COUNT_WORDS[count] ?? String(count);

/** What the stage shows: Pebble doing this step's job, and what it is holding. It changes with the state, never on a timer. */
function entryStage({ phase, busy, landing, error, nothingFound, readHost, host, business, facts, chosen, reading, ticked }: {
  phase: Phase; busy: boolean; landing: WebsiteReading | null; error: boolean; nothingFound: boolean; readHost: string | null; host: string | null;
  business: GettingStartedBusiness; facts: readonly FoundFact[]; chosen: ReadonlySet<string>; reading: WebsiteReading | null; ticked: number;
}): XaEntryStage {
  const address = readHost ?? "your website";
  if (phase === "site") {
    // The page Strelva just read, as its visitors see it at the top, before the facts.
    if (landing?.page) return { pose: "waving", label: `Pebble back from ${address} with what it read`, objectKey: "landed",
      object: <XaPage address={address} title={landing.page.title} flat>{landing.page.description ? <p className={styles.pageLine}>{landing.page.description}</p> : null}</XaPage> };
    if (busy) return { pose: "fixing", label: `Pebble reading ${address}`, objectKey: "reading",
      object: <XaPage address={address} flat><XaStatus kind="working">Reading up to five public pages</XaStatus></XaPage> };
    if (error) return { pose: "alone", label: `Pebble outside ${address}, which stayed closed`, objectKey: "closed",
      object: <XaPage address={address} flat><p className={styles.pageLine}>Nothing on it changed.</p></XaPage> };
    return { pose: "fixing", label: "Pebble at the website, ready to read it", title: "Your site stays where it is.", body: "Strelva reads it the way a visitor does and brings back what it finds." };
  }
  if (phase === "check") {
    if (nothingFound) return { pose: "alone", label: "Pebble back from the site, empty-handed", title: "Your details start with you.", body: "Add hours, phone and services once. Every System you add reads them from there." };
    const joining = facts.filter(fact => chosen.has(fact.id));
    return { pose: "waving", label: "Pebble holding the details that will join your business", title: `${countWord(ticked)} of ${countWord(facts.length + (reading && !business.website ? 1 : 0)).toLowerCase()} will join ${business.name}.`,
      object: <XaPage address={reading ? websiteHost(reading.url) : host ?? business.name} title={reading?.page?.title ?? business.name} flat>
        {joining.length ? <ul className={styles.joining}>{joining.map(fact => <li key={fact.id}><span>{fact.label}</span>{fact.display}</li>)}</ul> : <p className={styles.pageLine}>Tick a detail and it lands here.</p>}
      </XaPage> };
  }
  // Only what exists is on the stage: the website, kept where it is. No System is drawn before one is made.
  if (host) return { pose: "website", label: `The website clay: ${host}, kept where it is`, title: `${host}, kept where it is.` };
  return { pose: "alone", label: "Pebble, beside you", title: "Nothing goes live without your yes.", body: "Strelva asks you first, every time something would change." };
}

interface NextStep { key: string; title: string; sentence: string; link: string; href: string; lead?: ReactNode }

/** XA · B5: one step that fits this business leads; the rest are one line of links. */
function NextSteps({ headingId, business, host, website, saved, links, carried }: {
  headingId: string; business: GettingStartedBusiness; host: string | null; website: string | null; saved: { added: number; later: number } | null; links: GettingStartedLinks; carried: ReactNode;
}) {
  const steps: NextStep[] = [
    ...(links.connect ? [{ key: "connect", title: "Keep your site where it is", sentence: `Add two lines to ${host ?? "your site"} and Strelva works beside it.`, link: "Connect your site", href: links.connect, lead: <XaSystemTile kind="website" size={48} /> }] : []),
    ...(website ? [{ key: "check", title: "See what AI assistants say about you", sentence: `The free check, filled in with ${business.name} and ${host}.`, link: "Run the AI visibility check", href: `/ai-visibility?${new URLSearchParams({ business: business.name, url: website })}`, lead: <XaPebbleAvatar size={48} /> }] : []),
    { key: "agency", title: "Bring in an agency", sentence: "They build and run things for you. You stay the owner and say yes.", link: "Bring in an agency", href: links.agency },
    ...(links.google ? [{ key: "google", title: "Keep your Google listing in step", sentence: "Bring in your Google listing: hours, phone and reviews.", link: "Connect Google", href: links.google, lead: <XaSystemTile kind="listing" size={48} /> }] : []),
  ];
  // The owner's first ask decides which step leads; keeping the website working leads by default.
  const wantsSite = !links.ask || /website/i.test(links.ask.text);
  const lead = (wantsSite ? steps.find(step => step.key === "connect") : undefined) ?? steps[0]!;
  const also = steps.filter(step => step !== lead);
  const summary = saved
    ? [saved.added ? `${countWord(saved.added)} ${saved.added === 1 ? "detail" : "details"} added${host ? ` from ${host}` : ""}.` : "Nothing was added yet.", saved.later ? `${countWord(saved.later)} ${saved.later === 1 ? "waits" : "wait"} for you on ${HOME}.` : ""].filter(Boolean).join(" ")
    : "No details were added yet. Add hours, phone and services any time from Business details.";
  return <>
    <div className={styles.head}>
      <XaHeadline id={headingId}><span tabIndex={-1} className={styles.focusTarget}>{business.name} is set up.</span></XaHeadline>
      <p className={styles.lede} role={saved ? "status" : undefined}>{summary}{saved?.added ? <> <XaTextLink href={links.details}>Review them</XaTextLink></> : null}</p>
    </div>
    {!business.canConfirm ? <XaSays>Only the business owner can add details found on the website.</XaSays> : null}
    {links.ask ? <XaSays links={[<XaTextLink key="ask" href={links.ask.href}>See it</XaTextLink>]}>Your first ask: {links.ask.text}</XaSays> : null}
    {carried}
    <section className={styles.lead} aria-labelledby={`${headingId}-next`}>
      {lead.lead ? <span className={styles.leadArt}>{lead.lead}</span> : null}
      <div className={styles.leadText}>
        <h2 id={`${headingId}-next`} className={styles.leadTitle}>{lead.title}</h2>
        <p className={styles.leadSentence}>{lead.sentence}</p>
        <XaTextLink href={lead.href}>{lead.link}</XaTextLink>
      </div>
    </section>
    {also.length ? <p className={styles.after}>Also:{also.map((step, index) => <span key={step.key} className={styles.alsoItem}>{index ? <span aria-hidden="true">·</span> : null}<XaTextLink href={step.href}>{step.link}</XaTextLink></span>)}</p> : null}
    <XaButtonLink href={links.home} variant="primary" size="lg" block>Go to {business.name}</XaButtonLink>
  </>;
}

function ConfirmButton({ count, name, busy, disabled, keepOnly, onClick }: { count: number; name: string; busy: boolean; disabled: boolean; keepOnly: boolean; onClick: () => void }) {
  const label = count ? `Add ${plural(count, "detail", "details")} to ${name}` : keepOnly ? "Keep these for later" : "Continue";
  return <XaButton variant="primary" size="lg" block busy={busy} disabled={disabled} onClick={onClick}>{label}</XaButton>;
}

function FoundList({ business, facts, reading, website, chosen, busy, onToggle, onRemove }: {
  business: GettingStartedBusiness; facts: readonly FoundFact[]; reading: WebsiteReading | null; website: string | null;
  chosen: ReadonlySet<string>; busy: boolean; onToggle: (id: string, on: boolean) => void; onRemove: (fact: FoundFact) => void;
}) {
  const items: XaChecklistItem<string>[] = facts.map(fact => ({
    value: fact.id,
    kicker: fact.label,
    label: fact.display,
    disabled: busy || !fact.confirmable,
    detail: <>
      {fact.current ? <span className={styles.line}>Replaces {fact.current}</span> : null}
      {!fact.confirmable ? <span className={styles.line}>Kept for reference.</span> : null}
      {fact.status === "later" ? <span className={styles.line}>You left this for later.</span> : null}
      {/* Where it came from, as a quiet source line under the value. */}
      <span className={styles.line}>{fact.sourceUrl ? <>From the <a className={styles.source} href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" title={fact.quote ? `It says: “${fact.quote}”` : undefined}>{sourcePageName(fact.sourceUrl)}</a></> : FOUND_FACT_SOURCE_LABELS[fact.sourceKind]}</span>
    </>,
    // Unticking is the "no". Not right removes it for good, and shows where the pointer or focus is.
    actions: <XaTextLink onClick={busy ? undefined : () => onRemove(fact)} aria-label={`Not right: ${fact.label} ${fact.display}`}>Not right</XaTextLink>,
  }));
  if (reading && !website) items.push({ value: USE_WEBSITE, kicker: "Website", label: websiteHost(reading.url), detail: `Use it as ${business.name}'s website.`, disabled: busy });
  return <XaChecklist label={reading ? `Found on ${websiteHost(reading.url)}` : "Waiting for you"} hideLabel listLabel="Found facts" items={items} checked={chosen} onChange={onToggle} />;
}
