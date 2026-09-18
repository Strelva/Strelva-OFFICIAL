import { createHash } from "node:crypto";
import { z } from "zod";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

const text = z.string().trim().min(1).max(4000);
const id = z.string().trim().min(1).max(160);
const date = z.string().datetime();
const cents = z.number().int().min(0).max(100_000_000);
const strings = z.array(text).max(40);
const sourceSchema = z.object({ id, workId: z.string().uuid(), segment: text, freshForHours: z.number().int().min(1).max(8760) });
export const learningInputSchema = z.object({ title: text.max(160), objective: text, sources: z.array(sourceSchema).min(1).max(20), intervalHours: z.number().int().min(1).max(8760), budgetCents: cents });
const observationSchema = z.discriminatedUnion("status", [
  z.object({ sourceId: id, status: z.literal("available"), fingerprint: id, reference: text, excerpt: text, eventAt: date.nullable(), evidenceKind: z.enum(["user_account", "behavior", "vendor_claim", "public_benchmark", "simulated", "operator_report"]), participantId: id.optional() }),
  z.object({ sourceId: id, status: z.enum(["outage", "withdrawn"]), reason: text.optional() }),
]);
const evidenceSchema = z.object({ id, sourceIds: z.array(id), fingerprint: id, reference: text, excerpt: text, eventAt: date.nullable(), capturedAt: date, segment: text, evidenceKind: z.enum(["user_account", "behavior", "vendor_claim", "public_benchmark", "simulated", "operator_report"]), participantId: id.optional(), status: z.enum(["current", "changed", "withdrawn"]), freshUntil: date });
const claimSchema = z.object({ id, text, certainty: z.enum(["observed", "inferred", "unknown"]), evidenceIds: z.array(id).max(100), contraryEvidenceIds: z.array(id).max(100), constraint: text, job: text, possibleValue: text, unknowns: strings, needsReview: z.boolean() });
const measurementSchema = z.object({ workloadId: id, heldOut: z.boolean(), cases: z.number().int().positive(), completed: z.number().int().nonnegative(), corrections: z.number().int().nonnegative(), minutes: z.number().finite().nonnegative(), costCents: cents.nullable(), evidenceReference: text, evidenceKind: z.enum(["measured", "operator_reported", "simulated"]) });
const trialSchema = z.object({ id, capability: text, assessedAt: date, previousLimit: text, changed: text, constraints: strings, baseline: measurementSchema, candidate: measurementSchema });
const optionSchema = z.object({ id, approach: z.enum(["integration", "workflow_removal", "new_service", "no_build"]), behavior: text, claimIds: z.array(id).min(1), trialIds: z.array(id), advantage: text, tradeoffs: strings });
const strategySchema = z.object({ optionId: id, value: text, behaviorChange: text, alternatives: text, genericModelSubstitution: text, distribution: text, activation: text, retention: text, compounding: text, defensibility: text, payer: text, marketEffects: text, futureAI: text, weakestAssumption: text, falsifyingTest: text, killCriteria: strings.min(1) });
const decisionSchema = z.object({ optionId: id, decision: z.enum(["test", "park", "reject"]), reason: text });
const briefContentSchema = z.object({ audience: text, promise: text, objects: z.array(z.object({ name: id, reason: text })).min(1).max(30), boundaries: strings.min(1), tradeoffs: strings.min(1), optionId: id, dispositions: z.array(z.object({ behavior: text, action: z.enum(["keep", "merge", "remove", "reject"]), reason: text })).min(1).max(100), requiredUxConditions: strings.min(1) });
const briefSchema = briefContentSchema.extend({ revision: z.number().int().positive(), actorId: id, at: date });
const experienceSchema = z.object({ id, briefRevision: z.number().int().positive(), objective: text, role: text, conditions: strings.min(1), actions: strings.min(1), deadEnds: strings, completion: z.enum(["completed", "failed", "blocked"]), friction: strings, evidenceKind: z.enum(["human", "agent"]), evidenceReference: text });
const buildSchema = z.object({ id, briefRevision: z.number().int().positive(), contractReference: text, implementationReference: text, verificationReferences: strings.min(1), experienceIds: z.array(id).min(1), builderId: id, reviewerId: id, independentReviewReference: text, unresolvedDefects: strings, releaseDecision: z.enum(["blocked", "local_accepted"]), checks: z.array(z.object({ concern: text, result: z.enum(["passed", "failed", "not_applicable"]), reference: text })).min(1), riskAssessment: text });
const outcomeSchema = z.object({ id, optionId: id, claimIds: z.array(id).min(1), expected: text, observed: text.nullable(), cohort: text, windowStart: date, windowEnd: date, evidenceKind: z.enum(["observed", "simulated", "unknown"]), sourceEventReferences: strings, exposureCount: z.number().int().nonnegative(), costCents: cents.nullable(), uncertainty: strings, nextTest: text, effect: z.enum(["retain", "revise", "retire"]) });
const base = { expectedRevision: z.number().int().nonnegative() };
export const learningCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["pause", "resume"]), ...base }),
  z.object({ kind: z.literal("collect"), ...base, observations: z.array(observationSchema).max(100), costCents: cents }),
  claimSchema.omit({ needsReview: true }).extend({ kind: z.literal("claim"), ...base }),
  trialSchema.extend({ kind: z.literal("trial"), ...base }),
  z.object({ kind: z.literal("alternatives"), ...base, options: z.array(optionSchema).min(4).max(20) }),
  strategySchema.extend({ kind: z.literal("strategy"), ...base }),
  decisionSchema.extend({ kind: z.literal("decide"), ...base }),
  briefContentSchema.extend({ kind: z.literal("brief"), ...base }),
  experienceSchema.extend({ kind: z.literal("experience"), ...base }),
  buildSchema.extend({ kind: z.literal("build"), ...base }),
  outcomeSchema.extend({ kind: z.literal("outcome"), ...base }),
]);
export const learningSchema = learningInputSchema.extend({ status: z.enum(["active", "paused"]), version: z.literal(1), revision: z.number().int().nonnegative(), createdBy: id, createdAt: date, nextRunAt: date, spentCents: cents, evidence: z.array(evidenceSchema).max(1000), claims: z.array(claimSchema).max(200), trials: z.array(trialSchema).max(100), options: z.array(optionSchema).max(20), strategies: z.array(strategySchema).max(100), decisions: z.array(decisionSchema.extend({ actorId: id, at: date })).max(200), briefs: z.array(briefSchema).max(100), experiences: z.array(experienceSchema).max(200), builds: z.array(buildSchema).max(200), outcomes: z.array(outcomeSchema).max(200), experimentProposals: z.array(z.object({ outcomeId: id, nextTest: text, status: z.literal("needs_approval") })).max(200), runs: z.array(z.object({ at: date, costCents: cents, outages: z.array(id), withdrawn: z.array(id) })).max(500), history: z.array(z.object({ revision: z.number().int().positive(), actorId: id, at: date, kind: text })).max(1000) });
export type Learning = z.infer<typeof learningSchema>;
export type LearningObservation = z.infer<typeof observationSchema>;

