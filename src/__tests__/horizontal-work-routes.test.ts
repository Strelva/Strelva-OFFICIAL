import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ session: vi.fn(), database: null as unknown }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: boundary.session }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => boundary.database }));

import { GET as getOperations, POST as postOperations } from "@/app/api/operations/route";
import { GET as getDocuments, POST as postDocuments } from "@/app/api/documents/route";
import { GET as getEconomics } from "@/app/api/work-economics/route";
import { GET as getBounded, POST as postBounded } from "@/app/api/bounded-work/route";

const owner = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "Owner@Example.com", email_confirmed_at: "2026-09-12T00:00:00Z" };
const outsider = { ...owner, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "other@example.com" };
const agency = { ...owner, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "operator@agency.example.com" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const agencyWorkspaceId = "22222222-2222-4222-8222-222222222222";
type Row = Record<string, unknown>;

/** Auth and SQL are external boundaries. Route, schemas, product services, and
 * domain commands are real. Transactional SQL is proved by the isolated suite. */
function databaseBoundary() {
  const tables: Record<string, Row[]> & { workspace_memberships: Row[]; saved_product_work: Row[]; workspace_delegations: Row[] } = {
    workspace_memberships: [{ workspace_id: workspaceId, user_id: owner.id, role: "owner" }],
    saved_product_work: [], workspace_delegations: [], operational_assignments: [], offering_provider_deliveries: [], offering_installations: [], standing_responsibility_jobs: [], standing_responsibility_runs: [], application_states: [], application_releases: [], application_records: [], job_economics: [], job_economics_usage: [], job_economics_reservations: [], job_economics_executions: [],
  };
  let rpcError: string | null = null;
  let lostCommitResponse: string | null = null;
  function touchApplication(workId: string, actorId: string, kind: string, patch: Row) {
    const work = tables.saved_product_work.find(row => row.id === workId);
    if (!work) return;
    const payload = work.payload as Row;
    const revision = Number(payload.revision ?? 0) + 1;
    work.payload = {
      ...payload,
      ...structuredClone(patch),
      revision,
      history: [...(Array.isArray(payload.history) ? payload.history : []), { revision, kind, actorId, at: new Date().toISOString() }],
    };
    work.title = String((work.payload as Row).title ?? work.title ?? "");
    work.updated_at = new Date().toISOString();
  }
  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let inserted: Row | undefined;
    let counted = false;
    const query = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) { counted = Boolean(options?.count); return query; },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; },
      order() { return query; },
      limit() { return query; },
      insert(value: Row) { inserted = value; return query; },
      async maybeSingle() { const result = await execute(); return { ...result, data: result.data[0] ?? null }; },
      async single() { return query.maybeSingle(); },
      then(resolve: (value: Awaited<ReturnType<typeof execute>>) => unknown, reject?: (error: unknown) => unknown) { return execute().then(resolve, reject); },
    };
    async function execute() {
      if (!tables[table]) throw new Error(`Unexpected SQL table: ${table}`);
      if (inserted) {
        const now = new Date().toISOString();
        const row: Row = { id: randomUUID(), created_at: now, updated_at: now, ...structuredClone(inserted) };
        tables[table].push(row); inserted = undefined;
        if (table === "saved_product_work" && row.product_id === "applications") {
          const payload = row.payload as Row;
          tables.application_states!.push({
            work_id: row.id,
            workspace_id: row.workspace_id,
            candidate_design_revision: payload.designRevision ?? payload.revision ?? 0,
            candidate_spec_version: payload.specVersion ?? 1,
            candidate_spec: payload.spec,
            candidate_rehearsal: payload.rehearsal ?? null,
            current_release_version: null,
            records_revision: payload.recordsRevision ?? 0,
            lifecycle_status: payload.status ?? "draft",
            candidate_versions: payload.versions ?? [],
            created_at: row.created_at,
            updated_at: row.updated_at,
          });
        }
        return { data: [row], error: null, count: null };
      }
      const rows = tables[table].filter(row => filters.every(filter => filter(row)));
      return { data: structuredClone(rows), error: null, count: counted ? rows.length : null };
    }
    return query;
  }
  return {
    tables,
    loseResponseAfterCommit(name: string) { lostCommitResponse = name; },
    failNextCommit(message: string) { rpcError = message; },
    from,
    async rpc(name: string, args: Record<string, unknown>) {
      if (rpcError) { const error = rpcError; rpcError = null; return { data: null, error: { message: error } }; }
      if (name === "work_allowance_execution_command") {
        // This fixture has legacy accepted job budgets but no configured period
        // allowances. The SQL suite separately proves allowance reservations.
        const input = args.p_command as Row;
        if (!["reserve", "settle"].includes(String(input.action))) throw new Error("Unexpected allowance command");
        const budget = tables.job_economics!.find(row => row.id === input.jobId);
        if (!budget || budget.workspace_id !== workspaceId || args.p_actor_id !== owner.id) {
          return { data: null, error: { message: "work_allowance_access_denied" } };
        }
        return { data: null, error: null };
      }
      if (name === "job_economics_command_with_payer_authority") {
        const input = args.p_command as Row;
        const budget = tables.job_economics!.find(row => row.id === input.jobId)!;
        if (input.action === "settle") Object.assign(budget, { status: "settled", actual_cents: input.actualCents, actual_known: true });
        else if (input.action === "cancel") budget.status = "cancelled";
        else throw new Error("Unexpected budget command in route fixture");
        return { data: [structuredClone(budget)], error: null };
      }
      if (name === "get_job_economics") return { data: tables.job_economics!.filter(row => row.id === args.p_job_id), error: null };
      if (name === "rehearse_application_candidate") {
        const state = tables.application_states!.find(row => row.work_id === args.p_work_id);
        if (!state) return { data: null, error: { message: "application_state_unavailable" } };
        if (state.candidate_design_revision !== args.p_expected_design_revision) return { data: null, error: { message: "application_design_revision_conflict" } };
        const rehearsal = {
          specVersion: state.candidate_spec_version,
          checks: [
            { name: "Declared fields and approved components", passed: true },
            { name: "Executable code rejected", passed: true },
            { name: "Existing records fit this version", passed: true },
          ],
        };
        state.candidate_rehearsal = rehearsal;
        state.updated_at = new Date().toISOString();
        touchApplication(String(args.p_work_id), String(args.p_user_id), "rehearse_candidate", {
          rehearsal,
          candidate: {
            designRevision: state.candidate_design_revision,
            specVersion: state.candidate_spec_version,
            spec: state.candidate_spec,
            rehearsal,
          },
        });
        return { data: [structuredClone(state)], error: null };
      }
      if (name === "retire_application") {
        const state = tables.application_states!.find(row => row.work_id === args.p_work_id);
        if (!state) return { data: null, error: { message: "application_state_unavailable" } };
        if (state.candidate_design_revision !== args.p_expected_design_revision) return { data: null, error: { message: "application_design_revision_conflict" } };
        state.lifecycle_status = "retired";
        state.updated_at = new Date().toISOString();
        touchApplication(String(args.p_work_id), String(args.p_user_id), "retire", { status: "retired" });
        return { data: [structuredClone(state)], error: null };
      }
      if (name === "agency_can_read_assigned_work") {
        const assignment = tables.operational_assignments!.find((row) => row.workspace_id === args.p_workspace_id
          && row.assignee_user_id === args.p_user_id && row.assignee_kind === "agency" && row.status === "accepted");
        if (!assignment) return { data: false, error: null };
        const expiry = Date.parse(String(assignment.expires_at ?? ""));
        if (!Number.isFinite(expiry) || expiry <= Date.now()) return { data: false, error: null };
        const agencyMembership = tables.workspace_memberships.find((row) => row.workspace_id === assignment.assignee_workspace_id && row.user_id === args.p_user_id);
        const sponsorMembership = tables.workspace_memberships.find((row) => row.workspace_id === args.p_workspace_id && row.user_id === assignment.sponsor_id && row.role === "owner");
        const responsibility = tables.saved_product_work!.find((row) => row.id === assignment.work_id && row.workspace_id === args.p_workspace_id);
        const payload = responsibility?.payload as Row | undefined;
        const steps = Array.isArray(payload?.steps) ? payload.steps : [];
        const target = String(args.p_work_id);
        const targetIsAssigned = assignment.work_id === target || steps.some((step) => (step as Row).workId === target);
        const delivery = tables.offering_provider_deliveries!.find((row) => row.assignment_id === assignment.id
          && row.business_workspace_id === args.p_workspace_id && row.status === "accepted");
        const installation = delivery && tables.offering_installations!.find((row) => row.id === delivery.installation_id
          && row.business_workspace_id === args.p_workspace_id && row.status === "active"
          && (row.responsibility as Row)?.providerKind === "agency"
          && (row.responsibility as Row)?.agencyWorkspaceId === assignment.assignee_workspace_id
          && Array.isArray(row.native_resources) && (row.native_resources as Row[]).some((resource) => resource.id === target
            || (assignment.work_id === target && steps.some((step) => (step as Row).workId === resource.id))));
        return { data: Boolean(agencyMembership && sponsorMembership && payload?.ownerId === assignment.sponsor_id
          && payload?.approvedBy === assignment.sponsor_id && payload?.approvedAt && targetIsAssigned && installation), error: null };
      }
      if (name === "job_economics_execution_command") {
        const input = args.p_command as Row;
        const budget = tables.job_economics!.find(row => row.id === input.jobId)!;
        if (input.action !== "reconcile" && budget.status !== "accepted" && budget.status !== "reserved") return { data: null, error: { message: "job_economics_payer_required" } };
        let receipt = tables.job_economics_executions!.find(row => row.job_id === input.jobId && row.execution_key === input.executionKey);
        if (input.action === "claim" && !receipt) {
          receipt = { job_id: input.jobId, execution_key: input.executionKey, maximum_cents: input.maximumCents, kind: input.kind, attribution: input.attribution, status: "reserved", effect: null, amount_cents: null, billable_cents: null, created_by: args.p_actor_id };
          tables.job_economics_executions!.push(receipt);
          return { data: { claimed: true, execution: structuredClone(receipt) }, error: null };
        }
        if (!receipt) throw new Error("Execution fixture is missing");
        if (input.action === "start") receipt.status = "running";
        if (input.action === "finish" || input.action === "reconcile") {
          Object.assign(receipt, { status: "finished", effect: input.effect, amount_cents: input.amountCents, billable_cents: input.amountCents });
          if (input.action === "reconcile") tables.job_economics_usage = tables.job_economics_usage!.filter(row => row.idempotency_key !== `runtime:${String(input.executionKey)}`);
          tables.job_economics_usage!.push({ id: randomUUID(), job_id: input.jobId, idempotency_key: `runtime:${String(input.executionKey)}`, kind: "tool", attribution: "normal", amount_cents: input.amountCents, source: "runtime_reported", recorded_by: owner.id, created_at: new Date().toISOString() });
        }
        return { data: { claimed: false, execution: structuredClone(receipt) }, error: null };
      }
      if (!["update_bounded_product_work", "update_work_responsibility", "update_document_work"].includes(name)) throw new Error(`Unexpected SQL command: ${name}`);
      const work = tables.saved_product_work.find(row => row.id === args.p_work_id);
      if (!work) return { data: null, error: { message: "workspace_access_denied" } };
      work.payload = structuredClone(args.p_payload); work.updated_at = new Date().toISOString();
      if (lostCommitResponse === name) { lostCommitResponse = null; return { data: null, error: { message: "database connection lost after commit" } }; }
      return { data: [structuredClone(work)], error: null };
    },
  };
}

