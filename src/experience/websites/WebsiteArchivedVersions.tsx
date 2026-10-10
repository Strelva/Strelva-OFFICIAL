"use client";
import { StSection, StRows, StRow, StMono, StNotice, StTextButton } from "@/components/ui/strelva/Kit";
import type { RebuildView } from "./rebuild-transport";
export function WebsiteArchivedVersions({ record }: { record: RebuildView }) {
  const archives = record.legacyArchives ?? [];
  if (!archives.length && !record.legacyArchivesUnavailable) return null;
  const href = (archiveId?: string, afterArchiveId?: string) => `/api/websites/${encodeURIComponent(record.workId)}/archives${archiveId ? `/${archiveId}` : ""}?${new URLSearchParams({ workspaceId: record.workspaceId, ...(archiveId ? { download: "1" } : {}), ...(afterArchiveId ? { afterArchiveId } : {}) })}`;
  return <StSection id="legacy-versions-heading" title="Retained website drafts">
    <p>These earlier drafts are retained for review and download. Publishing requires a separately reviewed native document.</p>
    {record.legacyArchivesUnavailable ? <div role="status"><StNotice>Retained drafts could not be checked. Their availability is unknown.</StNotice></div> : null}
    <StRows label="Retained website drafts">{archives.map(archive => <StRow key={archive.archiveId} title={<>Source revision <StMono>{archive.sourceRevision}</StMono></>} detail={<><StMono>{archive.retainedCandidates}</StMono> retained candidates · <StMono>{archive.unresolvedCandidates}</StMono> historical bodies unavailable</>} end={<StTextButton href={href(archive.archiveId)}>Download draft and history</StTextButton>} />)}</StRows>
    {record.legacyArchivesNextCursor ? <StTextButton href={href(undefined,record.legacyArchivesNextCursor)}>Read more retained capture records</StTextButton> : null}
  </StSection>;
}
