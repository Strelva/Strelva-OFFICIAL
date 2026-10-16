"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorksWithFilter, worksWith } from "@/experience/systems/RequiredConnections";
import type { ConnectionProvider } from "@/platform/connections/contracts";
import { SystemCreator } from "@/experience/systems/SystemCreator";
import { systemHref } from "@/experience/systems/model";
import { SourcePackageControls } from "./SourcePackageControls";
import { StLabel, StNotice, StRow, StRows, StSection, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import { XaButton, XaChoices, XaEmpty, XaHeadline, XaInitial, XaLabel, XaRow, XaRows, XaSays, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { clientColor } from "@/platform/presentation/client-color";
import { AgencyFold } from "./xa/AgencyFold";
import { LibraryResolveError, resolveLibraryConflict, type ConflictChoice } from "./library-resolve";
import xa from "./xa/agency-xa.module.css";
import { AgencyWorkspaceReadError, loadAgencyLibrary, reviewAllImprovements, type AgencyBulkReviewResult, type AgencyLibrary, type AgencyLibrarySource, type AgencyLibraryVersion } from "../agency-clients";
import {
  conflictValue,
  latestRevision,
  libraryConflictSentence,
  libraryReachLine,
  libraryVersionLine,
  reviewAllLines,
  reviewLineLabel,
  reviewableVersionIds,
  reviewableVersionGroups,
} from "../agency-home";

type LibraryState =
  | { status: "loading" }
  | { status: "error"; permission?: boolean }
  | { status: "ready"; library: AgencyLibrary };

type ReviewState =
  | { status: "running" }
  | { status: "done"; results: AgencyBulkReviewResult[]; message?: string }
  | { status: "error"; message: string };


/**
 * Library: the agency's sources and where each client Version stands against
 * the exact qualified offer. Status shows only on the exceptions. Each ready
 * client has its own Offer; a conflict is resolved inline through the same
 * Version choice the client's System uses. Offering several sends only ready
 * Versions, and nothing goes live until each owner says yes.
 */
export function AgencyLibraryView({
  request,
  agencyWorkspaceId,
  leadExtra,
}: {
  request: typeof fetch;
  agencyWorkspaceId: string;
  onWorkspace: (workspaceId: string) => void;
  /** The agency's own Library tools (adapt a source for another client), under the sources list. */
  leadExtra?: ReactNode;
}) {
  const [provider, setProvider] = useState<ConnectionProvider | "">("");
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const scope = useRef(agencyWorkspaceId);
  const generation = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const reviewing = useRef(new Set<string>());
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    controllers.current.add(controller);
    const current = ++generation.current;
    setRefreshing(true);
    setRefreshError("");
    try {
      const library = await loadAgencyLibrary(request, agencyWorkspaceId, controller.signal);
      if (!controller.signal.aborted && current === generation.current && scope.current === agencyWorkspaceId) setState({ status: "ready", library });
    } catch (cause) {
      if (!controller.signal.aborted && current === generation.current && scope.current === agencyWorkspaceId) {
        const permission = cause instanceof AgencyWorkspaceReadError && cause.status === 403;
        setState(previous => !permission && previous.status === "ready" ? previous : { status: "error", permission });
        setRefreshError("The Library could not be refreshed. Counts may be out of date. Read current state before preparing another offer.");
      }
    } finally {
      controllers.current.delete(controller);
      if (!controller.signal.aborted && current === generation.current && scope.current === agencyWorkspaceId) setRefreshing(false);
    }
  }, [request, agencyWorkspaceId]);

  useEffect(() => {
    scope.current = agencyWorkspaceId;
    setState({ status: "loading" });
    setReviews({});
    setSelectedSourceId(null);
    setProvider("");
    void refresh();
    const active = controllers.current;
    const sequence = generation;
    return () => { scope.current = ""; ++sequence.current; for (const controller of active) controller.abort(); active.clear(); };
  }, [agencyWorkspaceId, refresh, attempt]);

  const review = useCallback(async (source: AgencyLibrarySource, versionIds = reviewableVersionIds(source)) => {
    if (state.status !== "ready" || state.library.reviewEnabled !== true || reviewing.current.has(source.systemId) || refreshing || refreshError) return;
    reviewing.current.add(source.systemId);
    setReviews((current) => ({ ...current, [source.systemId]: { status: "running" } }));
    const results: AgencyBulkReviewResult[] = [];
    try {
      const groups = reviewableVersionGroups(source, versionIds);
      for (const group of groups) {
        const result = await reviewAllImprovements(request, { agencyWorkspaceId, sourceSystemId: source.systemId, ...group });
        results.push(result);
        if (scope.current === agencyWorkspaceId) setReviews(current => ({ ...current, [source.systemId]: { status: "done", results: [...results] } }));
      }
      if (!groups.length && scope.current === agencyWorkspaceId) setReviews(current => ({ ...current, [source.systemId]: { status: "error", message: "Nothing is ready to offer. Nothing was sent." } }));
    } catch (cause) {
      if (scope.current === agencyWorkspaceId) {
        const message = `${cause instanceof Error ? cause.message : "The offer response could not be read."} Outcome not confirmed. Reading the Library before another offer.`;
        setReviews(current => ({ ...current, [source.systemId]: results.length ? { status: "done", results: [...results], message } : { status: "error", message } }));
      }
    } finally {
      if (scope.current === agencyWorkspaceId) await refresh();
      reviewing.current.delete(source.systemId);
    }
  }, [request, agencyWorkspaceId, refresh, refreshing, refreshError, state]);

  if (state.status === "loading") return <div className={xa.library}><div className={xa.libraryLead} role="status" aria-label="Loading the library"><XaHeadline quiet="Reading your sources and every client's Version…">Fix it once.</XaHeadline><StSkeleton width="48%" label="Loading the library" /><StSkeleton width="72%" /></div></div>;
  if (state.status === "error" && state.permission) return <div className={xa.state}><XaSays>You do not have permission to open this Library. Ask an agency owner to check your access.</XaSays></div>;
  if (state.status === "error") return <div className={xa.state}><XaEmpty pose="fixing" job="Pebble kept every source and Version as it was. Nothing was changed." title="The library could not be loaded." action={<XaButton variant="primary" onClick={() => setAttempt(value => value + 1)}>Retry</XaButton>} /></div>;
  if (!state.library.sources.length && !state.library.inquiryVersions?.length && !state.library.inquiryVersionsUnavailable) return <div className={xa.state}><XaEmpty pose="lineup" job="When a System is packaged as a source and adapted for a client, Pebble lists it here with each client's Version." title="No sources yet." secondary={<XaTextLink onClick={refreshing ? undefined : () => void refresh()}>Refresh Library</XaTextLink>}>Build something once for a client, package it, and every other client who could use it can get their own Version.</XaEmpty>{refreshError ? <p role="alert" className={xa.inlineAlert}>{refreshError}</p> : null}</div>;
  const visibleSources = state.library.sources.filter(source => worksWith(latestRevision(source)?.requiredConnections ?? [], provider));
  const selectedSource = visibleSources.find(source => source.systemId === selectedSourceId) ?? visibleSources[0];
  const busyReviewing = Object.values(reviews).some(review => review.status === "running");
  // Filter and refresh are tools for the person packaging sources; they live in the fold, not the main view.
  const tools = <>
    <WorksWithFilter value={provider} onChange={setProvider} />
    {provider && state.library.sources.some(source => latestRevision(source)?.requiredConnections === undefined) ? <p className={xa.note}>Some source Connections could not be checked. Those sources are excluded from this filter.</p> : null}
    <p className={xa.note}><XaTextLink onClick={refreshing || busyReviewing ? undefined : () => void refresh()}>Refresh Library</XaTextLink>{refreshing ? <span role="status"> · Refreshing…</span> : null}</p>
    <p className={xa.note}>Clients see an offer in their Apps. Each keeps its own Version, records, Connections and say.</p>
  </>;
  return <div className={xa.library}>
    <div className={xa.libraryLead}>
      <XaHeadline quiet="Every client who could use it gets it to review.">Fix it once.</XaHeadline>
      {state.library.reviewEnabled !== true ? <XaSays>Owner reviews are paused. Your saved sources and client Versions remain available. Strelva will turn reviews on for you.</XaSays> : null}
      {visibleSources.length ? <ul className={xa.sources} aria-label="Sources">{visibleSources.map(source => <li key={source.systemId}><button type="button" className={xa.source} aria-pressed={source.systemId === selectedSource?.systemId} onClick={() => setSelectedSourceId(source.systemId)}>
        <span className={xa.sourceText}><b>{source.name}</b><small>{libraryReachLine(source)}</small></span>
      </button></li>)}</ul> : null}
      {!visibleSources.length ? <p className={xa.note}>No sources work with this connection yet. <XaTextLink onClick={() => setProvider("")}>Show every source</XaTextLink></p> : null}
      {refreshError ? <p role="alert" className={xa.inlineAlert}>{refreshError}</p> : null}
      {leadExtra}
    </div>
    <div>
      {selectedSource ? <LibrarySource key={selectedSource.systemId} request={request} source={selectedSource} review={reviews[selectedSource.systemId]} reviewEnabled={state.library.reviewEnabled === true} held={refreshing || Boolean(refreshError) || state.library.reviewEnabled !== true} tools={tools} onChanged={() => void refresh()} onReview={ids => void review(selectedSource, ids)} />
        : <AgencyFold label="Releases" open>{tools}</AgencyFold>}
      {!provider ? <InquiryLibraryVersions library={state.library} /> : null}
    </div>
  </div>;
}