function post(path: "operations" | "bounded-work" | "documents", body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://strelva.test/api/${path}`, { method: "POST", headers: { origin: "https://strelva.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function read(path: "operations" | "bounded-work" | "documents", workId: string, productId = "applications") {
  return new Request(`https://strelva.test/api/${path}?workId=${workId}&productId=${productId}`);
}
const applicationInput = { title: "Equipment checkout", maintenanceOwner: outsider.id, fields: [{ id: "name", label: "Name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }] };
async function createApplication() {
  const response = await postBounded(post("bounded-work", { action: "create", productId: "applications", workspaceId, input: applicationInput }));
  expect(response.status).toBe(201);
  return response.json();
}
async function createResponsibility(workId: string, maximumCents = 0) {
  const response = await postOperations(post("operations", { action: "create", workspaceId, input: { title: "Check the form", intent: "Validate the approved components before installation", steps: [{ id: "check", operation: "application.command", workId, maximumCents, input: { kind: "rehearse", expectedRevision: 0 } }] } }));
  expect(response.status).toBe(200);
  return response.json();
}

function acceptedBudget(workId: string) {
  const now = new Date().toISOString();
  return { id: "99999999-9999-4999-8999-999999999999", workspace_id: workspaceId, work_id: workId,
    product_id: "operations", resource_kind: "responsibility", tenant_id: null, business_id: null,
    request_id: null, capability_id: null, payer_id: owner.id, currency: "usd", estimate_cents: 0,
    max_authorized_cents: 50, reserved_cents: 0, used_cents: 0, strelva_retry_cents: 0,
    actual_cents: null, actual_known: false, status: "accepted", created_by: owner.id,
    accepted_by: owner.id, accepted_at: now, created_at: now, updated_at: now };
}

describe("horizontal work HTTP authority and execution", () => {
  let database: ReturnType<typeof databaseBoundary>;
  beforeEach(() => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    boundary.session.mockResolvedValue(owner);
    database = databaseBoundary(); boundary.database = database;
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("keeps both APIs release-gated and requires verified sessions", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect((await getBounded(read("bounded-work", workspaceId))).status).toBe(503);
    expect((await getOperations(read("operations", workspaceId))).status).toBe(503);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    boundary.session.mockResolvedValue({ ...owner, email_confirmed_at: null });
    expect((await postBounded(post("bounded-work", {}))).status).toBe(401);
    expect((await postOperations(post("operations", {}))).status).toBe(401);
  });

  it("rejects cross-origin writes, non-JSON input, forged actor fields and oversized bodies", async () => {
    for (const [path, handler] of [["operations", postOperations], ["bounded-work", postBounded]] as const) {
      expect((await handler(post(path, {}, { origin: "https://other.test" }))).status).toBe(403);
      expect((await handler(post(path, {}, { "content-type": "text/plain" }))).status).toBe(415);
      expect((await handler(post(path, { action: "run", workId: workspaceId, actorId: outsider.id }))).status).toBe(400);
      expect((await handler(post(path, { text: "x".repeat(151000) }))).status).toBe(400);
    }
  });

  it("creates a private application owned by the session actor and rejects executable input", async () => {
    const work = await createApplication();
    const response = await getBounded(read("bounded-work", work.id));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ workspaceId, createdBy: owner.id, payload: { status: "draft", spec: { maintenanceOwner: owner.id } } });
    expect((await postBounded(post("bounded-work", { action: "create", productId: "applications", workspaceId, input: { ...applicationInput, script: "fetch('https://other.test')" } }))).status).toBe(400);
  });

  it("refuses another account's reads and mutations through actual workspace membership", async () => {
    const app = await createApplication();
    const work = await createResponsibility(app.id);
    boundary.session.mockResolvedValue(outsider);
    expect((await getBounded(read("bounded-work", app.id))).status).toBe(403);
    expect((await getOperations(read("operations", work.id))).status).toBe(403);
    expect((await postBounded(post("bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "retire", expectedRevision: 0 } }))).status).toBe(403);
    expect((await postOperations(post("operations", { action: "run", workId: work.id }))).status).toBe(403);
  });

  it("requires a live exact agency assignment for native work reads", async () => {
    const app = await createApplication();
    const responsibility = await createResponsibility(app.id);
    const responsibilityRow = database.tables.saved_product_work.find((row) => row.id === responsibility.id)!;
    const approvedAt = new Date().toISOString();
    responsibilityRow.payload = {
      ...(responsibilityRow.payload as Row),
      status: "ready",
      ownerId: owner.id,
      approvedBy: owner.id,
      approvedAt,
    };
    database.tables.workspace_memberships.push({ workspace_id: agencyWorkspaceId, user_id: agency.id, role: "owner" });
    const assignmentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const installationId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const assignment = {
      id: assignmentId, workspace_id: workspaceId, work_id: responsibility.id, sponsor_id: owner.id,
      assignee_user_id: agency.id, assignee_kind: "agency", assignee_workspace_id: agencyWorkspaceId,
      status: "accepted", expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    database.tables.operational_assignments!.push(assignment);
    const delivery = {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff", assignment_id: assignmentId,
      business_workspace_id: workspaceId, installation_id: installationId, status: "accepted",
    };
    database.tables.offering_provider_deliveries!.push(delivery);
    database.tables.offering_installations!.push({
      id: installationId, business_workspace_id: workspaceId, status: "active",
      responsibility: { kind: "provider_requested", providerKind: "agency", agencyWorkspaceId },
      native_resources: [{ kind: "application", id: app.id }],
    });

    boundary.session.mockResolvedValue(agency);
    expect((await getBounded(read("bounded-work", app.id))).status).toBe(200);

    assignment.expires_at = "not-a-timestamp";
    expect((await getBounded(read("bounded-work", app.id))).status).toBe(403);
    assignment.expires_at = new Date(Date.now() + 60_000).toISOString();
    delivery.status = "revoked";
    expect((await getBounded(read("bounded-work", app.id))).status).toBe(403);
  });

  it("approves and completes a native action once, then returns its durable result", async () => {
    const app = await createApplication();
    const work = await createResponsibility(app.id);
    expect((await postOperations(post("operations", { action: "run", workId: work.id }))).status).toBe(409);
    expect((await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "approve", expectedRevision: 0 } }))).status).toBe(200);
    const completed = await postOperations(post("operations", { action: "run", workId: work.id }));
    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({ payload: { status: "completed", steps: [{ status: "completed", effect: "accepted", attempt: 1 }] } });
    expect((await postOperations(post("operations", { action: "run", workId: work.id }))).status).toBe(200);
    expect(await (await getBounded(read("bounded-work", app.id))).json()).toMatchObject({ payload: { revision: 1, rehearsal: { specVersion: 1 } } });
  });

  it("does not let a workspace peer approve the sponsor's responsibility", async () => {
    const app = await createApplication();
    const work = await createResponsibility(app.id);
    database.tables.workspace_memberships.push({ workspace_id: workspaceId, user_id: outsider.id, role: "member" });
    boundary.session.mockResolvedValue(outsider);
    expect((await getOperations(read("operations", work.id))).status).toBe(200);
    expect((await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "approve", expectedRevision: 0 } }))).status).toBe(403);
  });

  it("reports persistence conflicts and outages without acknowledging a successful mutation", async () => {
    const app = await createApplication();
    database.failNextCommit("bounded_revision_conflict");
    expect((await postBounded(post("bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "rehearse", expectedRevision: 0 } }))).status).toBe(409);
    expect(await (await getBounded(read("bounded-work", app.id))).json()).toMatchObject({ payload: { revision: 0, rehearsal: null } });
    boundary.database = null;
    expect((await getBounded(read("bounded-work", app.id))).status).toBe(503);
    expect((await getOperations(read("operations", app.id))).status).toBe(503);
  });
  it("attaches an accepted native budget and records runtime usage without provider spending", async () => {
    const app = await createApplication();
    const work = await createResponsibility(app.id, 50);
    const budgetId = "99999999-9999-4999-8999-999999999999";
    const now = new Date().toISOString();
    database.tables.job_economics!.push({ id: budgetId, workspace_id: workspaceId, work_id: work.id,
      product_id: "operations", resource_kind: "responsibility", tenant_id: null, business_id: null,
      request_id: null, capability_id: null, payer_id: owner.id, currency: "usd", estimate_cents: 0,
      max_authorized_cents: 50, reserved_cents: 0, used_cents: 0, strelva_retry_cents: 0,
      actual_cents: null, actual_known: false, status: "accepted", created_by: owner.id,
      accepted_by: owner.id, accepted_at: now, created_at: now, updated_at: now });
    expect((await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "approve", expectedRevision: 0 } }))).status).toBe(409);
    expect((await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "set_budget", expectedRevision: 0, budgetId } }))).status).toBe(200);
    expect((await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "approve", expectedRevision: 1 } }))).status).toBe(200);
    expect(await (await postOperations(post("operations", { action: "run", workId: work.id }))).json()).toMatchObject({ payload: { status: "completed", budgetId } });
    const budget = await getEconomics(new Request(`https://strelva.test/api/work-economics?jobId=${budgetId}`));
    expect(budget.status).toBe(200);
    expect(await budget.json()).toMatchObject({
      ledger: { status: "settled", actualCents: 0, actualKnown: true },
      executions: [{ status: "finished", effect: "accepted", amountCents: 0, billableCents: 0 }],
      usage: [{ amountCents: 0, source: "runtime_reported" }],
      policy: { stripeCharged: false, paidProvidersInvoked: false },
    });
  });

  it("classifies a revoked budget as no effect and keeps the native record unchanged", async () => {
    const app = await createApplication();
    const work = await createResponsibility(app.id, 50);
    const budget = acceptedBudget(work.id); database.tables.job_economics!.push(budget);
    await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "set_budget", expectedRevision: 0, budgetId: budget.id } }));
    await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "approve", expectedRevision: 1 } }));
    budget.status = "cancelled";
    const response = await postOperations(post("operations", { action: "run", workId: work.id }));
    expect(await response.json()).toMatchObject({ payload: { status: "needs_attention", steps: [{ effect: "none", status: "failed" }] } });
    expect(await (await getBounded(read("bounded-work", app.id))).json()).toMatchObject({ payload: { revision: 0 } });
  });

  it("verifies an interrupted document write before reconciling its held cost and closing the budget", async () => {
    const doc = await (await postDocuments(post("documents", { action: "create", workspaceId, input: { title: "Handover", text: "Original" } }))).json();
    const work = await (await postOperations(post("operations", { action: "create", workspaceId, input: { title: "Update handover", intent: "Keep the handover current", steps: [{ id: "edit", operation: "document.edit", workId: doc.workId, maximumCents: 50, input: { kind: "edit", expectedRevision: 0, title: "Handover", text: "Confirmed change" } }] } }))).json();
    const budget = acceptedBudget(work.id); database.tables.job_economics!.push(budget);
    await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "set_budget", expectedRevision: 0, budgetId: budget.id } }));
    await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "approve", expectedRevision: 1 } }));
    database.loseResponseAfterCommit("update_document_work");
    const interrupted = await (await postOperations(post("operations", { action: "run", workId: work.id }))).json();
    expect(interrupted).toMatchObject({ payload: { status: "needs_attention", steps: [{ effect: "unknown" }] } });
    const wrong = await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "reconcile", expectedRevision: interrupted.payload.revision, stepId: "edit", resolution: "not_applied", evidence: "I think nothing happened" } }));
    expect(wrong.status).toBe(409);
    const confirmed = await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "reconcile", expectedRevision: interrupted.payload.revision, stepId: "edit", resolution: "completed", evidence: "Read the actual document" } }));
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ payload: { status: "completed" } });
    expect(await (await getDocuments(read("documents", doc.workId))).json()).toMatchObject({ document: { revision: 1, text: "Confirmed change" } });
    expect(await (await getEconomics(new Request(`https://strelva.test/api/work-economics?jobId=${budget.id}`))).json()).toMatchObject({ ledger: { status: "settled", actualCents: 0 }, executions: [{ status: "finished", effect: "accepted", amountCents: 0 }] });
  });

  it("uses a fresh scheduled finding without rerunning it or copying private source values", async () => {
    const docs = [];
    for (const text of ["Private source value A", "Private source value B"]) docs.push(await (await postDocuments(post("documents", { action: "create", workspaceId, input: { title: "Source", text } }))).json());
    const investigation = await (await postBounded(post("bounded-work", { action: "create", productId: "investigations", workspaceId, input: { title: "Compare sources", intervalMinutes: 60, sources: docs.map(doc => ({ workId: doc.workId })) } }))).json();
    expect((await postBounded(post("bounded-work", { action: "run", productId: "investigations", workId: investigation.id, command: { expectedRevision: 0, requestId: "scheduled-fixture-check" } }))).status).toBe(200);
    const work = await (await postOperations(post("operations", { action: "create", workspaceId, input: { title: "Use the current check", intent: "Review source differences", steps: [{ id: "check", operation: "investigation.run", workId: investigation.id, maximumCents: 0, input: {} }] } }))).json();
    await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "approve", expectedRevision: 0 } }));
    const result = await (await postOperations(post("operations", { action: "run", workId: work.id }))).json();
    expect(result).toMatchObject({ payload: { status: "needs_attention", steps: [{ effect: "none", status: "accepted", result: { finding: { requestId: "scheduled-fixture-check", differenceCount: 1, reused: true } } }] } });
    expect(JSON.stringify(result)).not.toContain("Private source value");
    const confirmed = await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "reconcile", expectedRevision: result.payload.revision, stepId: "check", resolution: "completed", evidence: "Reviewed the native source differences" } }));
    expect(confirmed.status).toBe(200);
    expect(await (await getBounded(read("bounded-work", investigation.id, "investigations"))).json()).toMatchObject({ payload: { revision: 1 } });
  });

  it("waits for another source check when the scheduled finding became stale", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
    const docs = [];
    for (const text of ["Same", "Same"]) docs.push(await (await postDocuments(post("documents", { action: "create", workspaceId, input: { title: "Source", text } }))).json());
    const investigation = await (await postBounded(post("bounded-work", { action: "create", productId: "investigations", workspaceId, input: { title: "Compare sources", intervalMinutes: 60, sources: docs.map(doc => ({ workId: doc.workId })) } }))).json();
    await postBounded(post("bounded-work", { action: "run", productId: "investigations", workId: investigation.id, command: { expectedRevision: 0, requestId: "scheduled-check" } }));
    vi.setSystemTime(new Date("2026-09-12T12:01:00Z"));
    await postDocuments(post("documents", { action: "command", workId: docs[0]!.workId, command: { kind: "edit", expectedRevision: 0, title: "Source", text: "Changed after checking" } }));
    const work = await (await postOperations(post("operations", { action: "create", workspaceId, input: { title: "Use current evidence", intent: "Compare current records", steps: [{ id: "check", operation: "investigation.run", workId: investigation.id, maximumCents: 0, input: {} }] } }))).json();
    await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "approve", expectedRevision: 0 } }));
    expect(await (await postOperations(post("operations", { action: "run", workId: work.id }))).json()).toMatchObject({ payload: { status: "waiting", steps: [{ effect: "none", status: "waiting", wakeAt: "2026-09-12T13:00:00.000Z" }] } });
  });

  it("reconciles a cancelled check from its exact historical receipt without restarting work after sources change", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
    const docs = [];
    for (const text of ["First", "Second"]) docs.push(await (await postDocuments(post("documents", { action: "create", workspaceId, input: { title: "Source", text } }))).json());
    const investigation = await (await postBounded(post("bounded-work", { action: "create", productId: "investigations", workspaceId, input: { title: "Compare sources", intervalMinutes: 60, sources: docs.map(doc => ({ workId: doc.workId })) } }))).json();
    const work = await (await postOperations(post("operations", { action: "create", workspaceId, input: { title: "Check records", intent: "Compare current records", steps: [{ id: "check", operation: "investigation.run", workId: investigation.id, maximumCents: 50, input: {} }] } }))).json();
    const budget = acceptedBudget(work.id); database.tables.job_economics!.push(budget);
    await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "set_budget", expectedRevision: 0, budgetId: budget.id } }));
    await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "approve", expectedRevision: 1 } }));
    database.loseResponseAfterCommit("update_bounded_product_work");
    const interrupted = await (await postOperations(post("operations", { action: "run", workId: work.id }))).json();
    expect(interrupted).toMatchObject({ payload: { status: "needs_attention", steps: [{ effect: "unknown" }] } });
    vi.setSystemTime(new Date("2026-09-12T12:01:00Z"));
    await postDocuments(post("documents", { action: "command", workId: docs[0]!.workId, command: { kind: "edit", expectedRevision: 0, title: "Source", text: "Changed after the recorded check" } }));
    // Active work still cannot use a stale finding to authorize dependent actions.
    expect((await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "reconcile", expectedRevision: interrupted.payload.revision, stepId: "check", resolution: "completed", evidence: "Old receipt" } }))).status).toBe(409);
    const cancelled = await (await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "cancel", expectedRevision: interrupted.payload.revision } }))).json();
    const reconciled = await postOperations(post("operations", { action: "command", workId: work.id, command: { kind: "reconcile", expectedRevision: cancelled.payload.revision, stepId: "check", resolution: "completed", evidence: "The exact original check receipt exists; work stays cancelled" } }));
    expect(reconciled.status).toBe(200);
    expect(await reconciled.json()).toMatchObject({ payload: { status: "cancelled", steps: [{ status: "completed" }] } });
    expect(await (await getEconomics(new Request(`https://strelva.test/api/work-economics?jobId=${budget.id}`))).json()).toMatchObject({ ledger: { status: "cancelled" }, executions: [{ status: "finished", effect: "accepted", amountCents: 0 }] });
    expect(await (await postOperations(post("operations", { action: "run", workId: work.id }))).json()).toMatchObject({ payload: { status: "cancelled" } });
    expect(await (await getBounded(read("bounded-work", investigation.id, "investigations"))).json()).toMatchObject({ payload: { revision: 1 } });
  });

});
