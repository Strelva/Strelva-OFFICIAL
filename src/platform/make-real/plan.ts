import { createHash } from "node:crypto";
import { canonicalJson } from "@/platform/business-record/tenant-import";
import { EFFECT_SCOPE, type Possibility } from "@/platform/possibilities/contracts";
import type { Activation, ActivationStep } from "./contracts";
import type { EffectAdapter } from "./ports";

/**
 * Deterministic idempotency key for one step of one candidate. It never
 * depends on the activation id, so restarting Make real for the same pinned
 * candidate replays the same key and an idempotent provider dedupes it. The
 * epoch moves only after a rollback definitively undid the step (restored or
 * compensated), because then a fresh write is genuinely intended.
 */
export function stepIdempotencyKey(p: Pick<Possibility, "businessId" | "id" | "candidateRevision" | "changes" | "keyEpochs">, stepId: string): string {
  const pins = p.changes.map((c) => [c.baseline.systemId, c.baseline.revisionId]).sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0));
  const epoch = p.keyEpochs?.[stepId] ?? 0;
  const digest = createHash("sha256").update(canonicalJson({ businessId: p.businessId, possibilityId: p.id, candidateRevision: p.candidateRevision, pins, stepId, epoch })).digest("hex");
  return `mr:${stepId.slice(0, 80)}:${digest}`;
}

function stepFor(p: Possibility) {
  return (input: Omit<ActivationStep, "idempotencyKey" | "status" | "effect" | "attempts">): ActivationStep =>
    ({ ...input, idempotencyKey: stepIdempotencyKey(p, input.id), status: "pending", effect: "none", attempts: 0 });
}

/**
 * Order: stage candidates (inert) -> outside effects (each its own receipt) ->
 * switch live references (introduced Systems first, then changed ones) ->
 * connect -> verify. Live behavior does not change until every effect it
 * depends on was accepted, so a stalled effect leaves the current Systems
 * exactly as they were.
 */
export function planActivation(p: Possibility, adapters: readonly EffectAdapter[]): ActivationStep[] {
  const step = stepFor(p);
  const steps: ActivationStep[] = [];
  const prep: string[] = [];
  for (const change of p.changes) {
    const id = `stage:${change.baseline.systemId}`;
    prep.push(id);
    steps.push(step({ id, kind: "stage", target: change.baseline.systemId, label: `Prepare the new ${change.baseline.systemId} (${change.candidate.summary})`, dependsOn: [], reversibility: "reversible" }));
  }
  for (const intro of p.introduces) {
    const id = `introduce:${intro.key}`;
    prep.push(id);
    steps.push(step({ id, kind: "introduce", target: `introduced:${intro.key}`, label: `Create ${intro.name} as a draft System`, dependsOn: [], reversibility: "reversible" }));
  }
  const effectIds: string[] = [];
  for (const effect of p.effects) {
    const adapter = adapters.find((a) => a.kind === effect.kind);
    const id = `effect:${effect.id}`;
    effectIds.push(id);
    steps.push(step({
      id, kind: "effect", target: effect.id, label: effect.description,
      dependsOn: [...prep, ...effect.after.map((e) => `effect:${e}`)],
      scope: EFFECT_SCOPE[effect.kind], effectKind: effect.kind,
      reversibility: adapter ? adapter.reversibility(effect) : "irreversible",
    }));
  }
  const introducedActivations: string[] = [];
  for (const intro of p.introduces) {
    const id = `activate:introduced:${intro.key}`;
    introducedActivations.push(id);
    steps.push(step({ id, kind: "activate", target: `introduced:${intro.key}`, label: `Make ${intro.name} live`, dependsOn: [`introduce:${intro.key}`, ...effectIds], scope: "system.activate", reversibility: "reversible" }));
  }
  const activations = [...introducedActivations];
  for (const change of p.changes) {
    const id = `activate:${change.baseline.systemId}`;
    activations.push(id);
    steps.push(step({ id, kind: "activate", target: change.baseline.systemId, label: `Switch ${change.baseline.systemId} to the new revision`, dependsOn: [`stage:${change.baseline.systemId}`, ...effectIds, ...introducedActivations], scope: "system.activate", reversibility: "reversible" }));
  }
  const connections: string[] = [];
  for (const c of p.connections) {
    const id = `connect:${c.id}`;
    connections.push(id);
    steps.push(step({ id, kind: "connect", target: c.id, label: c.purpose, dependsOn: activations, scope: "system.activate", reversibility: "reversible" }));
  }
  steps.push(step({ id: "verify", kind: "verify", target: p.id, label: "Run the declared operating checks", dependsOn: [...activations, ...connections, ...effectIds], reversibility: "reversible" }));
  return steps;
}

export function initialChecks(p: Possibility): Activation["checks"] {
  return p.checks.map((c) => ({ id: c.id, description: c.description, status: "pending" as const }));
}
