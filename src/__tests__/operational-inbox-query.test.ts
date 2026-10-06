import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResponsibility, changeResponsibility } from "@/platform/work-execution/engine";
import type { WorkspaceActor } from "@/platform/workspaces/types";

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "in" | "gt"; column: string; value: unknown };
type Call = { table: string; filters: Filter[]; orders: string[]; limit?: number };

const boundary = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  calls: [] as Call[],
}));

function query(table: string) {
  const call: Call = { table, filters: [], orders: [] };
  boundary.calls.push(call);
  const builder = {
    select() { return builder; },
    eq(column: string, value: unknown) { call.filters.push({ op: "eq", column, value }); return builder; },
    in(column: string, value: unknown[]) { call.filters.push({ op: "in", column, value }); return builder; },
    gt(column: string, value: unknown) { call.filters.push({ op: "gt", column, value }); return builder; },
    order(column: string) { call.orders.push(column); return builder; },
    limit(value: number) { call.limit = value; return builder; },
    then(resolve: (value: { data: Row[]; error: null }) => unknown) {
      let data = (boundary.tables[table] ?? []).filter((row) => call.filters.every((filter) => {
        if (filter.op === "eq") return row[filter.column] === filter.value;
        if (filter.op === "in") return (filter.value as unknown[]).includes(row[filter.column]);
        return String(row[filter.column]) > String(filter.value);
      }));
      if (call.limit !== undefined) data = data.slice(0, call.limit);
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return builder;
}

vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ from: query }) }));

const { listAuthorizedOperationalInbox } = await import("@/products/operations/inbox");

const sponsor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor: WorkspaceActor = { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", verifiedEmail: "Operator@Example.test" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const assignmentId = "33333333-3333-4333-8333-333333333333";
const at = "2026-09-15T12:00:00.000Z";

function approvedWork() {
  const proposed = createResponsibility({
    title: "Open the front desk",
    intent: "Run the approved checks",
    steps: [{ id: "step-1", operation: "investigation.run", workId, input: { expectedRevision: 0 }, dependsOn: [], maximumCents: 0, capabilityVersion: 1 }],
  }, sponsor, at);
  return changeResponsibility(proposed, { kind: "approve", expectedRevision: 0 }, sponsor, at);
}

function scope(payload: ReturnType<typeof approvedWork>) {
  return {
    ownerId: payload.ownerId,
    approvedBy: payload.approvedBy,
    approvedAt: payload.approvedAt,
    budgetId: payload.budgetId ?? null,
    steps: payload.steps.map((step) => ({
      id: step.id, operation: step.operation, workId: step.workId, input: step.input, dependsOn: step.dependsOn,
      maximumCents: step.maximumCents, capabilityVersion: step.capabilityVersion, expectedUpdatedAt: step.expectedUpdatedAt ?? null,
    })),
  };
}

beforeEach(() => {
  boundary.calls = [];
  const payload = approvedWork();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const unrelated: Row[] = Array.from({ length: 600 }, (_, index) => ({
    id: `other-assignment-${index}`,
    workspace_id: `other-workspace-${index}`,
    work_id: `other-work-${index}`,
    sponsor_id: `other-sponsor-${index}`,
    sponsor_email: "someone@else.test",
    assignee_user_id: `other-user-${index}`,
    assignee_email: "other@else.test",
    assignee_kind: "staff",
    status: "offered",
    offered_at: at,
    expires_at: future,
    work_scope: {},
  }));
  boundary.tables = {
    operational_assignments: [...unrelated, {
      id: assignmentId,
      workspace_id: workspaceId,
      work_id: workId,
      sponsor_id: sponsor,
      sponsor_email: "owner@example.test",
      assignee_user_id: actor.userId,
      assignee_email: "operator@example.test",
      assignee_kind: "staff",
      status: "offered",
      offered_at: at,
      expires_at: future,
      work_scope: scope(payload),
    }],
    saved_product_work: [
      ...Array.from({ length: 600 }, (_, index) => ({ id: `other-work-${index}`, workspace_id: `other-workspace-${index}`, title: "Other", payload: {} })),
      { id: workId, workspace_id: workspaceId, title: "Open the front desk", payload },
    ],
    workspace_memberships: [
      ...Array.from({ length: 600 }, (_, index) => ({ workspace_id: `other-workspace-${index}`, user_id: `other-user-${index}`, role: "owner" })),
      { workspace_id: workspaceId, user_id: sponsor, role: "owner" },
      { workspace_id: workspaceId, user_id: actor.userId, role: "member" },
    ],
    workspaces: [
      ...Array.from({ length: 600 }, (_, index) => ({ id: `other-workspace-${index}`, name: "Other business" })),
      { id: workspaceId, name: "Harbor Dental" },
    ],
    offering_provider_deliveries: [],
  };
});

describe("operational inbox queries", () => {
  it("finds the actor's assignment past 500 unrelated rows and only loads related records", async () => {
    const inbox = await listAuthorizedOperationalInbox(actor);
    expect(inbox.assignments.map((item) => item.assignmentId)).toEqual([assignmentId]);
    expect(inbox.assignments[0]!.workspaceName).toBe("Harbor Dental");

    const assignments = boundary.calls.filter((call) => call.table === "operational_assignments");
    expect(assignments.length).toBeGreaterThan(0);
    for (const call of assignments) {
      expect(call.filters).toContainEqual({ op: "eq", column: "assignee_user_id", value: actor.userId });
      expect(call.orders.length).toBeGreaterThan(0);
    }
    for (const call of boundary.calls.filter((item) => item.table !== "operational_assignments")) {
      expect(call.filters.some((filter) => filter.op === "in")).toBe(true);
      expect(call.orders.length).toBeGreaterThan(0);
    }
  });

  it("does not query related tables when the actor has no assignments", async () => {
    boundary.tables.operational_assignments = boundary.tables.operational_assignments!.slice(0, 600);
    expect(await listAuthorizedOperationalInbox(actor)).toEqual({ assignments: [] });
    expect(boundary.calls.map((call) => call.table)).toEqual(["operational_assignments"]);
  });

  it("still rejects an assignment whose email does not match the verified email", async () => {
    const own = boundary.tables.operational_assignments!.at(-1)!;
    own.assignee_email = "someone-else@example.test";
    expect(await listAuthorizedOperationalInbox(actor)).toEqual({ assignments: [] });
  });
});
