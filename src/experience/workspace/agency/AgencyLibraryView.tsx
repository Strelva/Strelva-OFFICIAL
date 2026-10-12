"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SystemCreator } from "@/experience/systems/SystemCreator";
import { systemHref } from "@/experience/systems/model";
import { SourcePackageControls } from "./SourcePackageControls";
import { StEmpty, StLabel, StMono, StNotice, StPill, StRow, StRows, StSection, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { loadAgencyLibrary, reviewAllImprovements, type AgencyBulkReviewResult, type AgencyLibrary, type AgencyLibrarySource, type AgencyLibraryVersion } from "../agency-clients";
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
  | { status: "error" }
  | { status: "ready"; library: AgencyLibrary };

type ReviewState =
  | { status: "running" }
  | { status: "done"; results: AgencyBulkReviewResult[]; message?: string }
  | { status: "error"; message: string };

const meta = "text-xs leading-5 text-gray-muted";

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
    } catch {
      if (!controller.signal.aborted && current === generation.current && scope.current === agencyWorkspaceId) {
        setState(previous => previous.status === "ready" ? previous : { status: "error" });
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
    void refresh();
    const active = controllers.current;
    const sequence = generation;
    return () => { scope.current = ""; ++sequence.current; for (const controller of active) controller.abort(); active.clear(); };
  }, [agencyWorkspaceId, refresh, attempt]);

  const review = useCallback(async (source: AgencyLibrarySource, versionIds = reviewableVersionIds(source)) => {
    if (reviewing.current.has(source.systemId) || refreshing || refreshError) return;
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
  }, [request, agencyWorkspaceId, refresh, refreshing, refreshError]);

  if (state.status === "loading") return <div className="space-y-4" role="status" aria-label="Loading the library"><StSkeleton width="48%" label="Loading the library" /><StSkeleton width="72%" /></div>;
  if (state.status === "error") return <StNotice tone="critical"><p>The library could not be loaded. Nothing was changed.</p><StTextButton onClick={() => setAttempt(value => value + 1)}>Retry</StTextButton></StNotice>;
  if (!state.library.sources.length && !state.library.inquiryVersions?.length && !state.library.inquiryVersionsUnavailable) return <div className="space-y-4"><StTextButton disabled={refreshing} onClick={() => void refresh()}>Refresh Library</StTextButton><StEmpty>No sources yet. When a System is packaged as a source and adapted for a client, it appears here with each client’s Version.</StEmpty>{refreshError ? <StNotice tone="critical">{refreshError}</StNotice> : null}</div>;
  const selectedSource = state.library.sources.find(source => source.systemId === selectedSourceId) ?? state.library.sources[0];
  return <div className="space-y-9"><div><StTextButton disabled={refreshing || Object.values(reviews).some(review => review.status === "running")} onClick={() => void refresh()}>Refresh Library</StTextButton>{refreshing ? <p role="status" className="text-sm text-gray-muted">Refreshing the Library…</p> : null}{refreshError ? <StNotice tone="critical">{refreshError}</StNotice> : null}</div><p className="text-sm text-gray-muted">Library holds your sources. Qualified releases shared with clients appear in their Ready-made systems. Each client gets its own Version, records, Connections and approval.</p>
    {selectedSource ? <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1fr)]">
      <StRows label="Sources">{state.library.sources.map(source => <StRow key={source.systemId} title={source.name} detail={latestRevision(source)?.summary || "No release published yet"} selected={source.systemId === selectedSource.systemId} onClick={() => setSelectedSourceId(source.systemId)} end={<StMono>{latestRevision(source) ? `Release ${latestRevision(source)!.number}` : "Draft"} · {source.versions.length} {source.versions.length === 1 ? "use" : "uses"}</StMono>} />)}</StRows>
      <LibrarySource key={selectedSource.systemId} request={request} source={selectedSource} review={reviews[selectedSource.systemId]} held={refreshing || Boolean(refreshError)} onChanged={() => void refresh()} onReview={ids => void review(selectedSource, ids)} />
    </div> : null}
    <InquiryLibraryVersions library={state.library} />
  </div>;
}

