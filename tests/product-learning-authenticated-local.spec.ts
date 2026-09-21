import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import type { Learning } from "../src/products/product-learning/contracts";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth and Postgres.");
test.setTimeout(120_000);

test("internal learning retains a complete synthetic evidence-to-changed-decision trace with independent review and revocation", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const builder = await signedInContext(browser, admin, "learning-builder");
  const reviewer = await signedInContext(browser, admin, "learning-reviewer");
  const outsider = await signedInContext(browser, admin, "learning-outsider");
  const workspaceId = randomUUID();
  const sourceIds = [randomUUID(), randomUUID()];
  const headers = { origin: env.app };
  try {
    for (const person of [builder, reviewer, outsider]) expect((await person.context.request.get("/api/workspace")).status()).toBe(200);
    expect((await admin.from("super_admins").insert([builder, reviewer].map(person => ({ user_id: person.userId, email: person.email })))).error).toBeNull();
    expect((await admin.from("workspaces").insert({ id: workspaceId, kind: "customer", name: "Isolated internal learning proof", created_by: builder.userId })).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert([builder, reviewer].map(person => ({ workspace_id: workspaceId, user_id: person.userId, role: person === builder ? "owner" : "member", created_by: builder.userId })))).error).toBeNull();
    expect((await admin.from("saved_product_work").insert(sourceIds.map((id, index) => ({ id, workspace_id: workspaceId, product_id: "documents", resource_kind: "document", title: `Synthetic source ${index + 1}`, payload: { title: `Synthetic source ${index + 1}`, text: index === 0 ? "Fictional exercise: a delayed reply prevented a booking." : "Contrary fictional account: immediate replies did not produce bookings." }, created_by: builder.userId })))).error).toBeNull();
    const created = await builder.context.request.post("/api/product-learning", { headers, data: { action: "create", workspaceId, input: { title: "Synthetic follow-up investigation", objective: "Exercise learning mechanics without claiming customer demand", sources: sourceIds.map((workId, index) => ({ id: `source-${index}`, workId, segment: "Synthetic businesses", freshForHours: 24 })), intervalHours: 24, budgetCents: 0 } } });
    expect(created.status()).toBe(200);
    const initial = await created.json();
    const workId = initial.workId as string;
    let learning = initial.learning as Learning;
    const post = (context: BrowserContext, command: Record<string, unknown>) => context.request.post("/api/product-learning", { headers, data: { action: "command", workId, command: { expectedRevision: learning.revision, ...command } } });
    const change = async (command: Record<string, unknown>, context = builder.context) => {
      const response = await post(context, command);
      expect(response.status(), await response.text()).toBe(200);
      learning = (await response.json()).learning;
    };
    const collect = await builder.context.request.post("/api/product-learning", { headers, data: { action: "collect", workId, expectedRevision: learning.revision } });
    expect(collect.status()).toBe(200);
    learning = (await collect.json()).learning;
    expect(learning.evidence).toHaveLength(2);
    expect(learning.evidence.every(item => item.evidenceKind === "operator_report")).toBe(true);
    expect((await outsider.context.request.get(`/api/product-learning?workId=${workId}`)).status()).toBe(403);
    expect((await post(builder.context, { kind: "collect", observations: [], costCents: 0 })).status()).toBe(403);
    const sourceEvidence = (sourceId: string) => learning.evidence.find(item => item.sourceIds.includes(sourceId))!.id;
    await change({ kind: "claim", id: "reply", text: "Faster replies might help", certainty: "inferred", evidenceIds: [sourceEvidence("source-0")], contraryEvidenceIds: [sourceEvidence("source-1")], constraint: "Limited staff time", job: "Resolve inquiries", possibleValue: "Fewer missed opportunities", unknowns: ["Actual customer demand is unmeasured"] });
    const at = new Date().toISOString();
    const measurement = { workloadId: "synthetic-held-out-v1", heldOut: true, cases: 4, completed: 2, corrections: 1, minutes: 10, costCents: null, evidenceReference: "synthetic:baseline", evidenceKind: "simulated" };
    await change({ kind: "trial", id: "trial", capability: "Follow-up preparation", assessedAt: at, previousLimit: "Manual triage", changed: "Local structured proposals", constraints: ["No external delivery tested"], baseline: measurement, candidate: { ...measurement, completed: 3, evidenceReference: "synthetic:candidate" } });
    const option = (id: string, approach: string) => ({ id, approach, behavior: `Synthetic option: ${approach}`, claimIds: ["reply"], trialIds: ["trial"], advantage: "Preserved authorization and receipts", tradeoffs: ["Requires real customer validation"] });
    await change({ kind: "alternatives", options: [option("integrate", "integration"), option("remove", "workflow_removal"), option("service", "new_service"), option("nothing", "no_build")] });
    await change({ kind: "decide", optionId: "service", decision: "reject", reason: "No evidence supports a service commitment" });
    await change({ kind: "strategy", optionId: "remove", value: "Resolve inquiries", behaviorChange: "Review exceptions", alternatives: "Manual handling", genericModelSubstitution: "May be sufficient; test first", distribution: "Unknown", activation: "First useful result", retention: "Unmeasured", compounding: "Recorded outcomes", defensibility: "Unproven", payer: "Unselected", marketEffects: "Unknown", futureAI: "Reassess capability", weakestAssumption: "Follow-up matters", falsifyingTest: "No useful improvement in an authorized trial", killCriteria: ["No repeat use"] });
    await change({ kind: "decide", optionId: "remove", decision: "test", reason: "Test the weak assumption" });
    await change({ kind: "brief", audience: "Synthetic business", promise: "Reviewable follow-up", objects: [{ name: "Inquiry", reason: "Preserve the request and decision" }], boundaries: ["No live sending"], tradeoffs: ["Human review required"], optionId: "remove", dispositions: [{ behavior: "Autonomous sending", action: "reject", reason: "Not authorized" }], requiredUxConditions: ["restricted"] });
    await change({ kind: "experience", id: "experience", briefRevision: 1, objective: "Record a restricted-member review", role: "restricted member", conditions: ["restricted"], actions: ["Synthetic exercise recorded"], deadEnds: [], completion: "completed", friction: [], evidenceKind: "agent", evidenceReference: "synthetic:experience" });
    const build = { kind: "build", id: "build", briefRevision: 1, contractReference: "synthetic:contract", implementationReference: "synthetic:implementation", verificationReferences: ["synthetic:verification"], experienceIds: ["experience"], builderId: builder.userId, reviewerId: builder.userId, independentReviewReference: "synthetic:review", unresolvedDefects: [], releaseDecision: "local_accepted", checks: [{ concern: "access", result: "passed", reference: "synthetic:access" }], riskAssessment: "Mechanism proof only" };
    expect((await post(builder.context, build)).status()).toBe(409);
    await change({ ...build, releaseDecision: "blocked" });
    await change({ ...build, reviewerId: reviewer.userId }, reviewer.context);
    await change({ kind: "outcome", id: "unknown", optionId: "remove", claimIds: ["reply"], expected: "Useful first result", observed: null, cohort: "No actual participants", windowStart: at, windowEnd: at, evidenceKind: "unknown", sourceEventReferences: [], exposureCount: 0, costCents: null, uncertainty: ["No production telemetry"], nextTest: "Agree a permitted customer trial", effect: "revise" });
    await change({ kind: "decide", optionId: "remove", decision: "park", reason: "No observed customer value yet" });
    const reopened = await builder.context.request.get(`/api/product-learning?workId=${workId}`);
    expect(reopened.status()).toBe(200);
    const result = await reopened.json();
    expect(result.learning.decisions.map((item: { decision: string }) => item.decision)).toEqual(["reject", "test", "park"]);
    expect(result.learning.claims[0]!.needsReview).toBe(true);
    expect(result.learning.builds[0].reviewerId).toBe(reviewer.userId);
    expect(result.summary.actualParticipants).toBe(0);
    expect(result.learning.experimentProposals[0].status).toBe("needs_approval");
    // Advance only the isolated fixture's due time; do not wait 24 hours or
    // claim this manual invocation proves production scheduling.
    expect((await admin.from("saved_product_work").update({ payload: { ...learning, nextRunAt: "2020-01-01T00:00:00.000Z" } }).eq("id", workId)).error).toBeNull();
    expect((await admin.from("saved_product_work").update({ payload: { title: "Revised synthetic evidence", text: "The original account was corrected; no missed booking was established." }, updated_at: new Date().toISOString() }).eq("id", sourceIds[0])).error).toBeNull();
    expect((await admin.from("saved_product_work").update({ payload: { malformed: true } }).eq("id", sourceIds[1])).error).toBeNull();
    const recollected = await builder.context.request.post("/api/product-learning", { headers, data: { action: "collect", workId, expectedRevision: learning.revision } });
    expect(recollected.status()).toBe(200);
    learning = (await recollected.json()).learning;
    expect(learning.evidence.some(item => item.status === "changed")).toBe(true);
    expect(learning.runs.at(-1)?.outages).toEqual(["source-1"]);
    expect(learning.claims[0]!.needsReview).toBe(true);
    expect((await post(builder.context, { kind: "pause", expectedRevision: learning.revision - 1 })).status()).toBe(409);
    await change({ kind: "pause" });
    expect((await builder.context.request.post("/api/product-learning", { headers, data: { action: "collect", workId, expectedRevision: learning.revision } })).status()).toBe(409);
    expect((await admin.from("super_admins").update({ revoked_at: new Date().toISOString() }).eq("user_id", reviewer.userId)).error).toBeNull();
    expect((await reviewer.context.request.get(`/api/product-learning?workId=${workId}`)).status()).toBe(403);
    expect((await post(reviewer.context, { kind: "pause" })).status()).toBe(403);
    expect((await admin.from("saved_product_work").select("payload").eq("id", workId).single()).data?.payload.revision).toBe(learning.revision);
  } finally {
    await admin.from("workspaces").delete().eq("id", workspaceId);
    for (const person of [builder, reviewer, outsider]) {
      await person.context.close();
      await admin.from("super_admins").delete().eq("user_id", person.userId);
      await admin.auth.admin.deleteUser(person.userId);
    }
  }
});
