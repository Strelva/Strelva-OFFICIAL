import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => boundary.database }));
import { createWorkPlan, executeWorkPlanOutput } from "@/products/work-plans/server";
import { saveNewTracker } from "@/products/tracker/server";
import { readWorkspaceApplication, changeWorkspaceApplication } from "@/products/applications/server";
const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, unknown>;
function databaseBoundary() {
  const tables: Record<string, Row[]> = {
    workspace_memberships: [{ workspace_id: workspaceId, user_id: actor.userId, role: "owner" }],
    saved_product_work: [], workspace_delegations: [], application_states: [], application_releases: [], application_records: [],
  };
  const executions: Row[] = [];
  function touchApplication(workId: string, actorId: string, kind: string, patch: Row) {
    const work = tables.saved_product_work!.find(row => row.id === workId);
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
    const filters: Array<(row: Row) => boolean> = []; let insertion: Row | undefined;
    const query = {
      select() { return query; }, eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; }, in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; }, order() { return query; }, limit() { return query; },
      insert(value: Row) { insertion = value; return query; },
      async maybeSingle() { const result = await execute(); return { ...result, data: result.data[0] ?? null }; }, async single() { return query.maybeSingle(); },
      then(resolve: (value: Awaited<ReturnType<typeof execute>>) => unknown, reject?: (error: unknown) => unknown) { return execute().then(resolve, reject); },
    };
    async function execute() {
      if (!tables[table]) throw new Error(`Unexpected table ${table}`);
      if (insertion) { const row = { ...structuredClone(insertion), id: randomUUID(), created_at: new Date().toISOString().replace("Z", "+00:00"), updated_at: new Date().toISOString().replace("Z", "+00:00") }; tables[table].push(row); insertion = undefined; return { data: [row], count: 1, error: null }; }
      const rows = tables[table].filter(row => filters.every(filter => filter(row))); return { data: structuredClone(rows), count: rows.length, error: null };
    }
    return query;
  }
  return { from, async rpc(name: string, args: Row) {
    if (name === "update_bounded_product_work") {
      const work = tables.saved_product_work!.find(row => row.id === args.p_work_id)!;
      work.payload = args.p_payload; return { data: [structuredClone(work)], error: null };
    }
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
    if (name === "publish_application_candidate") {
      const state = tables.application_states!.find(row => row.work_id === args.p_work_id);
      if (!state) return { data: null, error: { message: "application_state_unavailable" } };
      if (state.candidate_design_revision !== args.p_expected_candidate_revision) return { data: null, error: { message: "application_design_revision_conflict" } };
      if (state.current_release_version !== null) return { data: null, error: { message: "application_release_conflict" } };
      if (!state.candidate_rehearsal) return { data: null, error: { message: "application_rehearsal_required" } };
      const timestamp = new Date().toISOString().replace("Z", "+00:00");
      const release = { version: 1, spec: state.candidate_spec, publishedAt: timestamp, publishedBy: String(args.p_user_id), provenance: "published" };
      state.current_release_version = 1;
      state.lifecycle_status = "installed";
      state.updated_at = new Date().toISOString();
      tables.application_releases!.push({ work_id: args.p_work_id, workspace_id: args.p_workspace_id, ...release });
      const work = tables.saved_product_work!.find(row => row.id === args.p_work_id);
      const payload = work?.payload as Row | undefined;
      touchApplication(String(args.p_work_id), String(args.p_user_id), "publish_candidate", {
        status: "installed",
        release,
        releases: [...(Array.isArray(payload?.releases) ? payload.releases : []), release],
      });
      return { data: [structuredClone(state)], error: null };
    }
    if (name !== "execute_work_plan_output" && name !== "read_work_plan_output") throw new Error(`Unexpected RPC ${name}`);
    const prior = executions.find(row => row.plan_work_id === args.p_plan_work_id && row.output_id === args.p_output_id);
    if (prior) return { data: [{ ...prior, replayed: true }], error: null };
    if (name === "read_work_plan_output") return { data: [], error: null };
    const id = randomUUID(), timestamp = new Date().toISOString();
      tables.saved_product_work!.push({ id, workspace_id: args.p_workspace_id, product_id: args.p_native_product_id, resource_kind: args.p_native_resource_kind, title: args.p_native_title, payload: args.p_native_payload, input: args.p_native_input, created_by: args.p_user_id, created_at: timestamp, updated_at: timestamp });
      if (args.p_native_product_id === "applications") {
        const payload = args.p_native_payload as Row;
        tables.application_states!.push({
          work_id: id,
          workspace_id: args.p_workspace_id,
          candidate_design_revision: payload.designRevision ?? payload.revision ?? 0,
          candidate_spec_version: payload.specVersion ?? 1,
          candidate_spec: payload.spec,
          candidate_rehearsal: payload.rehearsal ?? null,
          current_release_version: null,
          records_revision: payload.recordsRevision ?? 0,
          lifecycle_status: payload.status ?? "draft",
          candidate_versions: payload.versions ?? [],
          created_at: timestamp,
          updated_at: timestamp,
        });
      }
    const receipt = { version: 1, kind: "work_plan_output", planWorkId: args.p_plan_work_id, outputId: args.p_output_id, planRevision: args.p_plan_revision, operationId: args.p_operation_id, actorId: args.p_user_id, nativeWorkId: id, completedAt: timestamp.replace("Z", "+00:00") };
    const execution = { execution_id: randomUUID(), plan_work_id: args.p_plan_work_id, output_id: args.p_output_id, plan_revision: args.p_plan_revision, status: "completed", replayed: false, native_work_id: id, native_product_id: args.p_native_product_id, native_resource_kind: args.p_native_resource_kind, receipt, created_at: timestamp };
    executions.push(execution); return { data: [execution], error: null };
  } };
}
const generated = (draft: unknown) => ({ status: "ready", summary: "Give staff a private repair request form and list.", proposedOutputs: [{ id: "repair-app", title: "Repair requests", description: "Staff submit a problem and review open requests.", outcome: "capability", nativeOperationIds: ["create_application"], draft }], steps: [], neededInputs: [], supportedNativeOperationIds: ["create_application"], requiredDecisions: [] });
const draft = { kind: "application", title: "Repair requests", fields: [{ id: "problem", label: "Problem", type: "text", required: true }], components: [{ kind: "form", fields: ["problem"] }, { kind: "list", fields: ["problem"] }] };
const equipmentDraft = {
  kind: "application",
  title: "Equipment requests",
  fields: [
    { id: "equipment", label: "Equipment", type: "text", required: true },
    { id: "location", label: "Location", type: "text", required: true },
    { id: "problem", label: "Problem or request", type: "text", required: true },
    { id: "urgency", label: "Urgency", type: "text", required: true },
    { id: "notes", label: "Notes", type: "text", required: false },
  ],
  components: [
    { kind: "form", fields: ["equipment", "location", "problem", "urgency", "notes"] },
    { kind: "list", fields: ["equipment", "location", "urgency"] },
    { kind: "detail", fields: ["equipment", "location", "problem", "urgency", "notes"] },
  ],
};
beforeEach(() => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_PLANNING_ENABLED", "1"); boundary.database = databaseBoundary(); });
afterEach(() => vi.unstubAllEnvs());
describe("goal to reviewed private application", () => {
  it("validates a synthetic equipment request plan and executes the qualified native application output", async () => {
    const generate = vi.fn(async (input: { userGoal: string; allowedOperations: readonly { id: string; capabilityVersion?: number; productId: string; resourceKind: string }[] }) => {
      // This is an injected structured-output fixture. It deliberately does not call a model or provider.
      expect(input.userGoal).toContain("equipment");
      expect(input.allowedOperations).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "create_application", capabilityVersion: 1, productId: "applications", resourceKind: "application" }),
      ]));
      return generated(equipmentDraft);
    });

    const plan = await createWorkPlan({ actor, workspaceId, userGoal: "Let staff request equipment repairs", generate });
    expect(plan.plan.proposedOutputs[0]?.draft).toEqual(equipmentDraft);
    expect(plan.plan.supportedNativeOperations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "create_application", capabilityVersion: 1, productId: "applications", resourceKind: "application" }),
    ]));

    const accepted = await executeWorkPlanOutput({ actor, workspaceId, planWorkId: plan.work.id, outputId: "repair-app", expectedPlanRevision: 1 });
    expect(accepted).toMatchObject({ nativeProductId: "applications", nativeResourceKind: "application", capabilityVersion: 1, receipt: { capabilityVersion: 1 } });
    const app = await readWorkspaceApplication(actor, accepted.nativeWorkId);
    expect(app.payload).toMatchObject({ status: "draft", records: [], rehearsal: null, spec: { title: "Equipment requests", maintenanceOwner: actor.userId, fields: equipmentDraft.fields } });
  });

  it("rejects a ready create_application output without a draft before saving the plan", async () => {
    await expect(createWorkPlan({ actor, workspaceId, userGoal: "Let staff request equipment repairs", generate: async () => generated(undefined) })).rejects.toThrow(/application draft/i);
  });

  it("generates approved parts from an outcome, saves one actor-owned draft and continues into native checks", async () => {
    const plan = await createWorkPlan({ actor, workspaceId, userGoal: "Let staff report repairs and review the requests", generate: async () => generated(draft) });
    const request = { actor, workspaceId, planWorkId: plan.work.id, outputId: "repair-app", expectedPlanRevision: 1 };
    const accepted = await executeWorkPlanOutput(request);
    const app = await readWorkspaceApplication(actor, accepted.nativeWorkId);
    expect(app.payload).toMatchObject({ status: "draft", revision: 0, records: [], rehearsal: null, spec: { maintenanceOwner: actor.userId, title: "Repair requests" } });
    const replay = await executeWorkPlanOutput(request);
    expect(replay).toMatchObject({ nativeWorkId: accepted.nativeWorkId, status: "already_completed" });
    await changeWorkspaceApplication(actor, app.id, { kind: "rehearse", expectedRevision: 0 });
    expect((await changeWorkspaceApplication(actor, app.id, { kind: "install", expectedRevision: 1 })).payload.status).toBe("installed");
  });
  it("rejects model-supplied code, ownership and undeclared fields instead of creating an application", async () => {
    for (const invalid of [
      { ...draft, script: "fetch('/secrets')" },
      { ...draft, maintenanceOwner: "someone-else" },
      { ...draft, components: [{ kind: "form", fields: ["undeclared"] }] },
    ]) {
      await expect(createWorkPlan({ actor, workspaceId, userGoal: "Collect repair requests", generate: async () => generated(invalid) })).rejects.toThrow(/invalid structured plan/i);
    }
  });
  it("revalidates edited inputs and requires the release gate when the draft is accepted", async () => {
    const plan = await createWorkPlan({ actor, workspaceId, userGoal: "Collect repairs", generate: async () => generated(draft) });
    const request = { actor, workspaceId, planWorkId: plan.work.id, outputId: "repair-app", expectedPlanRevision: 1 };
    await expect(executeWorkPlanOutput({ ...request, inputs: { title: draft.title, fields: draft.fields, components: draft.components, maintenanceOwner: "attacker" } })).rejects.toThrow(/review the application/i);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    await expect(executeWorkPlanOutput(request)).rejects.toThrow(/cannot run/i);
  });

  it("retains SQL timestamp offsets when a generated app is grounded in existing workspace records", async () => {
    const source = await saveNewTracker(actor, { workspaceId, title: "Repairs", input: { fileName: "repairs.csv", content: "Problem\nRoof", mimeType: "text/csv" } });
    const plan = await createWorkPlan({ actor, workspaceId, userGoal: "Create a repair intake form for this work", sourceWorkIds: [source.workId], generate: async () => generated(draft) });
    expect(plan.plan.context?.sources[0]?.updatedAt).toMatch(/\+00:00$/);
    expect((await executeWorkPlanOutput({ actor, workspaceId, planWorkId: plan.work.id, outputId: "repair-app", expectedPlanRevision: 1 })).nativeProductId).toBe("applications");
  });

});
