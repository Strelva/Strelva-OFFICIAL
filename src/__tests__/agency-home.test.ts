import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgencyHome } from "@/experience/workspace/AgencyHome";
import {
  agencyQueueOrder,
  loadAgencyClients,
  type AgencyClientRow,
  type AgencyClientsPage,
  type AgencyLibrarySource,
  type AgencyQueueItem,
} from "@/experience/workspace/agency-clients";
import {
  agencyCreditPeriods,
  clientSystemLabel,
  combineAgencyPages,
  lastReceiptLabel,
  libraryStatusLine,
  missingAccountsLabel,
  needsYouLabel,
  reviewAllLines,
  reviewAllReady,
  reviewLineLabel,
  reviewableVersionIds,
} from "@/experience/workspace/agency-home";
import type { WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";
import type { WorkAllowanceInspection } from "@/platform/work-economics/allowances";

const AGENCY = "11111111-1111-4111-8111-111111111111";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const uuid = (prefix: string, index: number) => `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;

function work(id: string, workspaceId: string, extra: Partial<WorkspaceWork> = {}): WorkspaceWork {
  return { id, workspaceId, title: id, productId: "documents", resourceKind: "document", payload: null, input: {}, createdAt: "2026-09-15T12:00:00.000Z", ...extra };
}

function snapshot(extra: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    actor: { email: "agency@example.com", localPreview: false },
    workspaceId: AGENCY,
    workspaces: [
      { id: AGENCY, kind: "agency", name: "North Studio", access: "member" },
      { id: CLIENT, kind: "customer", name: "Harbor Dental", access: "delegated_read" },
    ],
    work: [], handoffs: [], delegations: [], products: [],
    ...extra,
  };
}

function row(index: number, extra: Partial<AgencyClientRow> = {}): AgencyClientRow {
  return {
    workspaceId: uuid("c0000000", index), name: `Client ${index}`, reach: "member", role: "admin", provider: true, status: "ready",
    systems: [{ id: uuid("51000000", index), name: `client${index}.example`, kind: "website", lifecycle: "live", versionContext: null }],
    needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null,
    ...extra,
  };
}

function page(clients: AgencyClientRow[], extra: Partial<AgencyClientsPage> = {}): AgencyClientsPage {
  return { agencyWorkspaceId: AGENCY, clients, queue: [], team: [], total: clients.length, nextCursor: null, providersRead: true, ...extra };
}

function queueItem(id: string, since: string, extra: Partial<AgencyQueueItem> = {}): AgencyQueueItem {
  return { id, kind: "request", workspaceId: CLIENT, clientName: "Harbor Dental", title: id, systemId: null, workId: null, since, ...extra };
}

function source(): AgencyLibrarySource {
  const version = (id: string, clientName: string, state: AgencyLibrarySource["versions"][number]["state"], extra: Partial<AgencyLibrarySource["versions"][number]> = {}) => ({
    versionId: id, workspaceId: uuid("c0000000", id.length), clientName, systemId: uuid("52000000", id.length), systemName: "Inquiry intake",
    context: { kind: "agency_client" as const, label: clientName }, baselineRevision: 3, currentRelease: 1,
    state, conflicts: [], missingBindings: [], declinedReason: null, ...extra,
  });
  return {
    systemId: uuid("53000000", 1), workspaceId: AGENCY, name: "Inquiry intake", hidden: false,
    revisions: [
      { number: 3, label: null, summary: "Routing", publishedAt: daysAgo(30) },
      { number: 4, label: "Follow-up", summary: "Follow up after one business day.", publishedAt: daysAgo(2) },
    ],
    versions: [
      version("ready-1", "Lake Bakery", "ready"),
      version("ready-2", "Harbor Dental", "ready"),
      version("ready-3", "Cobblestone Books", "ready"),
      version("ready-4", "Grant Street Auto", "ready"),
      version("ready-5", "Hertel Hardware", "ready"),
      version("conflict", "The Mooney Firm", "conflicts", { conflicts: [{ path: "followUp.message", local: "We'll call you within one business day", upstream: "Someone will reply by the end of the next business day." }] }),
      version("missing", "Elmwood Physical Therapy", "missing_accounts", { missingBindings: ["google_calendar"] }),
    ],
  };
}

describe("agency batched read", () => {
  it("asks for one page of every client in one request, and the next page by cursor", async () => {
    const fifty = Array.from({ length: 50 }, (_, index) => row(index + 1));
    const request = vi.fn<typeof fetch>(async () => Response.json(page(fifty)));
    const first = await loadAgencyClients(request, AGENCY);
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0]![0])).toBe(`/api/workspace/agency-clients?workspaceId=${AGENCY}`);
    expect(first.clients).toHaveLength(50);

    await loadAgencyClients(request, AGENCY, { cursor: "100" });
    expect(String(request.mock.calls[1]![0])).toContain("cursor=100");
  });

  it("refuses a malformed response or rows for another agency instead of half-rendering them", async () => {
    const malformed = vi.fn<typeof fetch>(async () => Response.json({ ...page([row(1)]), clients: [{ name: "No id" }] }));
    await expect(loadAgencyClients(malformed, AGENCY)).rejects.toThrow("unexpected shape");
    const otherAgency = vi.fn<typeof fetch>(async () => Response.json({ ...page([row(1)]), agencyWorkspaceId: CLIENT }));
    await expect(loadAgencyClients(otherAgency, AGENCY)).rejects.toThrow("unexpected shape");
    const failed = vi.fn<typeof fetch>(async () => Response.json({ error: "Clients could not be loaded." }, { status: 503 }));
    await expect(loadAgencyClients(failed, AGENCY)).rejects.toThrow("Clients could not be loaded.");
  });

  it("joins pages once per client, queue item and person", () => {
    const one = page([row(1), row(2, { status: "unavailable", systems: [] })], {
      total: 3, nextCursor: "2",
      queue: [queueItem("a", daysAgo(1))],
      team: [{ userId: uuid("70000000", 1), email: "ops@example.com", role: "admin", clients: [{ workspaceId: row(1).workspaceId, name: "Client 1" }] }],
    });
    const two = page([row(2), row(3)], {
      total: 3,
      queue: [queueItem("a", daysAgo(1)), queueItem("b", daysAgo(4))],
      team: [{ userId: uuid("70000000", 1), email: "ops@example.com", role: "admin", clients: [{ workspaceId: row(3).workspaceId, name: "Client 3" }] }],
    });
    const view = combineAgencyPages([{ cursor: null, page: one }, { cursor: "2", page: two }]);
    expect(view.clients.map((client) => [client.name, client.status, client.pageIndex])).toEqual([["Client 1", "ready", 0], ["Client 2", "ready", 1], ["Client 3", "ready", 1]]);
    expect(view.queue.map((item) => item.id)).toEqual(["a", "b"]);
    expect(view.team).toHaveLength(1);
    expect(view.team[0]!.clients.map((client) => client.name)).toEqual(["Client 1", "Client 3"]);
    expect(view.nextCursor).toBeNull();
  });

  it("orders the queue oldest first", () => {
    const ordered = agencyQueueOrder([queueItem("new", daysAgo(0)), queueItem("oldest", daysAgo(9)), queueItem("middle", daysAgo(3))]);
    expect(ordered.map((item) => item.id)).toEqual(["oldest", "middle", "new"]);
  });

  it("says each row in plain words", () => {
    expect(clientSystemLabel({ id: uuid("51000000", 1), name: "attymooney.com", kind: "website", lifecycle: "live", versionContext: null })).toBe("attymooney.com · Live");
    expect(clientSystemLabel({ id: uuid("51000000", 2), name: "Twin Trees website", kind: "website", lifecycle: "live", versionContext: "Camillus" })).toBe("Twin Trees website · Live · Camillus Version");
    expect(needsYouLabel({ needsYou: { count: 2, oldestAt: daysAgo(6) } }, NOW)).toBe("2 waiting · oldest 6 days");
    expect(needsYouLabel({ needsYou: { count: 0, oldestAt: null } }, NOW)).toBe("Nothing waiting");
    expect(lastReceiptLabel(daysAgo(3), NOW)).toBe("Last receipt 3 days ago");
    expect(lastReceiptLabel(null, NOW)).toBe("No receipts yet");
  });
});

describe("agency library", () => {
  it("counts each source's Versions in the spec's words", () => {
    expect(libraryStatusLine(source())).toBe("5 ready · 1 has conflicts · 1 missing accounts");
    expect(missingAccountsLabel(["google_calendar"])).toBe("Needs Google Calendar connected first");
  });

  it("Review all sends only the ready Versions for the latest revision and never forces the rest", async () => {
    const value = source();
    expect(reviewableVersionIds(value)).toEqual(["ready-1", "ready-2", "ready-3", "ready-4", "ready-5"]);
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { versionIds: string[]; revision: number };
      return Response.json({
        sourceSystemId: value.systemId, revision: body.revision,
        results: body.versionIds.map((versionId) => {
          const version = value.versions.find((item) => item.versionId === versionId)!;
          return { versionId, workspaceId: version.workspaceId, clientName: version.clientName, outcome: versionId === "ready-4" ? "failed" : "prepared", detail: versionId === "ready-4" ? "Approval settings could not be read" : "" };
        }),
      });
    });
    const result = await reviewAllReady(request, AGENCY, value);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(request.mock.calls[0]![1]!.body))).toEqual({
      action: "review_all", workspaceId: AGENCY, sourceSystemId: value.systemId, revision: 4,
      versionIds: ["ready-1", "ready-2", "ready-3", "ready-4", "ready-5"],
    });

    const lines = reviewAllLines(value, result);
    expect(lines.map((line) => [line.clientName, line.outcome])).toEqual([
      ["Lake Bakery", "prepared"], ["Harbor Dental", "prepared"], ["Cobblestone Books", "prepared"], ["Grant Street Auto", "failed"], ["Hertel Hardware", "prepared"],
      ["The Mooney Firm", "skipped_conflicts"], ["Elmwood Physical Therapy", "skipped_missing_accounts"],
    ]);
    expect(lines.map(reviewLineLabel)).toContain("Could not prepare: Approval settings could not be read.");
    expect(lines.map(reviewLineLabel)).toContain("Skipped. Needs Google Calendar connected first.");
    expect(lines.map(reviewLineLabel)).toContain("Skipped. Needs a choice on 1 change.");
  });

  it("sends nothing when no Version is ready", async () => {
    const request = vi.fn<typeof fetch>();
    const value = { ...source(), versions: source().versions.filter((version) => version.state !== "ready") };
    await expect(reviewAllReady(request, AGENCY, value)).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("agency home", () => {
  const render = (extra: Partial<WorkspaceSnapshot>) => renderToStaticMarkup(createElement(AgencyHome, {
    snapshot: snapshot(extra), busy: false,
    onWorkspace: () => undefined, onOpenClientWork: () => undefined, onOpenWork: () => undefined, onStart: () => undefined,
  }));

  it("shows only explicit credited units, not grants or a payout claim", () => {
    const inspection = {
      allowances: [{
        id: "allowance", workspaceId: AGENCY, businessName: "North Studio", payerId: "payer",
        periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T23:59:59.000Z",
        spendingCapCents: 0, reservedCapCents: 0, consumedCapCents: 0, actualCostCents: 0,
        source: "local_configured", status: "active", capAcceptedBy: "payer", capAcceptedAt: "2026-09-01T00:00:00.000Z",
        createdBy: "operator", createdAt: "2026-09-01T00:00:00.000Z",
        buckets: [
          { unitKind: "completed_document_change", grantedUnits: 20, creditedUnits: 0, reservedUnits: 0, consumedUnits: 0, availableUnits: 20 },
          { unitKind: "completed_application_change", grantedUnits: 0, creditedUnits: 3, reservedUnits: 0, consumedUnits: 0, availableUnits: 3 },
        ],
      }],
      policy: { stripeSynchronized: false, pricesDefined: false, customerUsageSource: "trusted_execution_receipts", retriesConsumeCustomerAllowance: false, spendingCapMeaning: "operational_cost_limit_not_invoice_price", contributionPayouts: false },
    } satisfies WorkAllowanceInspection;
    expect(agencyCreditPeriods(inspection)).toMatchObject([{ units: [{ unitKind: "completed_application_change", creditedUnits: 3 }] }]);
  });

  it("renders private agency work and keeps unsupported offering ownership plain, with no invented revenue", () => {
    const html = render({ work: [work("method", AGENCY, { title: "Intake method" })] });
    expect(html).toContain("Private agency work");
    expect(html).toContain("Intake method");
    expect(html).toContain("Loading clients");
    expect(html).toContain("does not currently hold a private offering catalog");
    expect(html).not.toContain("Previous clients");
    expect(html.toLowerCase()).not.toContain("earnings");
    expect(html.toLowerCase()).not.toContain("royalt");
  });

  it("shows Clients, Queue, Library and Team only when STRELVA_SYSTEMS_RELEASE is on", () => {
    for (const off of [render({}), render({ releases: { systems: false } })]) {
      expect(off).not.toContain('role="tablist"');
      expect(off).not.toMatch(/>Library<|>Team</);
      expect(off).not.toMatch(/possibilit|make[s]? it real/i);
      expect(off).toContain("Assigned website drafts");
      expect(off).toContain("publishing stays with the client");
    }
    const on = render({ releases: { systems: true } });
    expect(on).toContain('role="tablist"');
    for (const label of ["Clients", "Queue", "Library", "Team"]) expect(on).toContain(`>${label}</button>`);
    expect(on).toContain("Website possibilities for clients");
    expect(on).not.toMatch(/\b(AI|agent|automation|workflow)\b/);
  });

  it("gives a delegated reader of the agency no agency tools", () => {
    const html = render({ releases: { systems: true }, workspaces: [{ id: AGENCY, kind: "agency", name: "North Studio", access: "delegated_read" }] });
    expect(html).toContain("agency tools are for members of North Studio");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Service requests");
    expect(html).not.toContain("Loading clients");
  });
});
