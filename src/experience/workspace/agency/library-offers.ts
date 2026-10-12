import { versionStatusLabel } from "../agency-home";
import type { AgencyClientsPage, AgencyLibrary, AgencyQueueItem } from "../agency-clients";

/** The Library's exact qualified comparison is the only cross-client offer. */
export function projectAgencyLibraryOffers(page: AgencyClientsPage, library: AgencyLibrary | null): AgencyClientsPage {
  if (library?.agencyWorkspaceId !== page.agencyWorkspaceId) library = null;
  const queue = page.queue.filter(item => item.kind !== "improvement");
  const gaps = [...(page.queueGaps ?? [])];
  const clients = page.clients.map(client => {
    if (client.status !== "ready" || !library) {
      gaps.push(`${client.name}: improvements could not be read.`);
      return { ...client, improvementsWaiting: 0, improvementsStatus: "unavailable" as const };
    }
    const allowed = new Set(client.systems.map(system => system.id));
    const offers = new Map<string, AgencyQueueItem>();
    let unavailable = false;
    for (const source of library.sources) {
      for (const version of source.versions) {
        if (version.workspaceId !== client.workspaceId || !allowed.has(version.systemId)) continue;
        if (version.state === "unavailable") { unavailable = true; continue; }
        if (!["ready", "conflicts", "missing_accounts"].includes(version.state) || !version.improvementRevision) continue;
        const revision = source.revisions.find(item => item.number === version.improvementRevision);
        if (!revision) { unavailable = true; continue; }
        const id = `improvement:${version.versionId}:${revision.number}`;
        offers.set(id, {
          id, kind: "improvement", workspaceId: client.workspaceId, clientName: client.name,
          title: `${version.systemName}: Release ${revision.number} · ${revision.summary}`.slice(0, 300),
          systemId: version.systemId, workId: null, since: revision.publishedAt,
          label: versionStatusLabel(version),
          href: `/workspace?${new URLSearchParams({ workspaceId: client.workspaceId, view: "system", system: version.systemId })}`,
        });
      }
    }
    queue.push(...offers.values());
    if (unavailable) gaps.push(`${client.name}: some improvements could not be read.`);
    return { ...client, improvementsWaiting: offers.size, improvementsStatus: unavailable ? "unavailable" as const : "ready" as const };
  });
  return { ...page, clients, queue, queueGaps: [...new Set(gaps)], queueComplete: !page.nextCursor && gaps.length === 0 };
}
