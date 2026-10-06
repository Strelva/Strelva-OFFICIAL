import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  createPossibility,
  markReady,
  recordRehearsal,
  rehearsePossibility,
  reviseCandidate,
  type Possibility,
} from "@/platform/possibilities";
import {
  createSupabasePossibilityRepository,
  isStoredPossibilityId,
  readPossibilityPreview,
  withdrawIdlePossibilities,
  type PossibilitiesDb,
} from "@/platform/possibilities/supabase-repository";
import { createSupabaseSystemStore, type SystemsDb } from "@/platform/systems/supabase-store";
import {
  createInMemoryApprovalRecords,
  createIsolatedAdapter,
  createMakeReal,
  createSupabaseActivationRepository,
  createSystemStoreLiveSystems,
  type ActivationsDb,
} from "@/platform/make-real";
import { createSupabaseRevisionContent } from "@/platform/make-real/supabase-content";

/*
 * Possibilities in Postgres. Unit cases drive the repository against a
 * stubbed RPC port (argument shaping, error mapping, response checks); with
 * STRELVA_POSSIBILITIES_PSQL set (pnpm check:workspace-sql), the engine and
 * the Make real runner run against the real RPCs on a throwaway cluster.
 * Every outside effect is an ISOLATED fake.
 */

const actor: WorkspaceActor = { userId: "a1000000-0000-4000-8000-000000000001", verifiedEmail: "Owner@Acme.test " };
const AT = "2026-10-06T12:00:00.000Z";

function sample(biz: string): Possibility {
  return createPossibility({
    title: "Consult booking", intent: "Add consult booking.",
    changes: [{ baseline: { businessId: biz, systemId: randomUUID(), revisionId: randomUUID(), number: 1 }, candidate: { summary: "booking", content: { booking: true } } }],
    checks: [{ id: "site-serves", description: "The site serves." }],
  }, { id: randomUUID(), businessId: biz, actorId: actor.userId, at: AT });
}

