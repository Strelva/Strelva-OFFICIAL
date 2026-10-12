import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { createInMemoryPossibilityRepository, createPossibility, markReady, recordRehearsal, rehearsePossibility } from "@/platform/possibilities";
import {
  createInMemoryActivationRepository,
  createInMemoryApprovalRecords,
  createInMemoryLiveSystems,
  createIsolatedAdapter,
  createMakeReal,
  createSupabaseActivationRepository,
  effectApprovalSubject,
  type Activation,
  type ActivationRepository,
  type ActivationsDb,
} from "@/platform/make-real";

/*
 * The Postgres-backed ActivationRepository. A fake RPC server stands in for
 * 20261007155000_make_real_activations.sql (JSON round-trip, membership,
 * compare-and-set, history growth); with STRELVA_MAKE_REAL_PSQL set, the same
 * runner scenarios also run against the real RPCs on a throwaway cluster.
 * Every outside effect is an ISOLATED fake.
 */

const actor: WorkspaceActor = { userId: "a1000000-0000-4000-8000-000000000001", verifiedEmail: "Owner@Acme.test " };

type Row = { payload: Activation };
type Rpc = { name: string; args: Record<string, unknown> };

/** Mirrors the SQL's access and compare-and-set rules closely enough to drive the runner. */
function fakeDb(members: Record<string, string[]>) {
  const rows = new Map<string, Row>();
  const calls: Rpc[] = [];
  const fail = (message: string) => ({ data: null, error: { message } });
  const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const db: ActivationsDb = {
    async rpc(name, args) {
      calls.push({ name, args: json(args) });
      const ws = String(args.p_workspace_id);
      if (!members[ws]?.includes(String(args.p_user_id))) return fail("make_real_activation_access_denied");
      if (name === "read_make_real_activation") {
        const row = rows.get(`${ws}|${String(args.p_activation_id)}`);
        return { data: row ? json(row.payload) : null, error: null };
      }
      const next = json(args.p_activation) as Activation;
      if (next.businessId !== ws) return fail("make_real_activation_invalid");
      const key = `${ws}|${next.id}`;
      if (name === "create_make_real_activation") {
        if (rows.has(key)) return fail("make_real_activation_exists");
        if (next.revision !== 0 || next.history.length) return fail("make_real_activation_invalid");
        rows.set(key, { payload: next });
        return { data: json(next), error: null };
      }
      if (name === "save_make_real_activation") {
        const row = rows.get(`${ws}|${String(args.p_activation_id)}`);
        if (!row) return fail("make_real_activation_not_found");
        if (row.payload.revision !== args.p_expected_revision) return fail("make_real_activation_revision_conflict");
        if (next.revision !== row.payload.revision + 1 || next.history.length !== row.payload.history.length + 1
          || JSON.stringify(next.history.slice(0, -1)) !== JSON.stringify(row.payload.history)
          || next.history.at(-1)!.actorId !== args.p_user_id) return fail("make_real_activation_invalid");
        row.payload = next;
        return { data: json(next), error: null };
      }
      return fail("unknown function");
    },
  };
  return { db, rows, calls };
}

