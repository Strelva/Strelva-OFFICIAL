"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorksWithFilter, worksWith } from "@/experience/systems/RequiredConnections";
import type { ConnectionProvider } from "@/platform/connections/contracts";
import { SystemCreator } from "@/experience/systems/SystemCreator";
import { systemHref } from "@/experience/systems/model";
import { SourcePackageControls } from "./SourcePackageControls";
import { StLabel, StNotice, StRow, StRows, StSection, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import { XaButton, XaEmpty, XaHeadline, XaInitial, XaLabel, XaRow, XaRows, XaSays, XaStatus, XaSystemTile, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { clientColor } from "./xa/client-color";
import xa from "./xa/agency-xa.module.css";
import { AgencyWorkspaceReadError, loadAgencyLibrary, reviewAllImprovements, type AgencyBulkReviewResult, type AgencyLibrary, type AgencyLibrarySource, type AgencyLibraryVersion } from "../agency-clients";
import {
  conflictPathLabel,
  conflictValue,
  latestRevision,
  libraryStatusLine,
  reviewAllLines,
  reviewLineLabel,
  reviewableVersionIds,
  reviewableVersionGroups,
  versionStatusLabel,
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
 * the exact qualified offer. Conflicts are read here; the choice happens on the
 * client's own System. Review all sends only ready Versions.
 */
export function AgencyLibraryView({
  request,
  agencyWorkspaceId,
}: {
  request: typeof fetch;
  agencyWorkspaceId: string;
  onWorkspace: (workspaceId: string) => void;
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
      if (!groups.length && scope.current === agencyWorkspaceId) setReviews(current => ({ ...current, [source.systemId]: { status: "error", message: "No Version has a qualified release ready. Nothing was sent." } }));
    } catch (cause) {
      if (scope.current === agencyWorkspaceId) {
        const message = `${cause instanceof Error ? cause.message : "The preparation response could not be read."} Outcome not confirmed. Reading the Library before another offer.`;
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
  return <div className={xa.library}>
    <div className={xa.libraryLead}>
      <XaHeadline quiet="Each client gets it to review.">Fix it once.</XaHeadline>
      {state.library.reviewEnabled !== true ? <XaSays>Owner reviews are paused. Your saved sources and client Versions remain available. Strelva will turn reviews on for you.</XaSays> : null}
      {visibleSources.length ? <ul className={xa.sources} aria-label="Sources">{visibleSources.map(source => {
        const latest = latestRevision(source);
        return <li key={source.systemId}><button type="button" className={xa.source} aria-pressed={source.systemId === selectedSource?.systemId} onClick={() => setSelectedSourceId(source.systemId)}>
          <XaSystemTile kind="form" size={32} />
          <span className={xa.sourceText}><b>{source.name}</b><small>{latest ? `Release ${latest.number}` : "Draft"} · {source.versions.length} {source.versions.length === 1 ? "use" : "uses"}</small></span>
        </button></li>;
      })}</ul> : null}
      {!visibleSources.length ? <p className={xa.note}>No sources work with this connection yet. Choose another connection.</p> : null}
      <div className={xa.toolbar}>
        <XaTextLink onClick={refreshing || Object.values(reviews).some(review => review.status === "running") ? undefined : () => void refresh()}>Refresh Library</XaTextLink>
        {refreshing ? <span role="status" className={xa.note}>Refreshing the Library…</span> : null}
      </div>
      {refreshError ? <p role="alert" className={xa.inlineAlert}>{refreshError}</p> : null}
      <WorksWithFilter value={provider} onChange={setProvider} />
      {provider && state.library.sources.some(source => latestRevision(source)?.requiredConnections === undefined) ? <p className={xa.note}>Some source Connections could not be checked. Those sources are excluded from this filter.</p> : null}
      <p className={xa.note}>Qualified releases shared with clients appear in their Apps. Each client keeps its own Version, records, Connections and approval.</p>
    </div>
    <div>
      {selectedSource ? <LibrarySource key={selectedSource.systemId} request={request} source={selectedSource} review={reviews[selectedSource.systemId]} reviewEnabled={state.library.reviewEnabled === true} held={refreshing || Boolean(refreshError) || state.library.reviewEnabled !== true} onChanged={() => void refresh()} onReview={ids => void review(selectedSource, ids)} /> : null}
      {!provider ? <InquiryLibraryVersions library={state.library} /> : null}
    </div>
  </div>;
}

export function InquiryLibraryVersions({ library }: { library: AgencyLibrary }) {
  return <>{library.inquiryVersionsUnavailable ? <StNotice>Some inquiry Versions could not be checked. Their absence does not mean they were removed.</StNotice> : null}
    {library.inquiryVersions?.length ? <StSection title="Inquiry Versions"><StRows label="Inquiry Versions">{library.inquiryVersions.map(version => <StRow key={version.id} title={`${version.businessName} · ${version.name}`} detail={<><span>Source Release {version.sourceRevision} · this Version’s Release {version.currentRelease}</span><br />{version.improvement === "blocked" ? "A source update needs a choice about local changes." : version.improvement === "auto_applicable" ? "A source update is available for review." : "Based on the accepted source revision. Local changes keep their own release."}</>} end={<StTextButton href={`/business/${encodeURIComponent(version.tenantId)}?view=patterns`}>Open {version.businessName}’s inquiry form</StTextButton>} />)}</StRows><StLabel>Updates use the existing inquiry review and testing steps. Each business owner approves going live.</StLabel></StSection> : null}</>;
}

function LibrarySource({ request, source, review, onReview, held, onChanged, reviewEnabled }: {
  reviewEnabled: boolean; request: typeof fetch; source: AgencyLibrarySource; review: ReviewState | undefined; onReview: (versionIds?: string[]) => void; held: boolean; onChanged: () => void;
}) {
  const latest = latestRevision(source);
  const readyIds = useMemo(() => reviewableVersionIds(source), [source]);
  const [bulk, setBulk] = useState(false);
  const [selection, setSelectedIds] = useState(readyIds);
  const selectedIds = selection.filter(id => readyIds.includes(id));
  const offeredReleases = reviewableVersionGroups(source).map(group => `Release ${group.revision}`).join(", ");
  const headingId = `library-source-${source.systemId}`;
  const readyClients = new Set(source.versions.filter(version => readyIds.includes(version.versionId)).map(version => version.workspaceId)).size;
  return <section className={xa.sourcePanel} aria-labelledby={headingId}>
    <div className={xa.panelHead}><h2 id={headingId}>{source.name}</h2><small>{latest ? `Release ${latest.number} · published ${new Date(latest.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "No release published yet"}</small></div>
    {latest?.summary ? <p className={xa.panelBody}>{latest.summary}</p> : null}
    <p className={xa.note}>{libraryStatusLine(source)}{source.hidden ? ". The shared source these Versions grew from stays out of the business's everyday Systems." : ""}</p>
    {source.versions.length ? <XaRows label={`Versions of ${source.name}`}>{source.versions.map(version => <VersionRow key={version.versionId} version={version} selection={bulk ? { checked: selectedIds.includes(version.versionId), disabled: held || !readyIds.includes(version.versionId) || review?.status === "running", onChange: () => setSelectedIds(current => current.includes(version.versionId) ? current.filter(id => id !== version.versionId) : [...current, version.versionId]) } : undefined} />)}</XaRows> : <p className={xa.note}>No client has a Version of this yet.</p>}
    {latest ? <div className={xa.panelFoot}>
      <p id={`${headingId}-review-note`} className={xa.note}>{readyIds.length ? `Updates ${readyIds.length} ready drafts to ${offeredReleases} and prepares a separate review for each owner. Conflicts and missing Connections are skipped. Nothing goes live until its owner approves.` : "No Version has a qualified release ready."}</p>
      {bulk ? <div className={xa.group}><p className={xa.panelBody}>{reviewableVersionGroups(source, selectedIds).map(group => source.revisions.find(revision => revision.number === group.revision)?.summary || `Release ${group.revision}`).join(" · ") || "Select a qualified improvement."}</p><p className={xa.note}>Each selected Version gets its own owner review. Ready drafts are updated now. Conflicts and missing Connections are skipped; no live client changes until its owner approves.</p></div> : null}
      <div className={xa.toolbar}>
        {bulk ? <XaButton variant="primary" disabled={held || !selectedIds.length || review?.status === "running"} busy={review?.status === "running"} onClick={() => onReview(selectedIds)}>Prepare {selectedIds.length} {selectedIds.length === 1 ? "offer" : "offers"}</XaButton>
          : <XaButton variant="primary" disabled={held || !readyIds.length} busy={review?.status === "running"} onClick={() => onReview()} aria-describedby={`${headingId}-review-note`}>Prepare offers for {readyClients} {readyClients === 1 ? "client" : "clients"}</XaButton>}
        {readyIds.length ? <XaTextLink onClick={() => setBulk(value => !value)}>{bulk ? "Close selection" : "Review selection"}</XaTextLink> : null}
      </div>
    </div> : null}
    {review ? <ReviewResult reviewEnabled={reviewEnabled} source={source} review={review} /> : null}
    <XaSays>Pebble checks each client&apos;s setup before anything is offered.</XaSays>
    <details className={xa.more}><summary>Releases and packaging</summary>
      <SystemCreator requestOverride={request} workspaceId={source.workspaceId} systemId={source.systemId} />
      {source.revisions.length ? <XaRows label={`Releases of ${source.name}`}>{[...source.revisions].sort((a, b) => b.number - a.number).map(revision => <XaRow key={revision.number} title={`Release ${revision.number} · ${revision.summary || revision.label || "No summary"}`} detail={`Published ${new Date(revision.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`} meta={source.versions.some(version => version.baselineRevision === revision.number) ? "In use" : undefined} />)}</XaRows> : <p className={xa.note}>No release published yet.</p>}
      <SourcePackageControls request={request} workspaceId={source.workspaceId} systemId={source.systemId} onChanged={onChanged} />
    </details>
  </section>;
}

function VersionRow({ version, selection }: { version: AgencyLibraryVersion; selection?: { checked: boolean; disabled: boolean; onChange: () => void } }) {
  const localChanges = version.localChanges ?? 0;
  const href = systemHref("", version.workspaceId, version.systemId);
  const stateKind = version.state === "unavailable" ? "down" : version.state === "declined" ? "draft" : version.state === "ready" ? "live" : "waits";
  const status = <>{selection && version.state !== "ready" ? "Skipped · " : ""}{versionStatusLabel(version)}</>;
  return <XaRow lead={<>{selection ? <input type="checkbox" className="h-5 w-5 accent-[var(--st-accent)]" aria-label={`Offer improvement to ${version.clientName} · ${version.context.label}`} checked={selection.checked} disabled={selection.disabled} onChange={selection.onChange} /> : null}<XaInitial name={version.clientName} color={clientColor(version.workspaceId)} size={36} /></>}
    title={version.clientName}
    detail={<><XaTextLink href={href}>{version.systemName}{version.context.label !== version.clientName ? ` · ${version.context.label}` : ""}</XaTextLink>{` · Release ${version.baselineRevision}${localChanges ? ` + ${localChanges} local ${localChanges === 1 ? "change" : "changes"}` : ""}`}{version.improvementRevision ? ` · offered Release ${version.improvementRevision}` : ""}
      {version.state === "conflicts" && version.conflicts.length ? version.conflicts.map(conflict => <span key={conflict.path} className={xa.conflict}><span><small>{version.clientName} has · {conflictPathLabel(conflict.path)}</small>{conflictValue(conflict.local)}</span><span><small>New default</small>{conflictValue(conflict.upstream)}</span></span>) : null}
      {version.state === "conflicts" && version.conflicts.length ? <span className={xa.note} style={{ display: "block", marginTop: 6 }}>The choice is made on {version.clientName}’s System. <XaTextLink href={href}>{`Open ${version.clientName}’s System`}</XaTextLink></span> : null}</>}
    meta={version.state === "up_to_date" ? "Up to date" : <XaStatus kind={stateKind} size="sm">{status}</XaStatus>} wrapOnPhone />;
}

function ReviewResult({ source, review, reviewEnabled }: { reviewEnabled: boolean; source: AgencyLibrarySource; review: ReviewState }) {
  if (review.status === "running") return <XaWorking title="Preparing an improvement for each ready Version…" steps={[]} />;
  if (review.status === "error") return <p role="alert" className={xa.inlineAlert}>{review.message}</p>;
  return <>{review.message ? <p role="alert" className={xa.inlineAlert}>{review.message}</p> : null}{review.results.map(result => <ReviewReleaseResult reviewEnabled={reviewEnabled} key={result.revision} source={source} result={result} />)}</>;
}

function ReviewReleaseResult({ source, result, reviewEnabled }: { reviewEnabled: boolean; source: AgencyLibrarySource; result: AgencyBulkReviewResult }) {
  const lines = reviewAllLines(source, result);
  const prepared = lines.filter(line => line.outcome === "prepared").length;
  return <section className={xa.group} aria-label={`${prepared} prepared for Release ${result.revision}`}><XaLabel as="h3">{prepared} prepared for Release {result.revision}</XaLabel><p role="status" className={xa.note}>Each owner approves their own.</p><XaRows label="Review all results">{lines.map(line => <XaRow key={line.versionId} title={line.clientName} detail={<>{line.outcome === "prepared" ? line.decisionId ? `Prepared. Waiting on ${line.clientName}.` : line.detail || "Draft prepared. No owner decision was returned." : reviewLineLabel(line)} {source.versions.find(version => version.versionId === line.versionId)?.systemName}</>} tone={line.outcome === "prepared" ? undefined : "waits"} action={reviewEnabled && line.decisionId && source.versions.some(version => version.versionId === line.versionId) ? <XaTextLink href={`/workspace/version-review?${new URLSearchParams({ workspaceId: line.workspaceId, systemId: source.versions.find(version => version.versionId === line.versionId)!.systemId, decisionId: line.decisionId })}`}>Open prepared review</XaTextLink> : null} />)}</XaRows></section>;
}
