"use client";
import type { RebuildView } from "./rebuild-transport";
export function WebsiteArchivedVersions({ record }: { record: RebuildView }) {
  const archives = record.legacyArchives ?? [];
  if (!archives.length && !record.legacyArchivesUnavailable) return null;
  const href = (archiveId?: string, afterArchiveId?: string) => `/api/websites/${encodeURIComponent(record.workId)}/archives${archiveId ? `/${archiveId}` : ""}?${new URLSearchParams({ workspaceId: record.workspaceId, ...(archiveId ? { download: "1" } : {}), ...(afterArchiveId ? { afterArchiveId } : {}) })}`;
  return <section aria-labelledby="legacy-versions-heading"><h2 id="legacy-versions-heading">Retained website Versions</h2>
    <p>These earlier drafts are retained for review and download. Publishing requires a separately reviewed native document.</p>
    {record.legacyArchivesUnavailable ? <p role="status">Retained Versions could not be checked. Their availability is unknown.</p> : null}
    <ul>{archives.map(archive => <li key={archive.archiveId}><span>Source revision {archive.sourceRevision} · {archive.retainedCandidates} retained candidates · {archive.unresolvedCandidates} historical bodies unavailable</span>{" "}<a href={href(archive.archiveId)}>Download retained draft and history</a></li>)}</ul>
    {record.legacyArchivesNextCursor ? <a href={href(undefined,record.legacyArchivesNextCursor)}>Read more retained capture records</a> : null}
  </section>;
}