describe("Supabase PossibilityRepository (stubbed RPC port)", () => {
  it("sends the actor and the document, and parses the stored possibility", async () => {
    const biz = randomUUID();
    const p = sample(biz);
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const db: PossibilitiesDb = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { ...p, replayed: name === "create_system_possibility" && args.p_source_ref === "website-rebuild:w1" }, error: null }; } };
    const repo = createSupabasePossibilityRepository(actor, db);
    await expect(repo.createFromSource(p, "website-rebuild:w1")).resolves.toEqual({ possibility: p, replayed: true });
    expect(calls[0]).toMatchObject({ name: "create_system_possibility", args: { p_workspace_id: biz, p_user_id: actor.userId, p_verified_email: "owner@acme.test", p_source_ref: "website-rebuild:w1" } });
    // A plain create that comes back as someone else's replay is not trusted.
    await expect(repo.create(p)).resolves.toBeUndefined();
    await expect(repo.get(biz, p.id)).resolves.toEqual(p);
  });

  it("finds nothing for ids that cannot be stored, without calling the database", async () => {
    let called = 0;
    const repo = createSupabasePossibilityRepository(actor, { rpc: async () => { called++; return { data: null, error: null }; } });
    await expect(repo.get("not-a-workspace", randomUUID())).resolves.toBeNull();
    await expect(repo.get(randomUUID(), "website-rebuild:w1")).resolves.toBeNull();
    await expect(repo.list("not-a-workspace")).resolves.toEqual([]);
    expect(called).toBe(0);
    expect(isStoredPossibilityId("website-rebuild:w1")).toBe(false);
    expect(isStoredPossibilityId(randomUUID())).toBe(true);
  });

  it("maps every database refusal to the error the engine and runner expect", async () => {
    const p = sample(randomUUID());
    const cases: Array<[string, unknown, RegExp?]> = [
      ["business_record_access_denied", WorkspaceAccessError],
      ["system_possibility_not_found", WorkspaceAccessError],
      ["system_not_found", WorkspaceAccessError],
      ["system_possibility_revision_conflict", WorkspaceConflictError, /changed/],
      ["system_possibility_closed", WorkspaceConflictError, /closed/],
      ["system_possibility_stale", WorkspaceConflictError, /back to Exploring/],
      ["system_possibility_exists", WorkspaceConflictError, /already exists/],
      ["workspace_exit_future_work_blocked", WorkspaceConflictError, /stopped/],
      ["system_possibility_invalid", WorkspaceStoreError, /rules/],
      ["connection reset", WorkspaceStoreError, /could not be saved/],
    ];
    for (const [message, type, text] of cases) {
      const repo = createSupabasePossibilityRepository(actor, { rpc: async () => ({ data: null, error: { message } }) });
      await expect(repo.save(p, 0)).rejects.toBeInstanceOf(type as typeof Error);
      if (text) await expect(repo.save(p, 0)).rejects.toThrow(text);
    }
  });

  it("rejects malformed or mismatched responses instead of trusting them", async () => {
    const biz = randomUUID();
    const p = sample(biz);
    const respond = (data: unknown) => createSupabasePossibilityRepository(actor, { rpc: async () => ({ data, error: null }) });
    await expect(respond({ id: p.id }).get(biz, p.id)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(respond({ ...p, businessId: randomUUID() }).get(biz, p.id)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(respond({ ...p, id: randomUUID() }).get(biz, p.id)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(respond({ ...p, revision: 4 }).save({ ...p, revision: 1, history: [{ revision: 1, kind: "revise", actorId: "a", at: AT }] }, 0)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(respond(null).get(biz, p.id)).resolves.toBeNull();
    await expect(respond([{ sourceRef: null }]).list(biz)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("validates the actor and the document before calling the database", async () => {
    const p = sample(randomUUID());
    let called = 0;
    const db: PossibilitiesDb = { rpc: async () => { called++; return { data: null, error: null }; } };
    await expect(createSupabasePossibilityRepository({ userId: "owner-1", verifiedEmail: "o@acme.test" }, db).save(p, 0)).rejects.toThrow();
    await expect(createSupabasePossibilityRepository(actor, db).save({ ...p, checks: [] }, 0)).rejects.toThrow();
    await expect(createSupabasePossibilityRepository(actor, db).save({ ...p, id: "website-rebuild:w1" }, 0)).rejects.toThrow();
    await expect(createSupabasePossibilityRepository(actor, db).save(p, -1)).rejects.toThrow();
    expect(called).toBe(0);
  });

  it("reads a preview only for an open candidate of the named business, and withdraws idle ones", async () => {
    const biz = randomUUID();
    const p = sample(biz);
    const { history: _h, createdBy: _c, ...preview } = p;
    await expect(readPossibilityPreview({ businessId: biz, possibilityId: p.id, candidateRevision: 1 }, { rpc: async () => ({ data: preview, error: null }) })).resolves.toEqual(preview);
    await expect(readPossibilityPreview({ businessId: biz, possibilityId: p.id, candidateRevision: 1 }, { rpc: async () => ({ data: { ...preview, businessId: randomUUID() }, error: null }) })).resolves.toBeNull();
    await expect(readPossibilityPreview({ businessId: biz, possibilityId: "website-rebuild:w1", candidateRevision: 1 }, { rpc: async () => { throw new Error("not called"); } })).resolves.toBeNull();
    const withdrawn = [{ workspaceId: biz, possibilityId: p.id, title: "Consult booking" }];
    let args: Record<string, unknown> = {};
    await expect(withdrawIdlePossibilities({}, { rpc: async (_n, a) => { args = a; return { data: withdrawn, error: null }; } })).resolves.toEqual(withdrawn);
    expect(args).toEqual({ p_idle_days: 90, p_limit: 100 });
  });
});

/** RPCs through psql against an isolated local cluster (never a remote database). */
const TYPES: Record<string, string> = {
  p_workspace_id: "uuid", p_user_id: "uuid", p_verified_email: "text", p_possibility_id: "uuid", p_expected_revision: "integer",
  p_body: "jsonb", p_source_ref: "text", p_system_id: "uuid", p_expected_change: "bigint", p_input: "jsonb", p_command_id: "uuid",
  p_command_digest: "text", p_activate: "boolean", p_revision_id: "uuid", p_expected_current: "uuid", p_content_hash: "text",
  p_content: "jsonb", p_candidate_revision: "integer", p_idle_days: "integer", p_limit: "integer", p_patch: "jsonb", p_to: "text",
  p_activation_id: "text", p_activation: "jsonb",
};
function psqlDb(connection: string): PossibilitiesDb & SystemsDb & ActivationsDb & { exec(sql: string): string } {
  const base = [...connection.split(" ").filter(Boolean), "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"];
  return {
    exec(sql) { return execFileSync("psql", base, { input: sql, encoding: "utf8" }).trim(); },
    async rpc(name, args) {
      const keys = Object.keys(args).filter((key) => args[key] !== undefined);
      const vars = keys.flatMap((key, i) => args[key] === null ? [] : ["-v", `a${i}=${typeof args[key] === "object" ? JSON.stringify(args[key]) : String(args[key])}`]);
      const params = keys.map((key, i) => args[key] === null ? `${key} => null::${TYPES[key] ?? "text"}` : `${key} => :'a${i}'::${TYPES[key] ?? (typeof args[key] === "object" ? "jsonb" : "text")}`).join(", ");
      try {
        const out = execFileSync("psql", [...base, ...vars], { input: `select coalesce(to_jsonb(public.${name}(${params})), 'null'::jsonb);\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        return { data: JSON.parse(out.trim()), error: null };
      } catch (error) {
        return { data: null, error: { message: String((error as { stderr?: string }).stderr ?? error) } };
      }
    },
  };
}

const PSQL = process.env.STRELVA_POSSIBILITIES_PSQL;

describe.runIf(Boolean(PSQL))("Postgres possibilities (real RPCs on a throwaway cluster)", () => {
  async function setup() {
    const db = psqlDb(PSQL!);
    const biz = randomUUID();
    const user = randomUUID();
    const email = `owner-${user.slice(0, 8)}@example.test`;
    db.exec(`insert into public.users(id, email, verified_at) values ('${user}', '${email}', now());
      insert into public.workspaces(id, kind, name, created_by) values ('${biz}', 'customer', 'Possibility contract', '${user}');
      insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values ('${biz}', '${user}', 'owner', '${user}');`);
    const owner: WorkspaceActor = { userId: user, verifiedEmail: email };
    const store = createSupabaseSystemStore(db);
    const content = createSupabaseRevisionContent(owner, db);
    const site = await store.createSystem(owner, biz, { name: "attymooney.com", kind: "website" }, randomUUID());
    const ref = { businessId: biz, systemId: site.id };
    await store.recordRevision(owner, ref, site.changeNumber, { implementation: await content.put(biz, { pages: 3 }), summary: "Today" }, randomUUID());
    const live = createSystemStoreLiveSystems({ store, content, actor: owner });
    const repo = createSupabasePossibilityRepository(owner, db);
    return { db, biz, owner, store, content, live, repo, ref };
  }

  async function ready(p: Possibility, deps: Awaited<ReturnType<typeof setup>>, adapters = [createIsolatedAdapter("publish")]): Promise<Possibility> {
    const rehearsal = await rehearsePossibility(p, deps.live, adapters, AT);
    const rehearsed = recordRehearsal(p, rehearsal, p.revision, deps.owner.userId, AT);
    await deps.repo.save(rehearsed, p.revision);
    const r = await markReady(rehearsed, deps.live, rehearsed.revision, deps.owner.userId, AT);
    await deps.repo.save(r, rehearsed.revision);
    return r;
  }

  it("survives a reload, replays a backfill, and goes stale in the same transaction as a direct edit", async () => {
    const deps = await setup();
    const current = await deps.live.current(deps.ref);
    const p = createPossibility({
      title: "Consult booking", intent: "Add consult booking.",
      changes: [{ baseline: { ...deps.ref, revisionId: current!.revisionId, number: current!.number }, candidate: { summary: "booking", content: { pages: 4 } } }],
      checks: [{ id: "site-serves", description: "The site serves." }],
    }, { id: randomUUID(), businessId: deps.biz, actorId: deps.owner.userId, at: AT });
    const created = await deps.repo.createFromSource(p, "website-rebuild:w1");
    expect(created.replayed).toBe(false);
    const again = await deps.repo.createFromSource({ ...p, id: randomUUID() }, "website-rebuild:w1");
    expect(again).toMatchObject({ replayed: true, possibility: { id: p.id } });

    const r = await ready(p, deps);
    // A fresh repository (a restart) reads the same Ready possibility with its history.
    const reloaded = await createSupabasePossibilityRepository(deps.owner, deps.db).get(deps.biz, p.id);
    expect(reloaded).toMatchObject({ status: "ready", revision: r.revision });
    expect(reloaded!.history.map((h) => h.kind)).toEqual(["rehearse", "ready"]);
    // A writer holding the older revision loses.
    await expect(deps.repo.save(reviseCandidate(r, { title: "Late" }, r.revision, deps.owner.userId, AT), r.revision - 1)).rejects.toBeInstanceOf(WorkspaceConflictError);

    // A direct edit to the live site: the pin moves, the possibility is Exploring.
    const detail = await deps.store.readSystem(deps.owner, deps.ref);
    await deps.store.recordRevision(deps.owner, deps.ref, detail.system.changeNumber, { implementation: await deps.content.put(deps.biz, { pages: 5 }), summary: "Edit" }, randomUUID());
    const stale = await deps.repo.get(deps.biz, p.id);
    expect(stale).toMatchObject({ status: "exploring" });
    expect(stale!.rehearsal).toBeUndefined();
    expect(stale!.history.at(-1)).toMatchObject({ kind: "stale", detail: "attymooney.com changed since this was built." });
    // The old rehearsal is gone, and a new one against the moved site fails.
    await expect(markReady(stale!, deps.live, stale!.revision, deps.owner.userId, AT)).rejects.toThrow(/Rehearse the current candidate/);
    const rerun = await rehearsePossibility(stale!, deps.live, [createIsolatedAdapter("publish")], AT);
    expect(rerun.ok).toBe(false);

    const stranger = createSupabasePossibilityRepository({ userId: randomUUID(), verifiedEmail: "nobody@example.test" }, deps.db);
    await expect(stranger.get(deps.biz, p.id)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect((await deps.repo.list(deps.biz)).map((x) => x.id)).toEqual([p.id]);
  });

  it("runs Make real against stored possibilities, activations and Systems: refresh, ready, made real", async () => {
    const deps = await setup();
    const current = await deps.live.current(deps.ref);
    let p = createPossibility({
      title: "Rebuilt site", intent: "Replace the site.",
      changes: [{ baseline: { ...deps.ref, revisionId: current!.revisionId, number: current!.number }, candidate: { summary: "rebuilt", content: { pages: 9 } } }],
      checks: [{ id: "site-serves", description: "The site serves." }],
    }, { id: randomUUID(), businessId: deps.biz, actorId: deps.owner.userId, at: AT });
    await deps.repo.create(p);
    p = await ready(p, deps);
    const makeReal = createMakeReal({
      possibilities: deps.repo,
      activations: createSupabaseActivationRepository(deps.owner, deps.db),
      live: deps.live,
      authority: { async check() { return { allowed: true, grantId: "owner" }; } },
      adapters: [createIsolatedAdapter("publish")],
      checks: { async run() { return { passed: true, detail: "Serves." }; } },
      approvals: createInMemoryApprovalRecords(),
      clock: () => AT,
    });
    const started = await makeReal.start(deps.owner, deps.biz, p.id);
    const done = await makeReal.run(deps.owner, deps.biz, started.id);
    expect(done.status).toBe("made_real");
    // The activation's own pointer switch never staled the possibility it was making real.
    expect(await deps.repo.get(deps.biz, p.id)).toMatchObject({ status: "made_real", activationId: started.id });
    expect((await deps.live.current(deps.ref))!.content).toEqual({ pages: 9 });
    await expect(deps.repo.save({ ...p, revision: p.revision + 10 }, p.revision)).rejects.toThrow();
  });
});
