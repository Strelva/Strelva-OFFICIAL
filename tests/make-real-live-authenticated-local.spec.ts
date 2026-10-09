import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { applicationSchema } from "@/products/applications/contracts";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { getInquiryRepository } from "@/products/inquiries/repository";
import type { InquirySurfaceResult } from "@/products/inquiries/surface-contracts";
import { createPossibility, markReady, recordRehearsal } from "@/platform/possibilities/engine";
import type { PossibilityInput } from "@/platform/possibilities/contracts";
import { createSupabasePossibilityRepository } from "@/platform/possibilities/supabase-repository";
import { activationSchema } from "@/platform/make-real/contracts";
import { inquiryFormRequestSchema, internalAppRequestSchema } from "@/platform/make-real/live-adapters";
import { createSupabaseRevisionContent } from "@/platform/make-real/supabase-content";
import { createSystemStoreLiveSystems } from "@/platform/make-real/systems-adapter";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { adminClient, cleanup, convertedBusinessWithOwner, decisions, journeyEnvironment, person, type Person } from "./support/journeys";

// Real local Auth, native RPCs, HTTP publication and durable read-back. No
// route interception, fake provider acceptance, calendar connection or remote
// publication. Fixture preparation records schema/readiness evidence only;
// acceptance and operating evidence must come from the actual activation.
// Public booking, hosted websites, Google listings, IDX and SPT remain pending.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_MAKE_REAL_LIVE_JOURNEY !== "1",
  "Requires an explicitly authorized disposable local Auth/Redis/Postgres journey window.");
test.beforeAll(() => {
  const env = journeyEnvironment();
  if (process.env.SUPABASE_URL !== env.url || process.env.SUPABASE_SERVICE_ROLE_KEY !== env.service) {
    throw new Error("Native inquiry preparation must use the same loopback database as local Auth; no memory fallback.");
  }
  if (!["1", "workspace"].includes(process.env.STRELVA_MAKE_REAL_LIVE ?? "")) {
    throw new Error("The local server must enable the real Make Real channel resolver.");
  }
});
test.setTimeout(300_000);

async function post(request: APIRequestContext, path: string, data: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: journeyEnvironment().app, "sec-fetch-site": "same-origin" }, data });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

