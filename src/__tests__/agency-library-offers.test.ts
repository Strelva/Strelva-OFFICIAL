import { describe, expect, it } from "vitest";
import { projectAgencyLibraryOffers } from "@/experience/workspace/agency/library-offers";
import type { AgencyClientsPage, AgencyLibrary, AgencyLibraryVersion } from "@/experience/workspace/agency-clients";

const agency = "11111111-1111-4111-8111-111111111111", business = "22222222-2222-4222-8222-222222222222";
const system = "33333333-3333-4333-8333-333333333333", otherSystem = "44444444-4444-4444-8444-444444444444";
const at = "2026-10-12T00:00:00Z";
function version(extra: Partial<AgencyLibraryVersion> = {}): AgencyLibraryVersion {
  return { versionId: "version", workspaceId: business, clientName: "Harbor", systemId: system, systemName: "Intake", context: { kind: "agency_client", label: "Harbor" }, baselineRevision: 1, currentRelease: null, improvementRevision: 2, state: "ready", conflicts: [], missingBindings: [], declinedReason: null, ...extra };
}
function library(versions: AgencyLibraryVersion[]): AgencyLibrary {
  return { agencyWorkspaceId: agency, sources: [{ systemId: otherSystem, workspaceId: agency, name: "Intake source", hidden: false, revisions: [{ number: 2, label: null, summary: "Improved intake", publishedAt: at }], versions }] };
}
function page(): AgencyClientsPage {
  return { agencyWorkspaceId: agency, clients: [{ workspaceId: business, name: "Harbor", reach: "agency", role: "agency", provider: true, status: "ready", systems: [system, otherSystem].map(id => ({ id, name: "Intake", kind: "internal_app", lifecycle: "draft", versionContext: "Harbor" })), needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 99, lastReceiptAt: null }], queue: [{ id: "request:1", kind: "request", workspaceId: business, clientName: "Harbor", title: "Request retained", systemId: null, workId: null, since: at }], team: [], total: 1, nextCursor: null, providersRead: true };
}

describe("qualified Library offers across clients", () => {
  it("preserves a qualified offer beside a failed comparison and marks the count partial", () => {
    const input = page();
    const result = projectAgencyLibraryOffers(input, library([version(), version({ versionId: "unreadable", systemId: otherSystem, state: "unavailable", improvementRevision: null })]));
    expect(result.queue[0]).toEqual(input.queue[0]);
    expect(result.queue[1]).toMatchObject({ id: "improvement:version:2", systemId: system });
    expect(result.clients[0]).toMatchObject({ improvementsWaiting: 1, improvementsStatus: "unavailable" });
    expect(result.queueComplete).toBe(false);
    expect(result.queueGaps).toEqual(["Harbor: some improvements could not be read."]);
  });
  it("never projects another page, client or System even if source lineage is readable", () => {
    const input = page(); input.nextCursor = "next"; input.total = 2;
    const result = projectAgencyLibraryOffers(input, library([version({ workspaceId: agency }), version({ systemId: agency }), version()]));
    expect(result.queue.filter(item => item.kind === "improvement")).toHaveLength(1);
    expect(result.clients[0]!.improvementsWaiting).toBe(1);
    expect(result.queueComplete).toBe(false);
  });
  it("rejects a library for another agency while retaining ordinary service rows", () => {
    const input = page();
    const result = projectAgencyLibraryOffers(input, { ...library([version()]), agencyWorkspaceId: business });
    expect(result.queue).toEqual(input.queue);
    expect(result.clients[0]).toMatchObject({ improvementsWaiting: 0, improvementsStatus: "unavailable" });
    expect(result.queueComplete).toBe(false);
  });
  it("does not invent release metadata when the qualified revision cannot be found", () => {
    const input = library([version()]); input.sources[0]!.revisions = [];
    const result = projectAgencyLibraryOffers(page(), input);
    expect(result.queue.filter(item => item.kind === "improvement")).toEqual([]);
    expect(result.clients[0]!.improvementsStatus).toBe("unavailable");
  });
  it("deduplicates an exact Version offer and withholds unreadable clients", () => {
    expect(projectAgencyLibraryOffers(page(), library([version(), version()])).clients[0]!.improvementsWaiting).toBe(1);
    const input = page(); input.clients[0]!.status = "unavailable";
    const result = projectAgencyLibraryOffers(input, library([version()]));
    expect(result.queue.filter(item => item.kind === "improvement")).toEqual([]);
    expect(result.clients[0]!.improvementsWaiting).toBe(0);
    expect(result.queueComplete).toBe(false);
  });
});