function fail(message: string): never { throw new WorkspaceConflictError(message); }
function unique(values: string[]) { return [...new Set(values)]; }
export function createLearning(raw: unknown, actorId: string, at = new Date().toISOString()): Learning {
  const input = learningInputSchema.parse(raw);
  if (unique(input.sources.map(s => s.id)).length !== input.sources.length || unique(input.sources.map(s => s.workId)).length !== input.sources.length) fail("A source can be registered only once.");
  return learningSchema.parse({ ...input, status: "active", version: 1, revision: 0, createdBy: actorId, createdAt: at, nextRunAt: at, spentCents: 0, evidence: [], claims: [], trials: [], options: [], strategies: [], decisions: [], briefs: [], experiences: [], builds: [], outcomes: [], experimentProposals: [], runs: [], history: [] });
}

/** Commands record evidence and decisions; they never imply publication or customer proof. */
export function changeLearning(value: Learning, raw: unknown, actorId: string, at = new Date().toISOString()): Learning {
  const work = learningSchema.parse(value);
  const command = learningCommandSchema.parse(raw);
  date.parse(at);
  if (command.expectedRevision !== work.revision) fail("Learning work has a newer revision. Reload before changing it.");
  if (command.kind === "pause" || command.kind === "resume") {
    work.status = command.kind === "pause" ? "paused" : "active";
  } else if (command.kind === "collect") {
    if (work.status === "paused") fail("This collection is paused.");
    if (Date.parse(at) < Date.parse(work.nextRunAt)) fail("This collection is not due yet.");
    if (work.spentCents + command.costCents > work.budgetCents) fail("The collection exceeds the approved budget.");
    const sources = new Map(work.sources.map(s => [s.id, s]));
    const affected = new Set<string>();
    for (const observation of command.observations) {
      const source = sources.get(observation.sourceId);
      if (!source) fail("Collection contains an unauthorized source.");
      if (observation.status !== "available") {
        if (observation.status === "withdrawn") for (const evidence of work.evidence.filter(e => e.sourceIds.includes(source.id))) {
          // Another independently authorized copy can still support the claim.
          evidence.sourceIds = evidence.sourceIds.filter(s => s !== source.id);
          if (!evidence.sourceIds.length) { evidence.status = "withdrawn"; affected.add(evidence.id); }
        }
        continue;
      }
      const prior = work.evidence.find(e => e.fingerprint === observation.fingerprint);
      if (observation.eventAt && Date.parse(observation.eventAt) > Date.parse(at)) fail("Source events cannot be dated in the future.");
      const freshUntil = new Date(Date.parse(observation.eventAt ?? prior?.capturedAt ?? at) + source.freshForHours * 3600000).toISOString();
      if (prior && prior.excerpt === observation.excerpt && prior.evidenceKind === observation.evidenceKind && prior.participantId === observation.participantId) {
        prior.sourceIds = unique([...prior.sourceIds, source.id]); prior.freshUntil = freshUntil; prior.status = "current";
        continue;
      }
      for (const evidence of work.evidence.filter(e => e.sourceIds.includes(source.id) && e.reference === observation.reference && e.status === "current")) { evidence.status = "changed"; affected.add(evidence.id); }
      const evidenceId = createHash("sha256").update(`${observation.fingerprint}:${observation.excerpt}:${observation.evidenceKind}:${observation.participantId ?? ""}`).digest("hex");
      const existing = work.evidence.find(e => e.id === evidenceId);
      if (existing) { existing.status = "current"; existing.freshUntil = freshUntil; existing.sourceIds = unique([...existing.sourceIds, source.id]); }
      else work.evidence.push({ ...observation, id: evidenceId, sourceIds: [source.id], capturedAt: at, segment: source.segment, freshUntil, status: "current" });
    }
    for (const claim of work.claims) if ([...claim.evidenceIds, ...claim.contraryEvidenceIds].some(e => affected.has(e))) claim.needsReview = true;
    work.spentCents += command.costCents;
    work.runs.push({ at, costCents: command.costCents, outages: work.sources.filter(s => !command.observations.some(o => o.sourceId === s.id && o.status !== "outage")).map(s => s.id), withdrawn: command.observations.filter(o => o.status === "withdrawn").map(o => o.sourceId) });
    work.nextRunAt = new Date(Date.parse(at) + work.intervalHours * 3600000).toISOString();
  } else if (command.kind === "trial") {
    const { baseline, candidate } = command;
    if (baseline.workloadId !== candidate.workloadId || baseline.cases !== candidate.cases || !baseline.heldOut || !candidate.heldOut) fail("Compare the same held-out workload and sample size.");
    if ([baseline, candidate].some(m => m.completed > m.cases || m.corrections > m.cases)) fail("Trial completion and correction counts cannot exceed its cases.");
    work.trials = [...work.trials.filter(t => t.id !== command.id), trialSchema.parse(command)];
  } else if (command.kind === "claim") {
    for (const reference of command.contraryEvidenceIds) if (!work.evidence.some(item => item.id === reference)) fail("A claim references missing evidence.");
    const evidence = command.evidenceIds.map(e => work.evidence.find(item => item.id === e) ?? fail("A claim references missing evidence."));
    if (command.certainty === "observed" && (!command.evidenceIds.length || evidence.some(e => e.status !== "current" || Date.parse(e.freshUntil) < Date.parse(at) || ["simulated", "vendor_claim", "public_benchmark"].includes(e.evidenceKind)))) fail("Observed claims require current, nonsimulated primary evidence.");
    const next = claimSchema.parse({ ...command, needsReview: false });
    work.claims = [...work.claims.filter(c => c.id !== next.id), next];
  } else if (command.kind === "alternatives") {
    if (unique(command.options.map(o => o.approach)).length !== 4 || unique(command.options.map(o => o.id)).length !== command.options.length || unique(command.options.map(o => o.behavior.toLowerCase())).length !== command.options.length) fail("Compare four distinct behaviors, including no build.");
    for (const option of command.options) {
      if (option.claimIds.some(c => !work.claims.some(claim => claim.id === c)) || option.trialIds.some(t => !work.trials.some(trial => trial.id === t))) fail("Alternatives must reference existing claims and trials.");
    }
    if (work.decisions.length) fail("Decided alternatives are retained. Create a new learning responsibility to replace them.");
    work.options = command.options;
  } else if (command.kind === "strategy") {
    if (!work.options.some(o => o.id === command.optionId)) fail("Choose an existing alternative.");
    work.strategies = [...work.strategies.filter(s => s.optionId !== command.optionId), strategySchema.parse(command)];
  } else if (command.kind === "decide") {
    const option = work.options.find(o => o.id === command.optionId) ?? fail("Choose an existing alternative.");
    if (command.decision === "test" && (option.approach === "no_build" || !work.strategies.some(s => s.optionId === option.id))) fail("A test needs an actionable alternative and its falsifying strategy.");
    work.decisions.push({ ...decisionSchema.parse(command), actorId, at });
  } else if (command.kind === "brief") {
    if (work.decisions.filter(d => d.optionId === command.optionId).at(-1)?.decision !== "test") fail("A brief needs a current decision to test this alternative.");
    if (unique(command.objects.map(o => o.name.toLowerCase())).length !== command.objects.length) fail("Merge duplicate domain objects before accepting the brief.");
    work.briefs.push({ ...briefContentSchema.parse(command), revision: work.briefs.length + 1, actorId, at });
  } else if (command.kind === "experience") {
    if (!work.briefs.some(b => b.revision === command.briefRevision)) fail("Experience evidence must name a retained brief revision.");
    work.experiences = [...work.experiences.filter(e => e.id !== command.id), experienceSchema.parse(command)];
  } else if (command.kind === "build") {
    const existingBuild = work.builds.find(build => build.id === command.id);
    if (!existingBuild && command.builderId !== actorId) fail("A build must first be registered by its builder.");
    if (existingBuild && (existingBuild.builderId !== command.builderId || existingBuild.implementationReference !== command.implementationReference || existingBuild.contractReference !== command.contractReference || existingBuild.briefRevision !== command.briefRevision)) fail("Changed implementation needs a new build record and independent review.");
    const brief = work.briefs.find(b => b.revision === command.briefRevision) ?? fail("Build proof must name a retained brief revision.");
    const sessions = command.experienceIds.map(id => work.experiences.find(e => e.id === id && e.briefRevision === brief.revision) ?? fail("Build proof references missing or mismatched experience evidence."));
    if (command.releaseDecision === "local_accepted") {
      if (command.builderId === command.reviewerId || actorId !== command.reviewerId) fail("Local acceptance requires the independent reviewer to record their decision.");
      if (brief.revision !== work.briefs.at(-1)?.revision) fail("A superseded brief cannot be accepted for release.");
      if (command.unresolvedDefects.length || command.checks.some(c => c.result === "failed") || sessions.some(e => e.completion !== "completed")) fail("Unresolved defects or failed checks block acceptance.");
      if (brief.requiredUxConditions.some(c => !sessions.some(s => s.conditions.includes(c)))) fail("Required experience conditions have not been exercised.");
    }
    work.builds = [...work.builds.filter(b => b.id !== command.id), buildSchema.parse(command)];
  } else if (command.kind === "outcome") {
    if (!work.options.some(o => o.id === command.optionId) || command.claimIds.some(c => !work.claims.some(claim => claim.id === c))) fail("Outcome links must resolve to existing alternatives and claims.");
    if (Date.parse(command.windowEnd) < Date.parse(command.windowStart) || Date.parse(command.windowEnd) > Date.parse(at)) fail("Outcome exposure window must have ended and cannot run backwards.");
    if (command.evidenceKind === "observed" && (!command.observed || !command.sourceEventReferences.length || !command.exposureCount)) fail("Observed outcomes require source events and a real exposed cohort.");
    if (command.evidenceKind === "unknown" && (command.observed !== null || command.sourceEventReferences.length || command.exposureCount)) fail("Absent telemetry must remain unknown.");
    if (work.outcomes.some(o => o.id === command.id)) fail("Outcome evidence is retained; record a new observation instead of overwriting it.");
    work.outcomes.push(outcomeSchema.parse(command));
    for (const claim of work.claims.filter(c => command.claimIds.includes(c.id))) if (command.effect !== "retain") claim.needsReview = true;
    if (command.effect === "retire" && command.evidenceKind === "observed") work.decisions.push({ optionId: command.optionId, decision: "park", reason: `Outcome ${command.id}: ${command.observed}`, actorId, at });
    work.experimentProposals.push({ outcomeId: command.id, nextTest: command.nextTest, status: "needs_approval" });
  }
  work.revision++;
  work.history.push({ revision: work.revision, actorId, at, kind: command.kind });
  return learningSchema.parse(work);
}

export function learningSummary(value: Learning, at = new Date().toISOString()) {
  const work = learningSchema.parse(value);
  const current = work.evidence.filter(e => e.status === "current" && Date.parse(e.freshUntil) >= Date.parse(at));
  return { actualParticipants: unique(current.filter(e => ["user_account", "behavior"].includes(e.evidenceKind) && e.participantId).map(e => e.participantId!)).length, simulatedEvidence: current.filter(e => e.evidenceKind === "simulated").length, staleEvidence: work.evidence.filter(e => Date.parse(e.freshUntil) < Date.parse(at)).length, reviewClaimIds: work.claims.filter(c => c.needsReview || c.evidenceIds.some(id => !current.some(e => e.id === id))).map(c => c.id), remainingBudgetCents: work.budgetCents - work.spentCents, due: work.status === "active" && Date.parse(work.nextRunAt) <= Date.parse(at) };
}