export function InquiryLibraryVersions({ library }: { library: AgencyLibrary }) {
  return <>{library.inquiryVersionsUnavailable ? <StNotice>Some inquiry Versions could not be checked. Their absence does not mean they were removed.</StNotice> : null}
    {library.inquiryVersions?.length ? <StSection title="Inquiry Versions"><StRows label="Inquiry Versions">{library.inquiryVersions.map(version => <StRow key={version.id} title={`${version.businessName} · ${version.name}`} detail={<><span>Source Release {version.sourceRevision} · this Version’s Release {version.currentRelease}</span><br />{version.improvement === "blocked" ? "A source update needs a choice about local changes." : version.improvement === "auto_applicable" ? "A source update is available for review." : "Based on the accepted source revision. Local changes keep their own release."}</>} end={<StTextButton href={`/business/${encodeURIComponent(version.tenantId)}?view=patterns`}>Open {version.businessName}’s inquiry form</StTextButton>} />)}</StRows><StLabel>Updates use the existing inquiry review and testing steps. Each business owner approves going live.</StLabel></StSection> : null}</>;
}

function LibrarySource({ request, source, review, onReview, held, onChanged }: {
  request: typeof fetch; source: AgencyLibrarySource; review: ReviewState | undefined; onReview: (versionIds?: string[]) => void; held: boolean; onChanged: () => void;
}) {
  const latest = latestRevision(source);
  const readyIds = useMemo(() => reviewableVersionIds(source), [source]);
  const [bulk, setBulk] = useState(false);
  const [selection, setSelectedIds] = useState(readyIds);
  const selectedIds = selection.filter(id => readyIds.includes(id));
  const offeredReleases = reviewableVersionGroups(source).map(group => `Release ${group.revision}`).join(", ");
  const headingId = `library-source-${source.systemId}`;
  const readyClients = new Set(source.versions.filter(version => readyIds.includes(version.versionId)).map(version => version.workspaceId)).size;
  return <div className="space-y-7">
    <StSection title={source.name} id={headingId} action={latest ? <StPill variant="soft" disabled={held || !readyIds.length} busy={review?.status === "running"} onClick={() => onReview()} aria-describedby={`${headingId}-review-note`}>Prepare offers for {readyClients} {readyClients === 1 ? "client" : "clients"}</StPill> : null}>
      <SystemCreator requestOverride={request} workspaceId={source.workspaceId} systemId={source.systemId} /><StLabel>{libraryStatusLine(source)}</StLabel>
      {source.hidden ? <StLabel>The shared source System these Versions grew from. It stays hidden from the business’s everyday Systems.</StLabel> : null}
      {latest ? <p id={`${headingId}-review-note`} className="text-sm text-gray-muted">{readyIds.length ? `Updates ${readyIds.length} ready drafts to ${offeredReleases} and prepares a separate review for each owner. Conflicts and missing Connections are skipped. Nothing goes live until its owner approves.` : "No Version has a qualified release ready."}</p> : null}
    </StSection>
    <StSection title="Releases"><StRows label={`Releases of ${source.name}`}>{[...source.revisions].sort((a, b) => b.number - a.number).map(revision => <StRow key={revision.number} lead={<StMono tone="text">Release {revision.number}</StMono>} title={revision.summary || revision.label || `Release ${revision.number}`} detail={<>Published <StMono as="time" dateTime={revision.publishedAt}>{new Date(revision.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</StMono></>} end={<StState kind={source.versions.some(version => version.baselineRevision === revision.number) ? "live" : "draft"}>{source.versions.some(version => version.baselineRevision === revision.number) ? "In use" : "Published"}</StState>} />)}</StRows>{!source.revisions.length ? <StEmpty>No release published yet.</StEmpty> : null}</StSection>
    <StSection title="Client Versions" action={latest && readyIds.length ? <StTextButton onClick={() => setBulk(value => !value)}>{bulk ? "Close selection" : "Review selection"}</StTextButton> : null}>
      {source.versions.length ? <StRows label={`Versions of ${source.name}`}>{source.versions.map(version => <VersionRow key={version.versionId} version={version} selection={bulk ? { checked: selectedIds.includes(version.versionId), disabled: held || !readyIds.includes(version.versionId) || review?.status === "running", onChange: () => setSelectedIds(current => current.includes(version.versionId) ? current.filter(id => id !== version.versionId) : [...current, version.versionId]) } : undefined} />)}</StRows> : <StEmpty>No client has a Version of this yet.</StEmpty>}
    </StSection>
    {bulk ? <StSurface label="Prepare selected improvements"><div className="flex flex-wrap items-center justify-between gap-4"><div className="max-w-sm space-y-2"><StLabel>What each owner will read</StLabel><p className="text-sm">{reviewableVersionGroups(source, selectedIds).map(group => source.revisions.find(revision => revision.number === group.revision)?.summary || `Release ${group.revision}`).join(" · ") || "Select a qualified improvement."}</p><StLabel>Each selected Version gets its own Needs you item. Ready drafts are updated now. Conflicts and missing Connections are skipped; no live client changes until its owner approves.</StLabel></div><StPill disabled={held || !selectedIds.length || review?.status === "running"} busy={review?.status === "running"} onClick={() => onReview(selectedIds)}>Prepare {selectedIds.length} {selectedIds.length === 1 ? "offer" : "offers"}</StPill></div></StSurface> : null}
    {review ? <ReviewResult source={source} review={review} /> : null}
    <SourcePackageControls request={request} workspaceId={source.workspaceId} systemId={source.systemId} onChanged={onChanged} />
  </div>;
}

function VersionRow({ version, selection }: { version: AgencyLibraryVersion; selection?: { checked: boolean; disabled: boolean; onChange: () => void } }) {
  const localChanges = version.localChanges ?? 0;
  const href = systemHref("", version.workspaceId, version.systemId);
  const stateKind = version.state === "up_to_date" ? "live" : version.state === "unavailable" ? "down" : version.state === "declined" ? "draft" : "need";
  return <StRow align="start" lead={selection ? <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--st-accent)]" aria-label={`Offer improvement to ${version.clientName} · ${version.context.label}`} checked={selection.checked} disabled={selection.disabled} onChange={selection.onChange} /> : null} title={version.clientName} detail={<><StTextButton href={href}>{version.systemName}{version.context.label !== version.clientName ? ` · ${version.context.label}` : ""}</StTextButton><br /><StMono>Release {version.baselineRevision}{localChanges ? ` + ${localChanges} local ${localChanges === 1 ? "change" : "changes"}` : ""}</StMono>{version.improvementRevision ? <><br /><span>Offered Release {version.improvementRevision}</span></> : null}</>} end={<StState kind={stateKind}>{selection && version.state !== "ready" ? "Skipped · " : ""}{versionStatusLabel(version)}</StState>}>
    {version.state === "conflicts" && version.conflicts.length ? <div className="mt-3 space-y-3">{version.conflicts.map(conflict => <div key={conflict.path} className="space-y-2"><StLabel>{conflictPathLabel(conflict.path)}</StLabel><div className="grid gap-4 sm:grid-cols-2"><span><StLabel>{version.clientName} has</StLabel><span className="text-sm">{conflictValue(conflict.local)}</span></span><span><StLabel>New default</StLabel><span className="text-sm">{conflictValue(conflict.upstream)}</span></span></div></div>)}<p className={meta}>The choice is made on {version.clientName}’s System. <StTextButton href={href}>Open {version.clientName}’s System</StTextButton></p></div> : null}
  </StRow>;
}

function ReviewResult({ source, review }: { source: AgencyLibrarySource; review: ReviewState }) {
  if (review.status === "running") return <div role="status"><StLabel>Preparing an improvement for each ready Version…</StLabel><StSkeleton /></div>;
  if (review.status === "error") return <StNotice tone="critical">{review.message}</StNotice>;
  return <>{review.message ? <StNotice tone="critical">{review.message}</StNotice> : null}{review.results.map(result => <ReviewReleaseResult key={result.revision} source={source} result={result} />)}</>;
}

function ReviewReleaseResult({ source, result }: { source: AgencyLibrarySource; result: AgencyBulkReviewResult }) {
  const lines = reviewAllLines(source, result);
  const prepared = lines.filter(line => line.outcome === "prepared").length;
  return <StSection title={`${prepared} prepared for Release ${result.revision}`}><p role="status" className="text-sm text-gray-muted">Each owner approves their own.</p><StRows label="Review all results">{lines.map(line => <StRow key={line.versionId} title={line.clientName} detail={<>{line.outcome === "prepared" ? line.decisionId ? `Prepared. Waiting on ${line.clientName}.` : line.detail || "Draft prepared. No owner decision was returned." : reviewLineLabel(line)}<br />{source.versions.find(version => version.versionId === line.versionId)?.systemName}</>} end={line.decisionId && source.versions.some(version => version.versionId === line.versionId) ? <StTextButton href={`/workspace/version-review?${new URLSearchParams({ workspaceId: line.workspaceId, systemId: source.versions.find(version => version.versionId === line.versionId)!.systemId, decisionId: line.decisionId })}`}>Open prepared review</StTextButton> : null} lead={<StState kind={line.outcome === "prepared" ? "live" : line.outcome === "failed" ? "down" : "need"}>{line.outcome === "prepared" ? "Prepared" : line.outcome === "failed" ? "Could not prepare" : "Skipped"}</StState>} />)}</StRows></StSection>;
}
