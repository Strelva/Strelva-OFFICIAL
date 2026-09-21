import { describe, expect, it } from "vitest";
import { createLearning, changeLearning, learningSummary } from "@/products/product-learning/engine";

const now = "2026-09-12T12:00:00.000Z";
const source = { id: "support", workId: "00000000-0000-4000-8000-000000000001", segment: "website owners", freshForHours: 24 };
const fresh = () => createLearning({ title: "Missed inquiries", objective: "Determine whether follow-up improves bookings", sources: [source], intervalHours: 24, budgetCents: 100 }, "researcher", now);

describe("internal product learning commands", () => {
  it("stops recurring collection when paused and resumes only through an explicit command", () => {
    const paused = changeLearning(fresh(), { kind: "pause", expectedRevision: 0 }, "researcher", now);
    expect(paused.status).toBe("paused");
    expect(learningSummary(paused, now).due).toBe(false);
    expect(() => changeLearning(paused, { kind: "collect", expectedRevision: 1, observations: [], costCents: 0 }, "researcher", now)).toThrow(/paused/);
    const resumed = changeLearning(paused, { kind: "resume", expectedRevision: 1 }, "researcher", now);
    expect(learningSummary(resumed, now).due).toBe(true);
  });
  it("does not turn duplicate old notes into fresh independent demand or exceed a collection budget", () => {
    const observation = { sourceId: "support", status: "available", fingerprint: "note-1", reference: "support/1", excerpt: "Owner missed one reply", eventAt: now, evidenceKind: "user_account", participantId: "owner-1" };
    const first = changeLearning(fresh(), { kind: "collect", expectedRevision: 0, observations: [observation, observation], costCents: 50 }, "researcher", now);
    expect(first.evidence).toHaveLength(1);
    expect(learningSummary(first, now).actualParticipants).toBe(1);
    expect(() => changeLearning(first, { kind: "collect", expectedRevision: 1, observations: [observation], costCents: 51 }, "researcher", "2026-09-14T12:00:00.000Z")).toThrow(/budget/);
    const later = changeLearning(first, { kind: "collect", expectedRevision: 1, observations: [observation], costCents: 0 }, "researcher", "2026-09-14T12:00:00.000Z");
    expect(learningSummary(later, "2026-09-14T12:00:00.000Z").staleEvidence).toBe(1);
    expect(later.spentCents).toBe(50);
  });
  it("collects a due responsibility once, deduplicates observations, and marks changed evidence for review", () => {
    const first = changeLearning(fresh(), { kind: "collect", expectedRevision: 0, observations: [{ sourceId: "support", status: "available", fingerprint: "same-source-event", reference: "support/42", excerpt: "Owner missed an inquiry", eventAt: now, evidenceKind: "user_account", participantId: "owner-1" }], costCents: 0 }, "researcher", now);
    expect(first.evidence).toHaveLength(1);
    expect(first.nextRunAt).toBe("2026-09-13T12:00:00.000Z");
    expect(() => changeLearning(first, { kind: "collect", expectedRevision: 1, observations: [], costCents: 0 }, "researcher", now)).toThrow(/not due/);
    const claimed = changeLearning(first, { kind: "claim", expectedRevision: 1, id: "missed", text: "An owner missed an inquiry", certainty: "observed", evidenceIds: [first.evidence[0]!.id], contraryEvidenceIds: [], constraint: "Limited attention", job: "Respond before the customer leaves", possibleValue: "More bookings", unknowns: ["Frequency across businesses"] }, "researcher", now);
    const withdrawn = changeLearning(claimed, { kind: "collect", expectedRevision: 2, observations: [{ sourceId: "support", status: "withdrawn" }], costCents: 0 }, "researcher", "2026-09-13T12:00:00.000Z");
    expect(withdrawn.claims[0]!.needsReview).toBe(true);
    expect(withdrawn.evidence[0]!.status).toBe("withdrawn");
    expect(learningSummary(withdrawn, "2026-09-13T12:00:00.000Z").actualParticipants).toBe(0);
  });
  it("keeps simulated demand separate and refuses an unmatched capability trial", () => {
    const collected = changeLearning(fresh(), { kind: "collect", expectedRevision: 0, observations: [{ sourceId: "support", status: "available", fingerprint: "simulation-1", reference: "simulation/1", excerpt: "Pretend owner wants automation", eventAt: now, evidenceKind: "simulated", participantId: "pretend-owner" }], costCents: 0 }, "researcher", now);
    expect(learningSummary(collected, now).actualParticipants).toBe(0);
    expect(() => changeLearning(collected, { kind: "claim", expectedRevision: 1, id: "demand", text: "Owners demand this", certainty: "observed", evidenceIds: [collected.evidence[0]!.id], contraryEvidenceIds: [], constraint: "Time", job: "Book leads", possibleValue: "Sales", unknowns: [] }, "researcher", now)).toThrow(/primary evidence/);
    const measurement = { workloadId: "held-out-inquiries-v1", heldOut: true, cases: 10, completed: 8, corrections: 2, minutes: 40, costCents: 300, evidenceReference: "trial/log/1", evidenceKind: "measured" };
    expect(() => changeLearning(collected, { kind: "trial", expectedRevision: 1, id: "trial-1", capability: "Follow-through", assessedAt: now, previousLimit: "Frequent recovery failures", changed: "Resumes after provider interruption", constraints: ["Authorized mailbox only"], baseline: measurement, candidate: { ...measurement, workloadId: "easier-workload" } }, "researcher", now)).toThrow(/same held-out workload/);
    const trial = changeLearning(collected, { kind: "trial", expectedRevision: 1, id: "trial-1", capability: "Follow-through", assessedAt: now, previousLimit: "Frequent recovery failures", changed: "Resumes after provider interruption", constraints: ["Authorized mailbox only"], baseline: measurement, candidate: { ...measurement, minutes: 20, completed: 9, evidenceReference: "trial/log/2" } }, "researcher", now);
    expect(trial.trials[0]!.candidate.completed).toBe(9);
  });
  it("links divergent decisions to a versioned brief, blocks self-approved builds, and treats missing outcomes as unknown", () => {
    let work = fresh();
    const change = (command: Record<string, unknown>, actor = "researcher") => work = changeLearning(work, { ...command, expectedRevision: work.revision }, actor, now);
    change({ kind: "claim", id: "need", text: "Follow-up might help", certainty: "unknown", evidenceIds: [], contraryEvidenceIds: [], constraint: "Missed replies", job: "Resolve inquiries", possibleValue: "Bookings", unknowns: ["Demand"] });
    const option = (id: string, approach: string) => ({ id, approach, behavior: `Business owner experiences ${approach}`, claimIds: ["need"], trialIds: [], advantage: "Existing consent and delivery receipts", tradeoffs: ["Needs mailbox access"] });
    change({ kind: "alternatives", options: [option("integrate", "integration"), option("remove", "workflow_removal"), option("service", "new_service"), option("nothing", "no_build")] });
    change({ kind: "strategy", optionId: "remove", value: "Bookings", behaviorChange: "Owner handles exceptions", alternatives: "Manual follow-up", genericModelSubstitution: "Missing grants", distribution: "Existing website clients", activation: "Connect inbox", retention: "Completed bookings", compounding: "Outcome history", defensibility: "Consent", payer: "Owner", marketEffects: "SaaS consolidation", futureAI: "Cheaper execution", weakestAssumption: "Follow-up matters", falsifyingTest: "No improved response rate in held-out cohort", killCriteria: ["No demand"] });
    change({ kind: "decide", optionId: "remove", decision: "test", reason: "Demand remains unknown" });
    change({ kind: "brief", audience: "Website owners", promise: "No unanswered inquiries", objects: [{ name: "Inquiry", reason: "Keeps consent and outcome together" }], boundaries: ["No unsolicited outreach"], tradeoffs: ["Owner approves ambiguous replies"], optionId: "remove", dispositions: [{ behavior: "Workflow editor", action: "remove", reason: "Implementation detail" }], requiredUxConditions: ["mobile", "keyboard", "restricted"] });
    change({ kind: "experience", id: "ux-1", briefRevision: 1, objective: "Recover a blocked inquiry", role: "restricted member", conditions: ["mobile", "keyboard", "restricted"], actions: ["Opened inquiry", "Requested owner decision"], deadEnds: [], completion: "completed", friction: [], evidenceKind: "agent", evidenceReference: "local/browser/1" });
    const build = { kind: "build", id: "build-1", briefRevision: 1, contractReference: "contract/inquiry", implementationReference: "commit/123", verificationReferences: ["test/failure-path"], experienceIds: ["ux-1"], builderId: "researcher", reviewerId: "researcher", independentReviewReference: "review/1", unresolvedDefects: [], releaseDecision: "local_accepted", checks: [{ concern: "access", result: "passed", reference: "test/access" }], riskAssessment: "No production provider writes" };
    expect(() => change(build)).toThrow(/independent reviewer/);
    expect(() => change({ ...build, builderId: "made-up-builder" }, "researcher")).toThrow(/registered by its builder/);
    change({ ...build, releaseDecision: "blocked" });
    change({ ...build, reviewerId: "reviewer" }, "reviewer");
    expect(work.builds[0]!.releaseDecision).toBe("local_accepted");
    change({ kind: "outcome", id: "outcome-1", optionId: "remove", claimIds: ["need"], expected: "More booked inquiries", observed: null, cohort: "No exposed customers", windowStart: now, windowEnd: now, evidenceKind: "unknown", sourceEventReferences: [], exposureCount: 0, costCents: null, uncertainty: ["No telemetry"], nextTest: "Instrument a permitted cohort", effect: "revise" });
    expect(work.outcomes[0]!.evidenceKind).toBe("unknown");
    expect(work.claims[0]!.needsReview).toBe(true);
    expect(work.experimentProposals[0]!.status).toBe("needs_approval");
    expect(work.experimentProposals[0]!.nextTest).toBe("Instrument a permitted cohort");
  });
});