/** One page System, one approved calendar effect, one operating check. */
async function runScenario(activations: ActivationRepository, businessId: string, opts: { failCheck: boolean; compensation?: "refused" | "ambiguous"; skipRollback?: boolean }, who: WorkspaceActor = actor) {
  const actor = who;
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 9, 6, 12, 0, tick++)).toISOString();
  let n = 0;
  const ids = () => `id-${++n}`;
  const live = createInMemoryLiveSystems();
  const page = { businessId, systemId: "5a9e0000-0000-4000-8000-0000000000a1" };
  const baseline = live.seed(page, "Packages page", { headline: "Old" });
  const calendar = createIsolatedAdapter("calendar");
  const compensate = calendar.compensate!;
  if (opts.compensation === "refused") calendar.compensate = async () => ({ ok: false, detail: "Cancellation was refused without an effect." });
  if (opts.compensation === "ambiguous") calendar.compensate = async (input) => {
    await compensate(input);
    throw new Error("Connection lost after the provider accepted cancellation.");
  };
  const adapters = [calendar, createIsolatedAdapter("message"), createIsolatedAdapter("payment"), createIsolatedAdapter("publish")];
  const at = clock();
  let p = createPossibility({
    title: "Kickoff booking",
    intent: "Let package buyers book a kickoff call.",
    changes: [{ baseline: { ...page, revisionId: baseline, number: 1 }, candidate: { summary: "Adds booking", content: { headline: "Book a kickoff" } } }],
    effects: [{ id: "kickoff", kind: "calendar", system: { systemId: page.systemId }, description: "Create a kickoff booking type", request: { minutes: 30 } }],
    checks: [{ id: "bookable", description: "A buyer can book" }],
  }, { id: "poss-1", businessId, actorId: actor.userId, at });
  p = recordRehearsal(p, await rehearsePossibility(p, live.port, adapters, at), p.revision, actor.userId, at);
  p = await markReady(p, live.port, p.revision, actor.userId, at);
  const possibilities = createInMemoryPossibilityRepository();
  await possibilities.create(p);
  const approvals = createInMemoryApprovalRecords();
  approvals.record({ id: "approval-kickoff", businessId, subject: effectApprovalSubject(p, p.effects[0]!), status: "approved", decidedBy: actor.userId, decidedAt: at });
  const makeReal = createMakeReal({
    possibilities, activations, live: live.port, adapters, approvals, clock, ids,
    authority: { check: async () => ({ allowed: true, grantId: "grant-1" }) },
    checks: { run: async () => (opts.failCheck ? { passed: false, detail: "forced" } : { passed: true, detail: "ok" }) },
  });
  const started = await makeReal.start(actor, businessId, "poss-1", { approvals: [{ effectId: "kickoff", approvalId: "approval-kickoff" }] });
  let result = await makeReal.run(actor, businessId, started.id);
  if (opts.failCheck && !opts.skipRollback) result = await makeReal.rollback(actor, businessId, started.id);
  return { result, stored: await activations.get(businessId, started.id), calendar, compensate, makeReal, possibilities };
}

const shape = (a: Activation) => ({
  status: a.status,
  revision: a.revision,
  steps: a.steps.map((s) => ({ id: s.id, status: s.status, effect: s.effect, attempts: s.attempts })),
  history: a.history.map((h) => h.kind),
});

