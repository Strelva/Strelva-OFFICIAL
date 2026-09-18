import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgencyHome } from "@/experience/workspace/AgencyHome";
import {
  MAX_AGENCY_CLIENT_LOADS,
  agencyAttentionQueue,
  agencyClientTargets,
  agencyCreditPeriods,
  loadAgencyClientSnapshots,
} from "@/experience/workspace/agency-home";
import type { WorkspaceSnapshot, WorkspaceWork } from "@/experience/workspace/contracts";
import type { WorkAllowanceInspection } from "@/platform/work-economics/allowances";

const AGENCY = "11111111-1111-4111-8111-111111111111";
const OTHER_AGENCY = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const OTHER_CLIENT = "44444444-4444-4444-8444-444444444444";

function work(id: string, workspaceId: string, extra: Partial<WorkspaceWork> = {}): WorkspaceWork {
  return { id, workspaceId, title: id, productId: "documents", resourceKind: "document", payload: null, input: {}, createdAt: "2026-09-15T12:00:00.000Z", ...extra };
}

function snapshot(extra: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    actor: { email: "agency@example.com", localPreview: false },
    workspaceId: AGENCY,
    workspaces: [
      { id: AGENCY, kind: "agency", name: "North Studio", access: "member" },
      { id: OTHER_AGENCY, kind: "agency", name: "Other Studio", access: "member" },
      { id: CLIENT, kind: "customer", name: "Harbor Dental", access: "delegated_read" },
      { id: OTHER_CLIENT, kind: "customer", name: "Direct customer", role: "member", access: "member" },
    ],
    work: [],
    handoffs: [],
    delegations: [
      { id: "a", workId: "work-a", customerWorkspaceId: CLIENT, agencyWorkspaceId: AGENCY, status: "active", canRevoke: false },
      { id: "b", workId: "work-b", customerWorkspaceId: OTHER_CLIENT, agencyWorkspaceId: OTHER_AGENCY, status: "active", canRevoke: false },
    ],
    products: [],
    ...extra,
  };
}