export function InquiryLibraryVersions({ library }: { library: AgencyLibrary }) {
  return <>{library.inquiryVersionsUnavailable ? <StNotice>Some inquiry Versions could not be checked. Their absence does not mean they were removed.</StNotice> : null}
    {library.inquiryVersions?.length ? <StSection title="Inquiry Versions"><StRows label="Inquiry Versions">{library.inquiryVersions.map(version => <StRow key={version.id} title={`${version.businessName} · ${version.name}`} detail={<><span>Source Release {version.sourceRevision} · this Version’s Release {version.currentRelease}</span><br />{version.improvement === "blocked" ? "A source update needs a choice about local changes." : version.improvement === "auto_applicable" ? "A source update is available for review." : "Based on the accepted source revision. Local changes keep their own release."}</>} end={<StTextButton href={`/business/${encodeURIComponent(version.tenantId)}?view=patterns`}>Open {version.businessName}’s inquiry form</StTextButton>} />)}</StRows><StLabel>Updates use the existing inquiry review and testing steps. Each business owner approves going live.</StLabel></StSection> : null}</>;
}

type ResolveState = { versionId: string; choices: Record<string, ConflictChoice>; status: "choosing" | "saving" | "error"; message?: string };

function LibrarySource({ request, source, review, onReview, held, onChanged, reviewEnabled, tools }: {
  reviewEnabled: boolean; request: typeof fetch; source: AgencyLibrarySource; review: ReviewState | undefined; onReview: (versionIds?: string[]) => void; held: boolean; onChanged: () => void; tools: ReactNode;
}) {
  const latest = latestRevision(source);
  const readyIds = useMemo(() => reviewableVersionIds(source), [source]);
  const [bulk, setBulk] = useState(false);
  const [selection, setSelectedIds] = useState(readyIds);
  const [resolving, setResolving] = useState<ResolveState | null>(null);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const selectedIds = selection.filter(id => readyIds.includes(id));
  const headingId = `library-source-${source.systemId}`;
  const readyClients = new Set(source.versions.filter(version => readyIds.includes(version.versionId)).map(version => version.workspaceId)).size;
  const running = review?.status === "running";
  const allSettled = source.versions.length > 0 && source.versions.every(version => version.state === "up_to_date");
  // One ink pill: the bulk offer when several are ready, otherwise the single ready client's Offer.
  const singleReady = readyIds.length === 1;

  async function resolve(version: AgencyLibraryVersion, choices: Record<string, ConflictChoice>) {
    setResolving({ versionId: version.versionId, choices, status: "saving" });
    try {
      const outcome = await resolveLibraryConflict(request, { workspaceId: version.workspaceId, systemId: version.systemId, versionId: version.versionId, choices });
      setResolving(null);
      setResolved(current => ({ ...current, [version.versionId]: outcome === "prepared" ? `Offered to ${version.clientName} with your choice. Nothing changes until they say yes.` : `${version.clientName}'s System has another choice to make. Open it to finish.` }));
      onChanged();
    } catch (cause) {
      setResolving({ versionId: version.versionId, choices, status: "error", message: cause instanceof LibraryResolveError ? cause.message : "The choice could not be confirmed. Nothing went live." });
    }
  }

  return <section className={xa.sourcePanel} aria-labelledby={headingId}>
    <div className={xa.panelHead}><h2 id={headingId}>{source.name}</h2><small>{latest ? `Updated ${new Date(latest.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "Not shared yet"}</small></div>
    {latest?.summary ? <p className={xa.panelBody}>{latest.summary}</p> : null}
    {source.hidden ? <p className={xa.note}>The shared source these Versions grew from stays out of the business&apos;s everyday Systems.</p> : null}
    {source.versions.length ? <XaRows label={`Versions of ${source.name}`}>{source.versions.map(version => <VersionRow key={version.versionId} version={version}
      selection={bulk ? { checked: selectedIds.includes(version.versionId), disabled: held || !readyIds.includes(version.versionId) || running, onChange: () => setSelectedIds(current => current.includes(version.versionId) ? current.filter(id => id !== version.versionId) : [...current, version.versionId]) } : undefined}
      done={resolved[version.versionId]}
      offer={!bulk && readyIds.includes(version.versionId) ? { primary: singleReady, disabled: held || running, busy: running, onOffer: () => onReview([version.versionId]) } : undefined}
      resolve={!bulk && version.state === "conflicts" && version.conflicts.length ? {
        state: resolving?.versionId === version.versionId ? resolving : null,
        disabled: held || running || (resolving !== null && resolving.versionId !== version.versionId),
        onOpen: () => setResolving(current => current?.versionId === version.versionId ? null : { versionId: version.versionId, choices: {}, status: "choosing" }),
        onChoose: (path, choice) => setResolving(current => current?.versionId === version.versionId ? { ...current, status: "choosing", message: undefined, choices: { ...current.choices, [path]: choice } } : current),
        onSave: choices => void resolve(version, choices),
      } : undefined} />)}</XaRows> : <p className={xa.note}>No client has a Version of this yet.</p>}
    {latest ? <div className={xa.panelFoot}>
      {readyIds.length >= 2 ? <>
        <p id={`${headingId}-review-note`} className={xa.note}>Each owner gets their own review. Nothing changes until they say yes. Clients with a choice to make or a missing account connection are skipped.</p>
        {bulk ? <p className={xa.panelBody}>{reviewableVersionGroups(source, selectedIds).map(group => source.revisions.find(revision => revision.number === group.revision)?.summary || "The latest update").join(" · ") || "Choose at least one client."}</p> : null}
        <div className={xa.toolbar}>
          {bulk ? <XaButton variant="primary" disabled={held || !selectedIds.length || running} busy={running} onClick={() => onReview(selectedIds)}>Send {selectedIds.length} {selectedIds.length === 1 ? "offer" : "offers"}</XaButton>
            : <XaButton variant="primary" disabled={held} busy={running} onClick={() => onReview()} aria-describedby={`${headingId}-review-note`}>Offer to {readyClients} {readyClients === 1 ? "client" : "clients"}</XaButton>}
          <XaTextLink onClick={() => setBulk(value => !value)}>{bulk ? "Close selection" : "Choose clients"}</XaTextLink>
        </div>
      </> : readyIds.length === 0 && source.versions.length ? <p className={xa.note}>{allSettled ? "Every client is up to date." : "Nothing else is ready to offer."}</p> : null}
    </div> : null}
    {review ? <ReviewResult reviewEnabled={reviewEnabled} source={source} review={review} /> : null}
    {/* Pebble speaks only when its check held a client back, naming who and why. */}
    {heldBack(source) ? <XaSays>{heldBack(source)}</XaSays> : null}
    <AgencyFold label="Releases" count={source.revisions.length || null}>
      {tools}
      <SystemCreator requestOverride={request} workspaceId={source.workspaceId} systemId={source.systemId} />
      {source.revisions.length ? <XaRows label={`Releases of ${source.name}`}>{[...source.revisions].sort((a, b) => b.number - a.number).map(revision => <XaRow key={revision.number} title={revision.summary || revision.label || "No summary"} detail={`Shared ${new Date(revision.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`} meta={source.versions.some(version => version.baselineRevision === revision.number) ? "In use" : undefined} />)}</XaRows> : <p className={xa.note}>Nothing shared yet.</p>}
      <SourcePackageControls request={request} workspaceId={source.workspaceId} systemId={source.systemId} onChanged={onChanged} />
    </AgencyFold>
  </section>;
}

/** "Pebble held North Coast Realty back from this offer until you choose which one stays." Empty when nothing was held. */
function heldBack(source: AgencyLibrarySource): string {
  const held = source.versions.filter(version => version.state === "conflicts" || version.state === "missing_accounts");
  if (!held.length) return "";
  const first = held[0]!;
  const until = first.state === "conflicts" ? "until you choose which one stays" : "until its account is connected";
  return `Pebble held ${first.clientName}${held.length > 1 ? ` and ${held.length - 1} more` : ""} back from this offer ${until}.`;
}

interface ResolveProps {
  state: ResolveState | null;
  disabled: boolean;
  onOpen: () => void;
  onChoose: (path: string, choice: ConflictChoice) => void;
  onSave: (choices: Record<string, ConflictChoice>) => void;
}

function VersionRow({ version, selection, offer, resolve, done }: {
  version: AgencyLibraryVersion;
  /** The sentence after an inline Resolve, kept after the Library rereads. */
  done?: string;
  selection?: { checked: boolean; disabled: boolean; onChange: () => void };
  offer?: { primary: boolean; disabled: boolean; busy: boolean; onOffer: () => void };
  resolve?: ResolveProps;
}) {
  const href = systemHref("", version.workspaceId, version.systemId);
  const exception = version.state === "missing_accounts" || version.state === "declined" || version.state === "unavailable" || version.state === "conflicts";
  const resolveId = `resolve-${version.versionId}`;
  const open = Boolean(resolve?.state);
  const action = offer ? <XaButton size="sm" variant={offer.primary ? "primary" : "secondary"} disabled={offer.disabled} busy={offer.busy && offer.primary} onClick={offer.onOffer} aria-label={`Offer to ${version.clientName}`}>Offer</XaButton>
    : resolve && !done ? <XaButton size="sm" aria-expanded={open} aria-controls={resolveId} disabled={resolve.disabled} onClick={resolve.onOpen} aria-label={`${open ? "Close" : "Resolve"}: ${version.clientName}`}>{open ? "Close" : "Resolve"}</XaButton>
      : null;
  return <>
    <XaRow lead={<>{selection ? <input type="checkbox" className="h-5 w-5 accent-[var(--st-accent)]" aria-label={`Offer to ${version.clientName} · ${version.context.label}`} checked={selection.checked} disabled={selection.disabled} onChange={selection.onChange} /> : null}<XaInitial name={version.clientName} color={clientColor(version.workspaceId)} size={36} /></>}
      title={version.clientName}
      detail={done ?? (version.state === "conflicts" ? libraryConflictSentence(version) : <>{version.state === "up_to_date" || version.state === "ready" ? <><XaTextLink href={href}>{version.systemName}</XaTextLink>{libraryVersionLine(version, selection !== undefined) ? ` · ${libraryVersionLine(version, selection !== undefined)}` : ""}</> : libraryVersionLine(version, selection !== undefined)}</>)}
      tone={exception && !done ? "waits" : undefined}
      action={action} wrapOnPhone />
    {resolve?.state ? <li id={resolveId} className={xa.resolve}>
      {version.conflicts.map(conflict => <XaChoices key={conflict.path} name={`${resolveId}-${conflict.path}`} label={`Which one stays for ${version.clientName}?`} value={resolve.state!.choices[conflict.path] ?? null}
        onChange={choice => resolve.onChoose(conflict.path, choice)}
        options={[{ value: "keep_local" as const, label: "Keep theirs", detail: conflictValue(conflict.local) }, { value: "take_upstream" as const, label: "Use the new default", detail: conflictValue(conflict.upstream) }]} />)}
      {resolve.state.status === "error" ? <p role="alert" className={xa.inlineAlert}>{resolve.state.message}</p> : null}
      <div className={xa.toolbar}>
        <XaButton size="sm" busy={resolve.state.status === "saving"} disabled={version.conflicts.some(conflict => !resolve.state!.choices[conflict.path])} onClick={() => resolve.onSave(resolve.state!.choices)}>Offer with this choice</XaButton>
        <span className={xa.note}>{version.clientName} still says yes before anything changes. <XaTextLink href={href}>Open their System</XaTextLink></span>
      </div>
    </li> : null}
  </>;
}

function ReviewResult({ source, review, reviewEnabled }: { reviewEnabled: boolean; source: AgencyLibrarySource; review: ReviewState }) {
  if (review.status === "running") return <XaWorking title="Preparing an offer for each ready client…" steps={[]} />;
  if (review.status === "error") return <p role="alert" className={xa.inlineAlert}>{review.message}</p>;
  return <>{review.message ? <p role="alert" className={xa.inlineAlert}>{review.message}</p> : null}{review.results.map(result => <ReviewReleaseResult reviewEnabled={reviewEnabled} key={result.revision} source={source} result={result} />)}</>;
}

function ReviewReleaseResult({ source, result, reviewEnabled }: { reviewEnabled: boolean; source: AgencyLibrarySource; result: AgencyBulkReviewResult }) {
  const lines = reviewAllLines(source, result);
  const prepared = lines.filter(line => line.outcome === "prepared").length;
  const title = `${prepared} ${prepared === 1 ? "offer" : "offers"} sent`;
  return <section className={xa.group} aria-label={title}><XaLabel as="h3">{title}</XaLabel><p role="status" className={xa.note}>Each owner approves their own.</p><XaRows label="Review all results">{lines.map(line => <XaRow key={line.versionId} title={line.clientName} detail={<>{line.outcome === "prepared" ? line.decisionId ? `Sent. Waiting on ${line.clientName}.` : line.detail || "Sent. No owner decision came back yet." : reviewLineLabel(line)} {source.versions.find(version => version.versionId === line.versionId)?.systemName}</>} tone={line.outcome === "prepared" ? undefined : "waits"} action={reviewEnabled && line.decisionId && source.versions.some(version => version.versionId === line.versionId) ? <XaTextLink href={`/workspace/version-review?${new URLSearchParams({ workspaceId: line.workspaceId, systemId: source.versions.find(version => version.versionId === line.versionId)!.systemId, decisionId: line.decisionId })}`}>See it</XaTextLink> : null} />)}</XaRows></section>;
}