describe("Postgres ActivationRepository (fake RPC)", () => {
  it("sends the bound actor, the business and the activation to the RPCs", async () => {
    const biz = randomUUID();
    const { db, calls } = fakeDb({ [biz]: [actor.userId] });
    const { result } = await runScenario(createSupabaseActivationRepository(actor, db), biz, { failCheck: false });
    expect(calls[0]).toMatchObject({ name: "create_make_real_activation", args: { p_workspace_id: biz, p_user_id: actor.userId, p_verified_email: "owner@acme.test" } });
    const saves = calls.filter((c) => c.name === "save_make_real_activation");
    expect(saves.length).toBe(result.revision);
    expect(saves.every((c, i) => c.args.p_expected_revision === i && c.args.p_activation_id === result.id)).toBe(true);
  });

  it("runs Make real to made_real with the same step log as the in-memory repository", async () => {
    const biz = randomUUID();
    const memory = await runScenario(createInMemoryActivationRepository(), biz, { failCheck: false });
    const { db } = fakeDb({ [biz]: [actor.userId] });
    const durable = await runScenario(createSupabaseActivationRepository(actor, db), biz, { failCheck: false });
    expect(durable.result.status).toBe("made_real");
    expect(shape(durable.result)).toEqual(shape(memory.result));
    expect(durable.stored).toEqual(JSON.parse(JSON.stringify(durable.result)));
    expect(durable.calendar.calls.perform).toBe(1);
  });

  it("rolls back a failed activation with the same compensations as the in-memory repository", async () => {
    const biz = randomUUID();
    const memory = await runScenario(createInMemoryActivationRepository(), biz, { failCheck: true });
    const { db } = fakeDb({ [biz]: [actor.userId] });
    const durable = await runScenario(createSupabaseActivationRepository(actor, db), biz, { failCheck: true });
    expect(durable.result.status).toBe("rolled_back");
    expect(durable.result.history).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "rollback_step" })]));
    expect(shape(durable.result)).toEqual(shape(memory.result));
  });

  it("refuses a stale save as a conflict, and a second create as a conflict", async () => {
    const biz = randomUUID();
    const { db } = fakeDb({ [biz]: [actor.userId] });
    const repo = createSupabaseActivationRepository(actor, db);
    const { result } = await runScenario(repo, biz, { failCheck: false });
    const stale = structuredClone(result);
    stale.revision = 1;
    stale.history = stale.history.slice(0, 1);
    await expect(repo.save(stale, 0)).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(repo.create({ ...result, revision: 0, history: [] })).rejects.toBeInstanceOf(WorkspaceConflictError);
  });

  it("refuses another business's member and finds nothing for a non-workspace id", async () => {
    const biz = randomUUID();
    const { db, calls } = fakeDb({ [biz]: [actor.userId] });
    const { result } = await runScenario(createSupabaseActivationRepository(actor, db), biz, { failCheck: false });
    const stranger = createSupabaseActivationRepository({ userId: randomUUID(), verifiedEmail: "s@other.test" }, db);
    await expect(stranger.get(biz, result.id)).rejects.toBeInstanceOf(WorkspaceAccessError);
    const before = calls.length;
    await expect(createSupabaseActivationRepository(actor, db).get("not-a-workspace", result.id)).resolves.toBeNull();
    expect(calls.length).toBe(before);
  });

  it("maps each database refusal to the workspace error the runner expects", async () => {
    const biz = randomUUID();
    const { result } = await runScenario(createInMemoryActivationRepository(), biz, { failCheck: false });
    const cases: Array<[string, unknown, RegExp?]> = [
      ["make_real_activation_access_denied", WorkspaceAccessError],
      ["make_real_activation_not_found", WorkspaceAccessError],
      ["make_real_activation_revision_conflict", WorkspaceConflictError, /changed/],
      ["make_real_activation_exists", WorkspaceConflictError, /already exists/],
      ["workspace_exit_future_work_blocked", WorkspaceConflictError, /stopped/],
      ["make_real_activation_invalid", WorkspaceStoreError, /step log rules/],
      ["connection reset", WorkspaceStoreError, /could not be saved/],
    ];
    for (const [message, type, text] of cases) {
      const repo = createSupabaseActivationRepository(actor, { rpc: async () => ({ data: null, error: { message } }) });
      const attempt = repo.save(result, result.revision - 1);
      await expect(attempt).rejects.toBeInstanceOf(type as typeof Error);
      if (text) await expect(repo.save(result, result.revision - 1)).rejects.toThrow(text);
    }
  });

  it("rejects malformed or mismatched responses instead of trusting them", async () => {
    const biz = randomUUID();
    const { result } = await runScenario(createInMemoryActivationRepository(), biz, { failCheck: false });
    const respond = (data: unknown) => createSupabaseActivationRepository(actor, { rpc: async () => ({ data, error: null }) });
    await expect(respond({ id: result.id }).get(biz, result.id)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(respond({ ...result, businessId: randomUUID() }).get(biz, result.id)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(respond({ ...result, id: "other" }).get(biz, result.id)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(respond({ ...result, revision: result.revision - 1 }).save(result, result.revision - 1)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(respond(null).get(biz, result.id)).resolves.toBeNull();
    await expect(respond(result).get(biz, result.id)).resolves.toEqual(result);
  });

  it("validates the actor and payload before calling the database", async () => {
    const biz = randomUUID();
    const { result } = await runScenario(createInMemoryActivationRepository(), biz, { failCheck: false });
    let called = 0;
    const db: ActivationsDb = { rpc: async () => { called++; return { data: null, error: null }; } };
    await expect(createSupabaseActivationRepository({ userId: "owner-1", verifiedEmail: "o@acme.test" }, db).save(result, 0)).rejects.toThrow();
    await expect(createSupabaseActivationRepository(actor, db).save({ ...result, steps: [] }, 0)).rejects.toThrow();
    await expect(createSupabaseActivationRepository(actor, db).save(result, -1)).rejects.toThrow();
    expect(called).toBe(0);
  });
});

/** RPCs through psql against an isolated local cluster (never a remote database). */
function psqlDb(connection: string): ActivationsDb & { exec(sql: string): void } {
  const base = [...connection.split(" ").filter(Boolean), "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  const types: Record<string, string> = {
    p_workspace_id: "uuid", p_user_id: "uuid", p_verified_email: "text", p_activation_id: "text",
    p_expected_revision: "integer", p_activation: "jsonb",
  };
  return {
    exec(sql) { execFileSync("psql", base, { input: sql, encoding: "utf8" }); },
    async rpc(name, args) {
      const keys = Object.keys(args);
      const vars = keys.flatMap((key, i) => ["-v", `a${i}=${typeof args[key] === "object" ? JSON.stringify(args[key]) : String(args[key])}`]);
      const params = keys.map((key, i) => `${key} => :'a${i}'::${types[key]}`).join(", ");
      try {
        const out = execFileSync("psql", [...base, ...vars], { input: `select coalesce(to_jsonb(public.${name}(${params})), 'null'::jsonb);\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        return { data: JSON.parse(out.trim()), error: null };
      } catch (error) {
        return { data: null, error: { message: String((error as { stderr?: string }).stderr ?? error) } };
      }
    },
  };
}

const PSQL = process.env.STRELVA_MAKE_REAL_PSQL;

describe.runIf(Boolean(PSQL))("Postgres ActivationRepository (real RPCs on a throwaway cluster)", () => {
  function setup() {
    const db = psqlDb(PSQL!);
    const biz = randomUUID();
    const user = randomUUID();
    const email = `owner-${user.slice(0, 8)}@example.test`;
    db.exec(`insert into public.users(id, email, verified_at) values ('${user}', '${email}', now());
      insert into public.workspaces(id, kind, name, created_by) values ('${biz}', 'customer', 'Make real contract', '${user}');
      insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values ('${biz}', '${user}', 'owner', '${user}');`);
    const owner: WorkspaceActor = { userId: user, verifiedEmail: email };
    return { db, biz, owner };
  }

  it("passes every runner checkpoint to made_real and refuses a stale save", async () => {
    const { db, biz, owner } = setup();
    const repo = createSupabaseActivationRepository(owner, db);
    const durable = await runScenario(repo, biz, { failCheck: false }, owner);
    const memory = await runScenario(createInMemoryActivationRepository(), biz, { failCheck: false }, owner);
    expect(durable.result.status).toBe("made_real");
    expect(shape(durable.result)).toEqual(shape(memory.result));
    expect(durable.stored).toEqual(JSON.parse(JSON.stringify(durable.result)));
    // A writer still holding an older revision loses the compare-and-set.
    await expect(repo.save(durable.result, durable.result.revision - 1)).rejects.toBeInstanceOf(WorkspaceConflictError);
    // A closed activation takes no further event.
    const late = structuredClone(durable.result);
    late.revision += 1;
    late.history.push({ revision: late.revision, kind: "resume", actorId: owner.userId, at: late.updatedAt });
    await expect(repo.save(late, durable.result.revision)).rejects.toBeInstanceOf(WorkspaceStoreError);
    const stranger = createSupabaseActivationRepository({ userId: randomUUID(), verifiedEmail: "nobody@example.test" }, db);
    await expect(stranger.get(biz, durable.result.id)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("passes every rollback checkpoint to rolled_back", async () => {
    const { db, biz, owner } = setup();
    const durable = await runScenario(createSupabaseActivationRepository(owner, db), biz, { failCheck: true }, owner);
    const memory = await runScenario(createInMemoryActivationRepository(), biz, { failCheck: true }, owner);
    expect(durable.result.status).toBe("rolled_back");
    expect(durable.result.steps.some((s) => s.status === "compensated" || s.status === "restored")).toBe(true);
    expect(shape(durable.result)).toEqual(shape(memory.result));
  });

  it("refuses forged rollback closure before any undo claim exists", async () => {
    const { db, biz, owner } = setup();
    const repo = createSupabaseActivationRepository(owner, db);
    const scenario = await runScenario(repo, biz, { failCheck: true, skipRollback: true }, owner);
    const accepted = scenario.result.steps.find((s) => s.kind === "effect")!;
    expect(accepted).toMatchObject({ status: "completed", effect: "accepted", reversibility: "compensable" });
    expect(accepted.compensation).toBeUndefined();
    const forgedOutcome = structuredClone(scenario.result);
    forgedOutcome.rollbackStartedAt = forgedOutcome.updatedAt;
    forgedOutcome.revision++;
    forgedOutcome.steps.find((s) => s.id === accepted.id)!.status = "compensated";
    forgedOutcome.history.push({ revision: forgedOutcome.revision, kind: "rollback_step", actorId: owner.userId, at: forgedOutcome.updatedAt });
    await expect(repo.save(forgedOutcome, scenario.result.revision)).rejects.toBeInstanceOf(WorkspaceStoreError);
    const closed = structuredClone(scenario.result);
    closed.status = "rolled_back";
    closed.rollbackStartedAt = closed.updatedAt;
    closed.revision++;
    closed.history.push({ revision: closed.revision, kind: "rollback", actorId: owner.userId, at: closed.updatedAt });
    await expect(repo.save(closed, scenario.result.revision)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect((await repo.get(biz, scenario.result.id))?.status).toBe("needs_attention");
  });

  it("refuses closure while an internal live pointer is still switched", async () => {
    const { db, biz, owner } = setup();
    const repo = createSupabaseActivationRepository(owner, db);
    const scenario = await runScenario(repo, biz, { failCheck: true, skipRollback: true }, owner);
    const effectIndex = scenario.result.steps.findIndex((s) => s.kind === "effect");
    // A trusted historical fixture isolates the internal restoration guard
    // from the compensable-effect closure guard exercised above.
    db.exec(`begin; select public.make_real_activation_set_writer(true);
      update public.saved_product_work set payload=jsonb_set(payload,'{steps,${effectIndex},reversibility}','"irreversible"'::jsonb)
      where workspace_id='${biz}' and product_id='operations' and resource_kind='activation'; commit;`);
    const current = (await repo.get(biz, scenario.result.id))!;
    expect(current.steps.some((s) => s.kind === "activate" && s.status === "completed")).toBe(true);
    const closed = structuredClone(current);
    closed.status = "rolled_back";
    closed.rollbackStartedAt = closed.updatedAt;
    closed.revision++;
    closed.history.push({ revision: closed.revision, kind: "rollback", actorId: owner.userId, at: closed.updatedAt });
    await expect(repo.save(closed, current.revision)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect((await repo.get(biz, current.id))?.status).toBe("needs_attention");
  });

  it("keeps refused compensation durable and attached, then retries only the undo", async () => {
    const { db, biz, owner } = setup();
    const repo = createSupabaseActivationRepository(owner, db);
    const scenario = await runScenario(repo, biz, { failCheck: true, compensation: "refused" }, owner);
    expect(scenario.result.status).toBe("needs_attention");
    expect(scenario.stored?.steps.find((s) => s.kind === "effect")?.compensation?.status).toBe("failed");
    expect((await scenario.possibilities.get(biz, "poss-1"))?.activationId).toBe(scenario.result.id);
    const performed = scenario.calendar.calls.perform;
    scenario.calendar.compensate = scenario.compensate;
    const recovered = await scenario.makeReal.rollback(owner, biz, scenario.result.id);
    expect(recovered.status).toBe("rolled_back");
    expect((await repo.get(biz, scenario.result.id))?.status).toBe("rolled_back");
    expect(scenario.calendar.calls.perform).toBe(performed);
  });

  it("persists ambiguous compensation and requires evidence before closing it", async () => {
    const { db, biz, owner } = setup();
    const repo = createSupabaseActivationRepository(owner, db);
    const scenario = await runScenario(repo, biz, { failCheck: true, compensation: "ambiguous" }, owner);
    const step = scenario.stored!.steps.find((s) => s.kind === "effect")!;
    expect(step.compensation).toMatchObject({ status: "unknown", claimId: expect.any(String) });
    const forge = (kind: string) => {
      const next = structuredClone(scenario.stored!);
      next.revision++;
      next.history.push({ revision: next.revision, kind, actorId: owner.userId, at: next.updatedAt });
      return next;
    };
    const closed = forge("rollback");
    closed.status = "rolled_back";
    await expect(repo.save(closed, scenario.stored!.revision)).rejects.toBeInstanceOf(WorkspaceStoreError);
    const replay = forge("rollback_compensation_claim");
    replay.steps.find((s) => s.id === step.id)!.compensation = {
      status: "running", detail: "Forged replacement claim", at: replay.updatedAt, claimId: randomUUID(),
    };
    await expect(repo.save(replay, scenario.stored!.revision)).rejects.toBeInstanceOf(WorkspaceStoreError);
    const forgedOutcome = forge("rollback_step");
    const forgedStep = forgedOutcome.steps.find((s) => s.id === step.id)!;
    forgedStep.status = "compensated";
    forgedStep.compensation = { status: "compensated", detail: "No evidence", at: forgedOutcome.updatedAt };
    await expect(repo.save(forgedOutcome, scenario.stored!.revision)).rejects.toBeInstanceOf(WorkspaceStoreError);
    const removed = forge("rollback_step");
    delete removed.steps.find((s) => s.id === step.id)!.compensation;
    await expect(repo.save(removed, scenario.stored!.revision)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(scenario.calendar.calls.compensate).toBe(1);
    await scenario.makeReal.rollback(owner, biz, scenario.result.id);
    expect(scenario.calendar.calls.compensate).toBe(1);
    await scenario.makeReal.reconcile(owner, biz, scenario.result.id, {
      stepId: step.id, target: "compensation", resolution: "completed",
      evidence: "The provider cancellation ledger confirms the original effect is undone.",
    });
    const recovered = await scenario.makeReal.rollback(owner, biz, scenario.result.id);
    expect(recovered.status).toBe("rolled_back");
    expect((await repo.get(biz, scenario.result.id))?.steps.find((s) => s.id === step.id)?.compensation?.status).toBe("compensated");
    expect(scenario.calendar.calls.compensate).toBe(1);
  });
});
