"use client";
import { useCallback, useEffect, useState } from "react";
import { StMono, StNotice, StPillLink, StRow, StRows, StSection, StState, StTextButton, type BeaconKind } from "@/components/ui/strelva/Kit";
import {
  FACT_LABEL, FACT_STATE_LABEL, listingsHeadline, listingsSyncViewSchema,
  type ListingFix, type ListingsSyncView, type SurfaceReading,
} from "@/products/listings-sync";

/**
 * "Where your details appear": does each place (website, Google listing,
 * booking page, Yelp) show what the owner confirmed? Reads only. Making a
 * change live happens in Needs you; this panel points there. Renders nothing
 * while the App is off for the business (the route answers 404).
 */

type State = { kind: "loading" } | { kind: "off" } | { kind: "error" } | { kind: "ready"; view: ListingsSyncView };

function surfaceBeacon(reading: SurfaceReading): BeaconKind {
  if (reading.facts.some(fact => fact.state === "differs")) return "need";
  if (reading.state !== "read" || reading.facts.some(fact => fact.state === "waiting_on_google")) return "draft";
  return reading.facts.some(fact => fact.state === "matches" || fact.state === "follows") ? "live" : "draft";
}

function surfaceNote(reading: SurfaceReading, workspaceId: string): React.ReactNode {
  if (reading.state === "unreadable") return reading.reason ?? "Couldn't read this page. Strelva will check again.";
  if (reading.state === "reconnect") return <>Reconnect Google to compare this listing. <StTextButton href={`/workspace/connections?workspaceId=${encodeURIComponent(workspaceId)}`}>Open connections</StTextButton></>;
  if (reading.state === "waiting_on_google") return "Waiting on Google";
  return null;
}

function FactLines({ reading }: { reading: SurfaceReading }) {
  return <ul className="m-0 grid list-none gap-0.5 p-0">
    {reading.facts.map(fact => <li key={fact.fact}>
      {FACT_LABEL[fact.fact]} · {FACT_STATE_LABEL[fact.state]}
      {fact.state === "differs" ? <>: shows <StMono>{fact.shown ?? "nothing"}</StMono>, your details <StMono>{fact.expected ?? ""}</StMono></> : null}
      {fact.note ? <> · {fact.note}</> : null}
    </li>)}
  </ul>;
}

function fixLine(fix: ListingFix): string[] {
  const lines = fix.proposed.lines;
  return Array.isArray(lines) ? lines.filter((line): line is string => typeof line === "string") : [];
}