describe("agency home projection", () => {
  it("derives clients only from active delegations for the selected agency", () => {
    const value = agencyClientTargets(snapshot({ delegations: [
      ...snapshot().delegations,
      { id: "revoked", workId: "old", customerWorkspaceId: OTHER_CLIENT, agencyWorkspaceId: AGENCY, status: "revoked", canRevoke: false },
      { id: "legacy", workId: "missing-scope", agencyWorkspaceId: AGENCY, status: "active", canRevoke: false },
    ] }));
    expect(value).toEqual({ targets: [{ id: CLIENT, name: "Harbor Dental", workIds: ["work-a"] }], totalCount: 1, omittedCount: 0 });
  });

  it("bounds full client loads and reports omitted coverage", () => {
    const clientWorkspaces = Array.from({ length: MAX_AGENCY_CLIENT_LOADS + 2 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      kind: "customer" as const,
      name: `Client ${index}`,
      access: "delegated_read" as const,
    }));
    const value = agencyClientTargets(snapshot({
      workspaces: [{ id: AGENCY, kind: "agency", name: "North Studio", access: "member" }, ...clientWorkspaces],
      delegations: clientWorkspaces.map((client, index) => ({ id: `d-${index}`, workId: `w-${index}`, customerWorkspaceId: client.id, agencyWorkspaceId: AGENCY, status: "active" as const, canRevoke: false })),
    }));
    expect(value.targets).toHaveLength(MAX_AGENCY_CLIENT_LOADS);
    expect(value.totalCount).toBe(MAX_AGENCY_CLIENT_LOADS + 2);
    expect(value.omittedCount).toBe(2);
  });

  it("rechecks each client through the existing workspace route and rejects mixed workspace data", async () => {
    const requested: string[] = [];
    const agency = snapshot({
      workspaces: [
        { id: AGENCY, kind: "agency", name: "North Studio", access: "member" },
        { id: CLIENT, kind: "customer", name: "Harbor Dental", access: "delegated_read" },
        { id: OTHER_CLIENT, kind: "customer", name: "Lake Bakery", access: "delegated_read" },
      ],
      delegations: [
        { id: "a", workId: "work-a", customerWorkspaceId: CLIENT, agencyWorkspaceId: AGENCY, status: "active", canRevoke: false },
        { id: "b", workId: "work-b", customerWorkspaceId: OTHER_CLIENT, agencyWorkspaceId: AGENCY, status: "active", canRevoke: false },
      ],
    });
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "https://strelva.test");
      const id = url.searchParams.get("workspaceId")!;
      requested.push(id);
      return Response.json({
        ...agency,
        workspaceId: id,
        workspaces: agency.workspaces,
        work: [work(`work-${id}`, id === OTHER_CLIENT ? CLIENT : id)],
      });
    });

    const result = await loadAgencyClientSnapshots(request, agency);
    expect(requested).toEqual([CLIENT, OTHER_CLIENT]);
    expect(result.clients.map((client) => client.workspace.id)).toEqual([CLIENT]);
    expect(result.failed).toEqual([{ id: OTHER_CLIENT, name: "Lake Bakery", workIds: ["work-b"] }]);
  });

  it("keeps a direct member's agency queue limited to work delegated to the selected agency", async () => {
    const selectedWork = work("work-a", CLIENT, { operation: { status: "proposed" } });
    const otherAgencyWork = work("work-from-other-agency", CLIENT, { operation: { status: "needs_attention" } });
    const directBusinessWork = work("direct-business-work", CLIENT, { operation: { status: "needs_attention" } });
    const agency = snapshot({
      workspaces: [
        { id: AGENCY, kind: "agency", name: "North Studio", access: "member" },
        { id: CLIENT, kind: "customer", name: "Harbor Dental", access: "member", role: "member" },
      ],
      delegations: [{ id: "a", workId: selectedWork.id, customerWorkspaceId: CLIENT, agencyWorkspaceId: AGENCY, status: "active", canRevoke: false }],
    });
    const request = vi.fn<typeof fetch>(async () => Response.json({
      ...agency,
      workspaceId: CLIENT,
      work: [selectedWork, otherAgencyWork, directBusinessWork],
    }));

    const result = await loadAgencyClientSnapshots(request, agency);
    expect(result.failed).toEqual([]);
    expect(result.clients[0]?.work.map((item) => item.id)).toEqual([selectedWork.id]);
    expect(agencyAttentionQueue(result.clients).map((item) => item.work.id)).toEqual([selectedWork.id]);
  });

  it("orders only recorded client attention and keeps quiet work out of the queue", () => {
    const queue = agencyAttentionQueue([
      { workspace: { id: CLIENT, kind: "customer", name: "Harbor Dental", access: "delegated_read" }, work: [
        work("quiet", CLIENT),
        work("proposal", CLIENT, { createdAt: "2026-09-15T13:00:00.000Z", operation: { status: "proposed" } }),
      ] },
      { workspace: { id: OTHER_CLIENT, kind: "customer", name: "Lake Bakery", access: "delegated_read" }, work: [
        work("exception", OTHER_CLIENT, { createdAt: "2026-09-15T14:00:00.000Z", operation: { status: "needs_attention" } }),
      ] },
    ]);
    expect(queue.map((item) => item.work.id)).toEqual(["exception", "proposal"]);
  });

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

  it("renders private agency work and explains unsupported offering ownership without invented revenue", () => {
    const html = renderToStaticMarkup(createElement(AgencyHome, {
      snapshot: snapshot({ work: [work("method", AGENCY, { title: "Intake method" })] }),
      busy: false,
      onWorkspace: () => undefined,
      onOpenClientWork: () => undefined,
      onOpenWork: () => undefined,
      onStart: () => undefined,
    }));
    expect(html).toContain("Private agency work");
    expect(html).toContain("Intake method");
    expect(html).toContain("Checking shared client work");
    expect(html).toContain("does not currently hold a private offering catalog");
    expect(html.toLowerCase()).not.toContain("earnings");
    expect(html.toLowerCase()).not.toContain("royalt");
  });
});