test("a real owner reviews and makes native inquiry/app changes live, proves receipts and rollback, and sees booking's pending verification", async ({ browser }, testInfo) => {
  const admin = adminClient();
  let setup: Awaited<ReturnType<typeof convertedBusinessWithOwner>> | null = null;
  let member: Person | null = null;
  try {
    setup = await convertedBusinessWithOwner(browser, admin, "live-makereal");
    const { owner, operator, businessId, tenantId } = setup;
    const actor = { userId: owner.userId, verifiedEmail: owner.email };
    const store = createSupabaseSystemStore(admin);
    const content = createSupabaseRevisionContent(actor, admin);
    const live = createSystemStoreLiveSystems({ actor, store, content });
    const possibilities = createSupabasePossibilityRepository(actor, admin);
    for (const flag of ["systems", "make_real_live:internal_app", "make_real_live:inquiry_form"]) {
      const current = await admin.rpc("read_workspace_release_flags", { p_workspace_id: businessId });
      expect(current.error).toBeNull();
      const flags = current.data as { flags: Record<string, { revision: number }> };
      const enabled = await admin.rpc("set_workspace_release_flag", {
        p_operator_email: operator.email, p_workspace_id: businessId, p_flag: flag,
        p_state: "on", p_reason: "Disposable authenticated native publication proof", p_expected_revision: flags.flags[flag]?.revision ?? 0,
      });
      expect(enabled.error).toBeNull();
    }

    async function baseline(name: string, body: Record<string, unknown>, kind = "other") {
      const system = await store.createSystem(actor, businessId, { name, kind, purpose: "Native local publication journey" }, randomUUID());
      const revision = await store.recordRevision(actor, { businessId, systemId: system.id }, system.changeNumber,
        { implementation: await content.put(businessId, body), summary: "Original native baseline" }, randomUUID());
      return { businessId, systemId: system.id, revisionId: revision.revision.id, number: revision.revision.number };
    }

    async function prepare(input: PossibilityInput) {
      let value = createPossibility(input, { id: randomUUID(), businessId, actorId: owner.userId, at: new Date().toISOString() });
      await possibilities.create(value);
      const observedBaselines: Record<string, string> = {};
      for (const change of value.changes) {
        const current = await live.current(change.baseline);
        expect(current?.revisionId).toBe(change.baseline.revisionId);
        observedBaselines[change.baseline.systemId] = current!.revisionId;
      }
      const previous = value.revision;
      value = recordRehearsal(value, {
        candidateRevision: value.candidateRevision, at: new Date().toISOString(), observedBaselines,
        effects: value.effects.map(effect => ({ effectId: effect.id, mode: "isolated" as const, ok: true,
          detail: "The real native candidate passed its product rehearsal and the publication request schema. No publication attempted." })),
        ok: true, limitations: ["Preparation checks readiness; live acceptance, read-back and operating checks have not run.",
          "No remote provider or public booking publication is covered."],
      }, previous, owner.userId, new Date().toISOString());
      await possibilities.save(value, previous);
      const rehearsed = value.revision;
      value = await markReady(value, live, rehearsed, owner.userId, new Date().toISOString());
      await possibilities.save(value, rehearsed);
      return value;
    }

    async function readApp(workId: string) {
      const response = await owner.context.request.get(`/api/bounded-work?productId=applications&workId=${workId}`);
      expect(response.status(), await response.text()).toBe(200);
      return response.json();
    }
    async function appCommand(workId: string, command: unknown) {
      return post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId, command });
    }
    async function readInquiry(): Promise<InquirySurfaceResult> {
      const response = await owner.context.request.get(`/api/inquiry-workspace?tenantId=${tenantId}`);
      expect(response.status(), await response.text()).toBe(200);
      return response.json();
    }
    let inquiry = await readInquiry();
    async function inquiryAction(action: unknown) {
      inquiry = await post(owner.context.request, "/api/inquiry-workspace", { tenantId, expectedRevision: inquiry.snapshot.revision ?? null, action });
      return inquiry;
    }
    async function readActivation(activationId: string) {
      const response = await operator.context.request.get(`/api/admin/make-real?workspaceId=${businessId}&activationId=${activationId}`);
      expect(response.status(), await response.text()).toBe(200);
      return activationSchema.parse((await response.json()).activation);
    }

    // Prepare two genuine native versions. The first versions are actually
    // published through their ordinary authenticated product paths.
    let app = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "applications", workspaceId: businessId,
      input: { title: "Native service requests", fields: [{ id: "problem", label: "Problem", type: "text", required: true }],
        components: [{ kind: "form", fields: ["problem"] }, { kind: "list", fields: ["problem"] }] } }, 201);
    app = await appCommand(app.id, { kind: "rehearse", expectedRevision: app.payload.revision });
    app = await appCommand(app.id, { kind: "install", expectedRevision: app.payload.revision });
    expect(applicationSchema.parse(app.payload).release?.version).toBe(1);
    app = await appCommand(app.id, { kind: "submit", expectedReleaseVersion: 1, expectedRecordsRevision: 0,
      record: { id: "native-existing-record", values: { problem: "Keep this local customer record through publication and rollback" } } });
    const originalRecords = applicationSchema.parse(app.payload).records;
    expect(originalRecords).toHaveLength(1);
    const spec = applicationSchema.parse(app.payload).spec;
    app = await appCommand(app.id, { kind: "revise", expectedDesignRevision: app.payload.designRevision,
      spec: { ...spec, title: "Reviewed native service requests" } });
    app = await appCommand(app.id, { kind: "rehearse", expectedDesignRevision: app.payload.designRevision });
    const appRequest = internalAppRequestSchema.parse({ workId: app.id,
      expectedCandidateRevision: app.payload.candidate.designRevision, expectedReleaseVersion: 1 });
    const appRehearsal = applicationSchema.parse(app.payload).candidate?.rehearsal;
    expect(appRehearsal).not.toBeNull();
    expect(appRehearsal?.checks.every(check => check.passed)).toBe(true);

    const started = await inquiryAction({ kind: "start", input: { title: "Native inquiry form", intent: "Collect an inquiry without sending messages" } });
    const requestId = started.work!.id;
    await inquiryAction({ kind: "accept-shape", requestId, input: { selectedLineIds: ["form", "record"] } });
    await inquiryAction({ kind: "rehearse", requestId });
    await inquiryAction({ kind: "publish", requestId });
    const firstInquiry = inquiry.snapshot.state.requests.find(work => work.id === requestId)!;
    const firstVersion = inquiry.snapshot.state.capabilities.find(capability => capability.id === firstInquiry.capabilityId)!.live!.version;
    await inquiryAction({ kind: "edit", requestId, input: { source: "manual", path: "form.title", after: "Reviewed native inquiry form" } });
    await inquiryAction({ kind: "rehearse", requestId });
    expect(inquiry.rehearsal?.passed).toBe(true);
    // Persist an actual engine approval with CAS; the HTTP publish action
    // would already publish, bypassing the Make Real path under test.
    const inquiryRepository = getInquiryRepository();
    const snapshot = await inquiryRepository.getSnapshot(tenantId, businessId);
    expect(snapshot).not.toBeNull();
    const engine = new InquiryEngine({ businessId, state: snapshot!.state });
    const approved = engine.approvePublish(requestId, { actorId: owner.userId });
    const saved = await inquiryRepository.compareAndSwap({ tenantId, businessId, expectedRevision: snapshot!.revision,
      state: engine.snapshot(), actorId: owner.userId });
    expect(saved.changed).toBe(true);
    const inquiryRequest = inquiryFormRequestSchema.parse({ tenantId, businessId, requestId,
      capabilityId: approved.capabilityId, changeId: approved.activeChangeId, version: approved.draft!.version });

    const appBaseline = await baseline("Native application publication", { workId: app.id, releaseVersion: 1 });
    const inquiryBaseline = await baseline("Native inquiry publication", { requestId, capabilityVersion: firstVersion });
    const possibility = await prepare({ title: "Publish the reviewed app and inquiry form", intent: "Make both reviewed native candidates live together",
      changes: [{ baseline: appBaseline, candidate: { summary: "Native app release 2", content: { ...appRequest } } },
        { baseline: inquiryBaseline, candidate: { summary: "Native inquiry version 2", content: { ...inquiryRequest } } }],
      effects: [{ id: "publish-app", kind: "publish", channel: "internal_app", system: { systemId: appBaseline.systemId },
        description: "Publish the reviewed native application", request: appRequest },
      { id: "publish-inquiry", kind: "publish", channel: "inquiry_form", system: { systemId: inquiryBaseline.systemId },
        description: "Publish the reviewed native inquiry form", request: inquiryRequest }],
      checks: [{ id: "site-serves", description: "Native publication read-back is confirmed" },
        { id: "inquiry-rule-live", description: "The native inquiry configuration is live" }] });

    await test.step("review on the real owner surface; member cannot approve", async () => {
      member = await person(browser, admin, "live-makereal-member");
      expect((await member.context.request.get("/api/workspace")).status()).toBe(200);
      expect((await admin.from("workspace_memberships").insert({ workspace_id: businessId, user_id: member.userId, role: "member", created_by: owner.userId })).error).toBeNull();
      const refused = await member.context.request.post("/api/workspace/systems/make-real", { headers: { origin: journeyEnvironment().app }, data: { workspaceId: businessId, possibilityId: possibility.id } });
      expect(refused.status()).toBe(403);
      expect((await refused.json()).permission).toBe("not_owner");
      const compare = await owner.context.request.get(`/api/workspace/systems/possibilities?workspaceId=${businessId}&possibilityId=${possibility.id}`);
      expect(compare.status(), await compare.text()).toBe(200);
      const reviewed = await compare.json();
      expect(reviewed.possibility).toMatchObject({ id: possibility.id, status: "ready", candidateRevision: possibility.candidateRevision });
      expect(reviewed.compare).not.toBeNull();
      expect(applicationSchema.parse((await readApp(app.id)).payload).release?.version).toBe(1);
      expect((await readInquiry()).snapshot.state.capabilities.find(capability => capability.id === approved.capabilityId)!.live!.version).toBe(firstVersion);
    });

    const page = await owner.context.newPage();
    await page.goto(`/workspace?workspaceId=${businessId}&systemId=${appBaseline.systemId}&view=system`);
    const plan = page.locator("li").filter({ hasText: possibility.title }).first();
    await expect(plan).toBeVisible();
    const openDecision = (await decisions(admin, businessId, owner, false)).find(row => row.sourceLifecycle === "make_real" && row.sourceId.startsWith(`${possibility.id}@`));
    expect(openDecision).toBeDefined();
    const madeResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/workspace/systems/make-real" && response.request().method() === "POST");
    await plan.getByRole("button", { name: "Make real", exact: true }).click();
    const made = await madeResponse;
    expect(made.status(), await made.text()).toBe(200);
    const madeBody = await made.json();
    expect(madeBody.live.live).toBe(true);
    const activationId = String(madeBody.live.activationId);
    const completed = await readActivation(activationId);
    expect(completed.status).toBe("made_real");
    expect(completed.actorId).toBe(owner.userId);
    expect(completed.checks.every(check => check.status === "passed")).toBe(true);
    const effects = completed.steps.filter(step => step.kind === "effect");
    expect(effects).toHaveLength(2);
    for (const effect of effects) {
      expect(effect).toMatchObject({ status: "completed", effect: "accepted", attempts: 1,
        receipt: { adapterMode: "live", providerRef: expect.any(String), approvalId: expect.any(String) }, readBack: { status: "confirmed" } });
    }
    expect(applicationSchema.parse((await readApp(app.id)).payload).release?.version).toBe(2);
    expect((await readInquiry()).snapshot.state.capabilities.find(capability => capability.id === approved.capabilityId)!.live!.version).toBe(inquiryRequest.version);
    expect((await decisions(admin, businessId, owner, true)).find(row => row.id === openDecision!.id)).toMatchObject({ state: "approved", outcome: "done", decidedByKind: "owner_session" });
    const health = await owner.context.request.get(`/api/workspace?workspaceId=${businessId}`);
    expect(health.status(), await health.text()).toBe(200);
    const workspaceHealth = await health.json();
    for (const ref of [appBaseline, inquiryBaseline]) {
      const entry = workspaceHealth.systems.systems.find((system: { ref: { systemId: string } }) => system.ref.systemId === ref.systemId);
      expect(entry).toBeDefined();
      expect(entry.health.status).toBeDefined();
      expect(entry.health.summary.length).toBeGreaterThan(0);
    }
    await expect(page.getByRole("status", { name: "Make real result" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("native-make-real-live.png"), fullPage: true });
    await testInfo.attach("native-activation-and-health", { body: JSON.stringify({ activation: completed, workspace: workspaceHealth }, null, 2), contentType: "application/json" });

    await test.step("replay does not republish; revoked authority cannot undo; operator rollback restores both", async () => {
      const replay = await owner.context.request.post("/api/workspace/systems/make-real", { headers: { origin: journeyEnvironment().app }, data: { workspaceId: businessId, possibilityId: possibility.id } });
      expect([200, 404, 409]).toContain(replay.status());
      expect((await readActivation(activationId)).steps.filter(step => step.kind === "effect")).toEqual(effects);
      await post(owner.context.request, "/api/admin/make-real", { action: "rollback", workspaceId: businessId, activationId, confirm: true }, 403);
      expect((await admin.from("workspace_memberships").delete().eq("workspace_id", businessId).eq("user_id", owner.userId)).error).toBeNull();
      const withdrawn = await operator.context.request.post("/api/admin/make-real", { headers: { origin: journeyEnvironment().app }, data: { action: "rollback", workspaceId: businessId, activationId, confirm: true } });
      expect([403, 404]).toContain(withdrawn.status());
      expect((await admin.from("workspace_memberships").insert({ workspace_id: businessId, user_id: owner.userId, role: "owner", created_by: operator.userId })).error).toBeNull();
      const rolled = activationSchema.parse((await post(operator.context.request, "/api/admin/make-real", { action: "rollback", workspaceId: businessId, activationId, confirm: true })).activation);
      expect(rolled.status).toBe("rolled_back");
      expect(rolled.steps.filter(step => step.kind === "effect").every(step => step.status === "compensated")).toBe(true);
      expect(applicationSchema.parse((await readApp(app.id)).payload).release?.version).toBe(1);
      expect(applicationSchema.parse((await readApp(app.id)).payload).records).toEqual(originalRecords);
      expect((await readInquiry()).snapshot.state.capabilities.find(capability => capability.id === approved.capabilityId)!.live!.version).toBe(firstVersion);
      expect((await live.current(appBaseline))?.revisionId).toBe(appBaseline.revisionId);
      expect((await live.current(inquiryBaseline))?.revisionId).toBe(inquiryBaseline.revisionId);
    });

    await test.step("booking metadata can activate locally but public booking verification stays pending", async () => {
      const start = new Date(Date.now() + 86_400_000).toISOString();
      const end = new Date(Date.now() + 90_000_000).toISOString();
      const schedule = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "scheduling", workspaceId: businessId,
        input: { title: "Native consultation availability", availability: [{ start, end }] } }, 201);
      const bookingBaseline = await baseline("Booking operating notes", { workId: schedule.id, publicBooking: "pending-calendar-connection", notes: "Original owner notes" }, "booking");
      const booking = await prepare({ title: "Clarify booking operating notes", intent: "Update the native booking System notes without publishing availability",
        changes: [{ baseline: bookingBaseline, candidate: { summary: "Reviewed owner notes", content: { publicBooking: "pending-calendar-connection", notes: "Confirm appointments with the owner" } } }],
        effects: [], checks: [{ id: "site-serves", description: "Public booking publication is still unverified" }] });
      const result = await post(owner.context.request, "/api/workspace/systems/make-real", { workspaceId: businessId, possibilityId: booking.id });
      expect(result.live.live).toBe(true);
      const partial = await readActivation(result.live.activationId);
      expect(partial.status).toBe("needs_attention");
      expect(partial.steps.filter(step => step.kind === "effect")).toHaveLength(0);
      expect(partial.checks.some(check => check.status === "failed")).toBe(true);
      expect((await live.current(bookingBaseline))?.revisionId).not.toBe(bookingBaseline.revisionId);
      await post(operator.context.request, "/api/admin/make-real", { action: "rollback", workspaceId: businessId, activationId: partial.id, confirm: true });
      expect((await live.current(bookingBaseline))?.revisionId).toBe(bookingBaseline.revisionId);
      const scheduleAfter = await owner.context.request.get(`/api/bounded-work?productId=scheduling&workId=${schedule.id}`);
      expect(scheduleAfter.status(), await scheduleAfter.text()).toBe(200);
      expect((await scheduleAfter.json()).payload).toEqual(schedule.payload);
      await testInfo.attach("booking-pending-public-channel", { body: JSON.stringify(partial, null, 2), contentType: "application/json" });
    });
  } finally {
    if (setup) await cleanup(admin, { tenantIds: [setup.tenantId], workspaceIds: [setup.businessId], operatorEmail: setup.operator.email,
      people: [setup.operator, setup.owner, ...(member ? [member] : [])] });
  }
});
