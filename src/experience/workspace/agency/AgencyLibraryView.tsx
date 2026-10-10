"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SourcePackageControls } from "./SourcePackageControls";
import { Button } from "@/components/ui/Button";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { loadAgencyLibrary, type AgencyBulkReviewResult, type AgencyLibrary, type AgencyLibrarySource, type AgencyLibraryVersion } from "../agency-clients";
import {
  conflictPathLabel,
  conflictValue,
  latestRevision,
  libraryStatusLine,
  reviewAllLines,
  reviewAllReady,
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

const meta = "text-[12px] leading-4 text-gray-muted";

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
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadAgencyLibrary(request, agencyWorkspaceId, controller.signal)
      .then((library) => { if (!controller.signal.aborted) setState({ status: "ready", library }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [request, agencyWorkspaceId, attempt]);

  const review = useCallback(async (source: AgencyLibrarySource) => {
    setReviews((current) => ({ ...current, [source.systemId]: { status: "running" } }));
    try {
      const result = await reviewAllReady(request, agencyWorkspaceId, source);
      setReviews((current) => ({ ...current, [source.systemId]: result
        ? { status: "done", result }
        : { status: "error", message: "No Version is ready. Nothing was sent." } }));
    } catch (cause) {
      setReviews((current) => ({ ...current, [source.systemId]: { status: "error", message: cause instanceof Error ? cause.message : "The improvements could not be prepared. Nothing was changed." } }));
    }
  }, [request, agencyWorkspaceId]);

  if (state.status === "loading") return <div role="status" aria-label="Loading the library" className="space-y-3 border-y border-gray-border py-5">
    <p className="sr-only">Loading the library…</p>
    <SkeletonLine width="w-48" height="h-3.5" /><SkeletonLine width="w-72" height="h-3" />
  </div>;
  if (state.status === "error") return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-y border-gray-border py-5">
    <p className="text-[13px] text-warm-black">The library could not be loaded. Nothing was changed.</p>
    <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => setAttempt((value) => value + 1)}>Retry</Button>
  </div>;
  if (!state.library.sources.length && !state.library.inquiryVersions?.length && !state.library.inquiryVersionsUnavailable) return <p className="border-y border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted">No sources yet. When a System is packaged as a source and adapted for a client, it appears here with each client’s Version.</p>;

  return <><ul aria-label="Sources" className="space-y-12">
    {state.library.sources.map((source) => <li key={source.systemId}>
      <LibrarySource request={request} source={source} review={reviews[source.systemId]} onReview={() => void review(source)} />
    </li>)}
  </ul><InquiryLibraryVersions library={state.library} /></>;
}

export function InquiryLibraryVersions({ library }: { library: AgencyLibrary }) {
  return <>{library.inquiryVersionsUnavailable ? <p role="status" className="mt-6 text-sm text-gray-muted">Some inquiry Versions could not be checked. Their absence does not mean they were removed.</p> : null}
    {library.inquiryVersions?.length ? <section className="mt-12" aria-label="Inquiry Versions"><h3 className="font-display text-base font-medium">Inquiry Versions</h3><ul className="mt-4">{library.inquiryVersions.map(version => <li key={version.id} className="border-b border-gray-border py-4"><strong className="text-sm font-medium">{version.businessName} · {version.name}</strong><p className="mt-2 text-xs text-gray-muted">Source revision {version.sourceRevision} · this Version’s release {version.currentRelease}</p><p className="mt-2 text-sm text-gray-muted">{version.improvement === "blocked" ? "A source update needs a choice about local changes." : version.improvement === "auto_applicable" ? "A source update is available for review." : "Based on the accepted source revision. Local changes keep their own release."}</p><a className="mt-3 inline-flex min-h-12 items-center text-sm underline underline-offset-2" href={`/business/${encodeURIComponent(version.tenantId)}?view=patterns`}>Open {version.businessName}’s inquiry form</a></li>)}</ul><p className="mt-4 text-xs text-gray-muted">Updates use the existing inquiry review and testing steps. Each business owner approves going live.</p></section> : null}</>;
}

function LibrarySource({
  request,
  source,
  review,
  onReview,
}: {
  request: typeof fetch;
  source: AgencyLibrarySource;
  review: ReviewState | undefined;
  onReview: () => void;
}) {
  const latest = latestRevision(source);
  const ready = reviewableVersionIds(source).length;
  const headingId = `library-source-${source.systemId}`;
  return <section aria-labelledby={headingId}>
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-border pb-4">
      <div className="min-w-0 max-w-xl">
        <h3 id={headingId} className="text-[16px] font-medium leading-6 text-warm-black">{source.name}</h3>
        {latest ? <p className="mt-1 text-[13px] leading-5 text-gray-muted"><span className="font-mono text-[12px] text-warm-black">Revision {latest.number}{latest.label ? ` · ${latest.label}` : ""}</span>{latest.summary ? ` · ${latest.summary}` : ""}</p> : <p className="mt-1 text-[13px] text-gray-muted">No revision published yet.</p>}
        <p className="mt-2 text-[13px] font-medium text-warm-black">{libraryStatusLine(source)}</p>
        {source.hidden ? <p className={`${meta} mt-1`}>The shared source System these Versions grew from. It stays hidden from the business’s everyday Systems.</p> : null}
      </div>
      {latest ? <Button size="sm" disabled={!ready} loading={review?.status === "running"} onClick={onReview} aria-describedby={`${headingId}-review-note`}>Review all</Button> : null}
      {latest ? <p id={`${headingId}-review-note`} className="sr-only">{ready ? `Prepares revision ${latest.number} for the ${ready} ready ${ready === 1 ? "Version" : "Versions"}. Each owner approves their own.` : "No Version is ready for this revision."}</p> : null}
    </div>

    <SourcePackageControls request={request} workspaceId={source.workspaceId} systemId={source.systemId} />
    {review ? <ReviewResult source={source} review={review} /> : null}

    {source.versions.length ? <ul aria-label={`Versions of ${source.name}`}>
      {source.versions.map((version) => <li key={version.versionId} className="border-b border-gray-border">
        <VersionRow version={version} />
      </li>)}
    </ul> : <p className="border-b border-gray-border py-4 text-[13px] text-gray-muted">No client has a Version of this yet.</p>}
  </section>;
}

function VersionRow({ version }: { version: AgencyLibraryVersion }) {
  const tone = version.state === "ready" ? "text-warm-black" : version.state === "conflicts" || version.state === "missing_accounts" ? "text-warning" : version.state === "unavailable" ? "text-critical" : "text-gray-muted";
  const href = `/workspace?${new URLSearchParams({ view: "system", system: version.systemId, workspaceId: version.workspaceId })}`;
  return <div className="px-2 py-4">
    <div className="grid gap-x-6 gap-y-1 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)] md:items-baseline">
      <span className="min-w-0">
        <strong className="text-[14px] font-medium text-warm-black">{version.clientName}</strong>
        <a className={`${meta} ml-2 underline underline-offset-2`} href={href}>{version.systemName}{version.context.label !== version.clientName ? ` · ${version.context.label}` : ""}</a>
      </span>
      <span className={`text-[12px] leading-4 ${tone}`}>{versionStatusLabel(version)}</span>
    </div>
    {version.state === "conflicts" && version.conflicts.length ? <div className="mt-3">
      <dl className="space-y-3">
        {version.conflicts.map((conflict) => <div key={conflict.path} className="rounded-xl border border-gray-border p-4">
          <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-gray-muted">{conflictPathLabel(conflict.path)}</dt>
          <dd className="mt-3 grid gap-4 sm:grid-cols-2">
            <span className="min-w-0"><small className={`${meta} block`}>{version.clientName} has</small><span className="mt-1 block break-words text-[13px] leading-5 text-warm-black">{conflictValue(conflict.local)}</span></span>
            <span className="min-w-0"><small className={`${meta} block`}>New default</small><span className="mt-1 block break-words text-[13px] leading-5 text-warm-black">{conflictValue(conflict.upstream)}</span></span>
          </dd>
        </div>)}
      </dl>
      <p className={`${meta} mt-3`}>The choice is made on {version.clientName}’s System. <a className="text-warm-black underline underline-offset-2" href={href}>Open {version.clientName}’s System</a></p>
    </div> : null}
  </div>;
}

function ReviewResult({ source, review }: { source: AgencyLibrarySource; review: ReviewState }) {
  if (review.status === "running") return <p role="status" className="py-4 text-[13px] text-gray-muted">Preparing an improvement for each ready Version…</p>;
  if (review.status === "error") return <p role="alert" className="py-4 text-[13px] text-critical">{review.message}</p>;
  const lines = reviewAllLines(source, review.result);
  const prepared = lines.filter((line) => line.outcome === "prepared").length;
  return <div role="status" className="border-b border-gray-border py-4">
    <p className="text-[13px] font-medium text-warm-black">{prepared} prepared for revision {review.result.revision}. Each owner approves their own.</p>
    <ul aria-label="Review all results" className="mt-3 space-y-2">
      {lines.map((line) => <li key={line.versionId} className="grid gap-x-6 gap-y-0.5 text-[12px] leading-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <span className="font-medium text-warm-black">{line.clientName}</span>
        <span className={line.outcome === "failed" ? "text-critical" : line.outcome === "prepared" ? "text-warm-black" : "text-gray-muted"}>{reviewLineLabel(line)}</span>
      </li>)}
    </ul>
  </div>;
}
