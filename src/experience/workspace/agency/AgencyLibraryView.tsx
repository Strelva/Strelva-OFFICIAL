"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  versionStatusLabel,
} from "../agency-home";

type LibraryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; library: AgencyLibrary };

type ReviewState =
  | { status: "running" }
  | { status: "done"; result: AgencyBulkReviewResult }
  | { status: "error"; message: string };

const meta = "text-xs leading-5 text-gray-muted";

/**
 * Library: the agency's sources and where each client Version stands against
 * the latest revision. Conflicts are read here; the choice happens on the
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
  const reviewing = useRef(new Set<string>());
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadAgencyLibrary(request, agencyWorkspaceId, controller.signal)
      .then((library) => { if (!controller.signal.aborted) setState({ status: "ready", library }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [request, agencyWorkspaceId, attempt]);

  const review = useCallback(async (source: AgencyLibrarySource, versionIds = reviewableVersionIds(source)) => {
    if (reviewing.current.has(source.systemId)) return;
    reviewing.current.add(source.systemId);
    setReviews((current) => ({ ...current, [source.systemId]: { status: "running" } }));
    try {
      const revision = latestRevision(source);
      const selectedReady = versionIds.filter(id => reviewableVersionIds(source).includes(id));
      const result = revision && selectedReady.length ? await reviewAllImprovements(request, { agencyWorkspaceId, sourceSystemId: source.systemId, revision: revision.number, versionIds: selectedReady }) : null;
      setReviews((current) => ({ ...current, [source.systemId]: result
        ? { status: "done", result }
        : { status: "error", message: "No Version is ready. Nothing was sent." } }));
    } catch (cause) {
      setReviews((current) => ({ ...current, [source.systemId]: { status: "error", message: cause instanceof Error ? cause.message : "The improvements could not be prepared. Nothing was changed." } }));
    } finally { reviewing.current.delete(source.systemId); }
  }, [request, agencyWorkspaceId]);

  if (state.status === "loading") return <div className="space-y-4" role="status" aria-label="Loading the library"><StSkeleton width="48%" label="Loading the library" /><StSkeleton width="72%" /></div>;
  if (state.status === "error") return <StNotice tone="critical"><p>The library could not be loaded. Nothing was changed.</p><StTextButton onClick={() => setAttempt(value => value + 1)}>Retry</StTextButton></StNotice>;
  if (!state.library.sources.length && !state.library.inquiryVersions?.length && !state.library.inquiryVersionsUnavailable) return <StEmpty>No sources yet. When a System is packaged as a source and adapted for a client, it appears here with each client’s Version.</StEmpty>;
  const selectedSource = state.library.sources.find(source => source.systemId === selectedSourceId) ?? state.library.sources[0];
  return <div className="space-y-9"><p className="text-sm text-gray-muted">Library holds your sources. Qualified revisions shared with clients appear in their Ready-made systems. Each client gets its own Version, records, Connections and approval.</p>
    {selectedSource ? <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1fr)]">
      <StRows label="Sources">{state.library.sources.map(source => <StRow key={source.systemId} title={source.name} detail={latestRevision(source)?.summary || "No revision published yet"} selected={source.systemId === selectedSource.systemId} onClick={() => setSelectedSourceId(source.systemId)} end={<StMono>{latestRevision(source) ? `r${latestRevision(source)!.number}` : "Draft"} · {source.versions.length} {source.versions.length === 1 ? "use" : "uses"}</StMono>} />)}</StRows>
      <LibrarySource key={selectedSource.systemId} request={request} source={selectedSource} review={reviews[selectedSource.systemId]} onReview={ids => void review(selectedSource, ids)} />
    </div> : null}
    <InquiryLibraryVersions library={state.library} />
  </div>;
}

export function InquiryLibraryVersions({ library }: { library: AgencyLibrary }) {
  return <>{library.inquiryVersionsUnavailable ? <StNotice>Some inquiry Versions could not be checked. Their absence does not mean they were removed.</StNotice> : null}
    {library.inquiryVersions?.length ? <StSection title="Inquiry Versions"><StRows label="Inquiry Versions">{library.inquiryVersions.map(version => <StRow key={version.id} title={`${version.businessName} · ${version.name}`} detail={<><span>Source revision {version.sourceRevision} · this Version’s release {version.currentRelease}</span><br />{version.improvement === "blocked" ? "A source update needs a choice about local changes." : version.improvement === "auto_applicable" ? "A source update is available for review." : "Based on the accepted source revision. Local changes keep their own release."}</>} end={<StTextButton href={`/business/${encodeURIComponent(version.tenantId)}?view=patterns`}>Open {version.businessName}’s inquiry form</StTextButton>} />)}</StRows><StLabel>Updates use the existing inquiry review and testing steps. Each business owner approves going live.</StLabel></StSection> : null}</>;
}

function LibrarySource({ request, source, review, onReview }: {
  request: typeof fetch; source: AgencyLibrarySource; review: ReviewState | undefined; onReview: (versionIds?: string[]) => void;
}) {
  const latest = latestRevision(source);
  const readyIds = reviewableVersionIds(source);
  const [bulk, setBulk] = useState(false);
  const [selectedIds, setSelectedIds] = useState(readyIds);
  const headingId = `library-source-${source.systemId}`;
  const readyClients = new Set(source.versions.filter(version => readyIds.includes(version.versionId)).map(version => version.workspaceId)).size;
  return <div className="space-y-7">
    <StSection title={source.name} id={headingId} action={latest ? <StPill variant="soft" disabled={!readyIds.length} busy={review?.status === "running"} onClick={() => onReview()} aria-describedby={`${headingId}-review-note`}>Prepare offers for {readyClients} {readyClients === 1 ? "client" : "clients"}</StPill> : null}>
      <SystemCreator requestOverride={request} workspaceId={source.workspaceId} systemId={source.systemId} /><StLabel>{libraryStatusLine(source)}</StLabel>
      {source.hidden ? <StLabel>The shared source System these Versions grew from. It stays hidden from the business’s everyday Systems.</StLabel> : null}
      {latest ? <p id={`${headingId}-review-note`} className="text-sm text-gray-muted">{readyIds.length ? `Updates ${readyIds.length} ready drafts to source revision ${latest.number} and prepares a separate review for each owner. Conflicts and missing Connections are skipped. Nothing goes live until its owner approves.` : "No Version is ready for this revision."}</p> : null}
    </StSection>
    <StSection title="Revisions"><StRows label={`Revisions of ${source.name}`}>{[...source.revisions].sort((a, b) => b.number - a.number).map(revision => <StRow key={revision.number} lead={<StMono tone="text">r{revision.number}</StMono>} title={revision.summary || revision.label || `Source revision ${revision.number}`} detail={<>Published <StMono as="time" dateTime={revision.publishedAt}>{new Date(revision.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</StMono></>} end={<StState kind={source.versions.some(version => version.baselineRevision === revision.number) ? "live" : "draft"}>{source.versions.some(version => version.baselineRevision === revision.number) ? "In use" : "Published"}</StState>} />)}</StRows>{!source.revisions.length ? <StEmpty>No revision published yet.</StEmpty> : null}</StSection>
    <StSection title="Client Versions" action={latest && readyIds.length ? <StTextButton onClick={() => setBulk(value => !value)}>{bulk ? "Close selection" : "Review selection"}</StTextButton> : null}>
      {source.versions.length ? <StRows label={`Versions of ${source.name}`}>{source.versions.map(version => <VersionRow key={version.versionId} version={version} selection={bulk ? { checked: selectedIds.includes(version.versionId), disabled: version.state !== "ready" || review?.status === "running", onChange: () => setSelectedIds(current => current.includes(version.versionId) ? current.filter(id => id !== version.versionId) : [...current, version.versionId]) } : undefined} />)}</StRows> : <StEmpty>No client has a Version of this yet.</StEmpty>}
    </StSection>
    {bulk ? <StSurface label="Prepare selected improvements"><div className="flex flex-wrap items-center justify-between gap-4"><div className="max-w-sm space-y-2"><StLabel>What each owner will read</StLabel><p className="text-sm">{latest?.summary || "Review this source improvement."}</p><StLabel>Each selected Version gets its own Needs you item. Ready drafts are updated now. Conflicts and missing Connections are skipped; no live client changes until its owner approves.</StLabel></div><StPill disabled={!selectedIds.length || review?.status === "running"} busy={review?.status === "running"} onClick={() => onReview(selectedIds)}>Prepare {selectedIds.length} {selectedIds.length === 1 ? "offer" : "offers"}</StPill></div></StSurface> : null}
    {review ? <ReviewResult source={source} review={review} /> : null}
    <SourcePackageControls request={request} workspaceId={source.workspaceId} systemId={source.systemId} />
  </div>;
}

function VersionRow({ version, selection }: { version: AgencyLibraryVersion; selection?: { checked: boolean; disabled: boolean; onChange: () => void } }) {
  const href = systemHref("", version.workspaceId, version.systemId);
  const stateKind = version.state === "up_to_date" ? "live" : version.state === "unavailable" ? "down" : version.state === "declined" ? "draft" : "need";
  return <StRow align="start" lead={selection ? <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--st-accent)]" aria-label={`Offer improvement to ${version.clientName} · ${version.context.label}`} checked={selection.checked} disabled={selection.disabled} onChange={selection.onChange} /> : null} title={version.clientName} detail={<><StTextButton href={href}>{version.systemName}{version.context.label !== version.clientName ? ` · ${version.context.label}` : ""}</StTextButton><br /><StMono>r{version.baselineRevision}{version.conflicts.length ? ` + ${version.conflicts.length} local` : ""}</StMono></>} end={<StState kind={stateKind}>{selection && version.state !== "ready" ? "Skipped · " : ""}{versionStatusLabel(version)}</StState>}>
    {version.state === "conflicts" && version.conflicts.length ? <div className="mt-3 space-y-3">{version.conflicts.map(conflict => <div key={conflict.path} className="space-y-2"><StLabel>{conflictPathLabel(conflict.path)}</StLabel><div className="grid gap-4 sm:grid-cols-2"><span><StLabel>{version.clientName} has</StLabel><span className="text-sm">{conflictValue(conflict.local)}</span></span><span><StLabel>New default</StLabel><span className="text-sm">{conflictValue(conflict.upstream)}</span></span></div></div>)}<p className={meta}>The choice is made on {version.clientName}’s System. <StTextButton href={href}>Open {version.clientName}’s System</StTextButton></p></div> : null}
  </StRow>;
}

function ReviewResult({ source, review }: { source: AgencyLibrarySource; review: ReviewState }) {
  if (review.status === "running") return <div role="status"><StLabel>Preparing an improvement for each ready Version…</StLabel><StSkeleton /></div>;
  if (review.status === "error") return <StNotice tone="critical">{review.message}</StNotice>;
  const lines = reviewAllLines(source, review.result);
  const prepared = lines.filter(line => line.outcome === "prepared").length;
  return <StSection title={`${prepared} prepared for revision ${review.result.revision}`}><p role="status" className="text-sm text-gray-muted">Each owner approves their own.</p><StRows label="Review all results">{lines.map(line => <StRow key={line.versionId} title={line.clientName} detail={<>{line.outcome === "prepared" ? line.decisionId ? `Prepared. Waiting on ${line.clientName}.` : line.detail || "Draft prepared. No owner decision was returned." : reviewLineLabel(line)}<br />{source.versions.find(version => version.versionId === line.versionId)?.systemName}</>} end={line.decisionId && source.versions.some(version => version.versionId === line.versionId) ? <StTextButton href={`/workspace/version-review?${new URLSearchParams({ workspaceId: line.workspaceId, systemId: source.versions.find(version => version.versionId === line.versionId)!.systemId, decisionId: line.decisionId })}`}>Open prepared review</StTextButton> : null} lead={<StState kind={line.outcome === "prepared" ? "live" : line.outcome === "failed" ? "down" : "need"}>{line.outcome === "prepared" ? "Prepared" : line.outcome === "failed" ? "Could not prepare" : "Skipped"}</StState>} />)}</StRows></StSection>;
}