export function ListingsSyncPanel({ workspaceId, request = fetch, viewerIsOwner, businessName, initial }: {
  workspaceId: string; request?: typeof fetch; viewerIsOwner: boolean; businessName: string; initial?: ListingsSyncView | null;
}) {
  const [state, setState] = useState<State>(initial ? { kind: "ready", view: initial } : initial === null ? { kind: "off" } : { kind: "loading" });
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const read = useCallback((value: unknown): State => {
    const parsed = listingsSyncViewSchema.safeParse(value);
    return parsed.success ? { kind: "ready", view: parsed.data } : { kind: "error" };
  }, []);

  useEffect(() => {
    if (initial !== undefined) return;
    let live = true;
    (async () => {
      try {
        const response = await request(`/api/workspace/listings-sync?${new URLSearchParams({ workspaceId })}`, { credentials: "same-origin" });
        if (!live) return;
        if (response.status === 404) setState({ kind: "off" });
        else setState(response.ok ? read(await response.json()) : { kind: "error" });
      } catch { if (live) setState({ kind: "error" }); }
    })();
    return () => { live = false; };
  }, [initial, request, workspaceId, read]);

  async function check() {
    setChecking(true);
    try {
      const response = await request("/api/workspace/listings-sync", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", workspaceId }),
      });
      if (response.status === 404) { setState({ kind: "off" }); return; }
      const body = await response.json().catch(() => null);
      if (response.ok) setState(read(body));
      else setCopied(typeof body?.error === "string" ? body.error : "The check didn't run. Nothing changed.");
    } catch { setCopied("The check didn't run. Nothing changed."); }
    finally { setChecking(false); }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied("Copied"); }
    catch { setCopied("Copy failed"); }
  }

  if (state.kind === "off") return null;
  if (state.kind === "loading") return <StSection id="listings" title="Where your details appear"><p role="status" className="text-sm text-gray-muted">Checking…</p></StSection>;
  if (state.kind === "error") return <StSection id="listings" title="Where your details appear"><StNotice tone="critical">{"Where your details appear couldn't be read. Nothing changed."}</StNotice></StSection>;

  const { view } = state;
  const headline = listingsHeadline(view);
  const showChecking = checking || view.checking;
  const open = view.fixes.filter(fix => fix.status !== "verified" && fix.status !== "declined" && fix.status !== "superseded");
  const todos = open.filter(fix => fix.kind === "owner_todo");
  const waiting = open.filter(fix => fix.kind !== "owner_todo" && (fix.status === "proposed" || fix.status === "failed"));
  const applied = open.filter(fix => fix.kind !== "owner_todo" && (fix.status === "applied" || fix.status === "applying"));
  const yelpNote = view.surfaces.some(surface => surface.kind === "yelp" && surface.facts.some(fact => fact.state === "differs"));

  return <StSection id="listings" title="Where your details appear" meta={headline.text}
    action={showChecking ? <span role="status">Checking…</span> : <StTextButton onClick={check}>Check now</StTextButton>}>
    {view.lastError ? <StNotice tone="critical">{view.lastError}</StNotice> : null}
    {view.surfaces.length ? <StRows label="Places your details appear">
      {view.surfaces.map(reading => {
        const note = surfaceNote(reading, workspaceId);
        return <StRow key={reading.surfaceKey} title={reading.label}
          detail={<>{note ? <span>{note}</span> : null}{reading.facts.length ? <FactLines reading={reading} /> : null}</>}
          end={<StState kind={surfaceBeacon(reading)}>{reading.facts.some(fact => fact.state === "differs") ? "Differs" : reading.state === "waiting_on_google" ? "Waiting on Google" : reading.state === "read" ? "Matches" : "Not read"}</StState>} />;
      })}
    </StRows> : <p className="text-sm text-gray-muted">{view.checkedAt ? "Nothing to compare yet. Confirm your phone, address or hours to start." : "Strelva hasn't checked yet."}</p>}

    {view.pendingConfirmation > 0 ? <StNotice>{view.pendingConfirmation === 1 ? "1 changed detail is" : `${view.pendingConfirmation} changed details are`} waiting for the owner to confirm. Listings follow after that.</StNotice> : null}

    {waiting.length && view.waitingOnOwner ? (viewerIsOwner
      ? <StNotice tone="need" action={<StPillLink href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`} variant="soft">Open Needs you</StPillLink>}>These places can be fixed. Review and hold to make it live in Needs you.</StNotice>
      : <StNotice tone="need">Waiting on {businessName}<span className="block text-xs text-gray-muted">Owner email is off; the owner sees this in Strelva.</span></StNotice>) : null}

    {applied.length ? <StRows label="Changes in progress">
      {applied.map(fix => <StRow key={fix.id} title={fix.kind === "site_request" ? "Asked your agency" : "Changed. Checking again"} detail={fixLine(fix).join(" ") || FACT_LABEL[fix.factKey === "page" ? "phone" : fix.factKey]} />)}
    </StRows> : null}

    {todos.length ? <>
      <h3 className="mt-4 text-sm font-medium">Change these yourself</h3>
      <StRows label="Change these yourself">
        {todos.flatMap(fix => fixLine(fix).map(line => ({ fix, line }))).map(({ fix, line }) => <StRow key={`${fix.id}-${line}`} title={line}
          end={<StTextButton onClick={() => copy(line)}>Copy</StTextButton>} />)}
      </StRows>
      {yelpNote ? <p className="text-sm text-gray-muted">{"Strelva can't change Yelp. Change it on Yelp."}</p> : null}
    </> : null}
    {copied ? <p role="status" className="text-sm text-gray-muted">{copied}</p> : null}

    {view.release || view.checkedAt ? <p className="mt-3 flex flex-wrap gap-x-3 text-xs text-gray-muted">
      {view.release ? <StMono>{`Release ${view.release.number}`}</StMono> : null}
      {view.checkedAt ? <span>checked <time dateTime={view.checkedAt}>{view.checkedAt.slice(0, 10)}</time></span> : null}
    </p> : null}
  </StSection>;
}
