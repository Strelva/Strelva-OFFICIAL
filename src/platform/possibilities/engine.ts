import { WorkspaceConflictError } from "@/platform/workspaces/types";
import {
  possibilityInputSchema,
  possibilitySchema,
  rehearsalSchema,
  type ExtractionConflict,
  type Possibility,
  type PossibilityInput,
  type Rehearsal,
  type SystemTarget,
} from "./contracts";
import type { LiveSystemsReader } from "./ports";

function conflict(message: string): never {
  throw new WorkspaceConflictError(message);
}

function copy(value: Possibility): Possibility {
  return structuredClone(possibilitySchema.parse(value));
}

function record(p: Possibility, kind: string, actorId: string, at: string, detail?: string): Possibility {
  if (p.history.length >= 1000) conflict("This possibility has reached its history limit. Start a new one from it.");
  p.revision += 1;
  p.updatedAt = at;
  p.history.push({ revision: p.revision, kind, actorId, at, ...(detail ? { detail: detail.slice(0, 1000) } : {}) });
  return possibilitySchema.parse(p);
}

function expect(p: Possibility, expectedRevision: number) {
  if (p.revision !== expectedRevision) conflict("This possibility changed. Reload before deciding.");
}

function validateShape(businessId: string, input: ReturnType<typeof possibilityInputSchema.parse>) {
  const introduced = new Set<string>();
  for (const intro of input.introduces) {
    if (introduced.has(intro.key)) conflict(`Introduced System "${intro.key}" is declared twice.`);
    introduced.add(intro.key);
    if (intro.extractedFrom.some((ref) => ref.businessId !== businessId)) conflict("An extraction can only draw from this business's Systems.");
  }
  const changed = new Set<string>();
  for (const change of input.changes) {
    if (change.baseline.businessId !== businessId) conflict("A possibility can only change this business's Systems.");
    if (changed.has(change.baseline.systemId)) conflict("Each System appears once in a possibility's changes.");
    changed.add(change.baseline.systemId);
  }
  const target = (t: SystemTarget) => {
    if ("introducedKey" in t && !introduced.has(t.introducedKey)) conflict(`"${t.introducedKey}" is not a System this possibility introduces.`);
  };
  const connectionIds = new Set<string>();
  for (const c of input.connections) {
    if (connectionIds.has(c.id)) conflict("Connection ids must be unique.");
    connectionIds.add(c.id);
    target(c.from); target(c.to);
  }
  const effectIds = new Set<string>();
  for (const e of input.effects) {
    if (effectIds.has(e.id)) conflict("Effect ids must be unique.");
    if (e.after.some((id) => !effectIds.has(id))) conflict("An effect can only wait on effects declared before it.");
    // Content goes through ai-governance by section. A publish through a
    // structural channel (a whole site, a form, a booking page, an app
    // release) is governed by that channel's own review and the owner's
    // plan approval instead.
    if (e.kind === "publish" && !e.publish && (!e.channel || e.channel === "tenant_content")) conflict("A publish effect must declare the content it publishes so it can be governed.");
    effectIds.add(e.id);
    target(e.system);
  }
  const checkIds = new Set<string>();
  for (const c of input.checks) {
    if (checkIds.has(c.id)) conflict("Operating check ids must be unique.");
    checkIds.add(c.id);
  }
  if (input.changes.length + input.introduces.length === 0) conflict("A possibility must change or introduce at least one System.");
}

export function createPossibility(raw: PossibilityInput, meta: { id: string; businessId: string; actorId: string; at: string }): Possibility {
  const input = possibilityInputSchema.parse(raw);
  validateShape(meta.businessId, input);
  return possibilitySchema.parse({
    ...input,
    version: 1,
    id: meta.id,
    businessId: meta.businessId,
    status: "exploring",
    revision: 0,
    candidateRevision: 1,
    propagation: "new_outputs_only",
    createdBy: meta.actorId,
    createdAt: meta.at,
    updatedAt: meta.at,
    history: [],
  });
}

function assertOpen(p: Possibility) {
  if (p.status === "made_real" || p.status === "withdrawn") conflict("This possibility is closed.");
  if (p.activationId) conflict("This possibility is being made real. Finish or roll back that activation before changing it.");
}

/** Any candidate change returns the possibility to Exploring and discards the
 * rehearsal: evidence about a different candidate is not evidence about this one. */
export function reviseCandidate(raw: Possibility, patch: Partial<PossibilityInput>, expectedRevision: number, actorId: string, at: string): Possibility {
  const p = copy(raw);
  expect(p, expectedRevision);
  assertOpen(p);
  const next = possibilityInputSchema.parse({
    title: patch.title ?? p.title, intent: patch.intent ?? p.intent,
    changes: patch.changes ?? p.changes, introduces: patch.introduces ?? p.introduces,
    connections: patch.connections ?? p.connections, effects: patch.effects ?? p.effects, checks: patch.checks ?? p.checks,
  });
  validateShape(p.businessId, next);
  Object.assign(p, next);
  p.candidateRevision += 1;
  p.status = "exploring";
  p.rehearsal = undefined;
  return record(p, "revise", actorId, at);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

/** The owner picks the authoritative value for an extraction conflict. */
export function resolveConflict(raw: Possibility, input: { introducedKey: string; path: string; fromSystemId: string }, expectedRevision: number, actorId: string, at: string): Possibility {
  const p = copy(raw);
  expect(p, expectedRevision);
  assertOpen(p);
  const intro = p.introduces.find((i) => i.key === input.introducedKey);
  const found: ExtractionConflict | undefined = intro?.conflicts.find((c) => c.path === input.path);
  if (!intro || !found) conflict("That extraction conflict does not exist.");
  const chosen = found.values.find((v) => v.systemId === input.fromSystemId);
  if (!chosen) conflict("Choose one of the values the existing Systems actually hold.");
  found.resolved = { value: chosen.value, chosenBy: actorId, at, fromSystemId: chosen.systemId };
  setPath(intro.candidate.content, found.path, structuredClone(chosen.value));
  p.candidateRevision += 1;
  p.status = "exploring";
  p.rehearsal = undefined;
  return record(p, "resolve_conflict", actorId, at, `${intro.key}.${found.path} <- ${chosen.systemId}`);
}

export function unresolvedConflicts(p: Possibility): Array<{ introducedKey: string; path: string }> {
  return p.introduces.flatMap((i) => i.conflicts.filter((c) => !c.resolved).map((c) => ({ introducedKey: i.key, path: c.path })));
}

export function recordRehearsal(raw: Possibility, rehearsal: Rehearsal, expectedRevision: number, actorId: string, at: string): Possibility {
  const p = copy(raw);
  expect(p, expectedRevision);
  assertOpen(p);
  const parsed = rehearsalSchema.parse(rehearsal);
  if (parsed.candidateRevision !== p.candidateRevision) conflict("This rehearsal was for an older candidate.");
  p.rehearsal = parsed;
  return record(p, "rehearse", actorId, at, parsed.ok ? "ok" : "failed");
}

export interface StaleBaseline { systemId: string; pinned: string; current: string | null }

export async function staleBaselines(p: Possibility, live: LiveSystemsReader): Promise<StaleBaseline[]> {
  const stale: StaleBaseline[] = [];
  for (const change of p.changes) {
    const current = await live.current(change.baseline);
    if (current?.revisionId !== change.baseline.revisionId) stale.push({ systemId: change.baseline.systemId, pinned: change.baseline.revisionId, current: current?.revisionId ?? null });
  }
  return stale;
}

/** Ready means ready for a decision under stated evidence. It does not mean
 * accounts are connected or that any outside effect has happened. */
export async function markReady(raw: Possibility, live: LiveSystemsReader, expectedRevision: number, actorId: string, at: string): Promise<Possibility> {
  const p = copy(raw);
  expect(p, expectedRevision);
  assertOpen(p);
  if (p.status !== "exploring") conflict("Only an exploring possibility can be marked ready.");
  const open = unresolvedConflicts(p);
  if (open.length) conflict(`Choose the authoritative value for ${open.map((c) => `${c.introducedKey}.${c.path}`).join(", ")} before this is ready.`);
  if (!p.rehearsal || p.rehearsal.candidateRevision !== p.candidateRevision) conflict("Rehearse the current candidate before marking it ready.");
  if (!p.rehearsal.ok) conflict("The last rehearsal failed. Fix the candidate and rehearse again.");
  const stale = await staleBaselines(p, live);
  if (stale.length) conflict(`The live ${stale.map((s) => s.systemId).join(", ")} changed since this was built. Refresh the candidate first.`);
  for (const change of p.changes) {
    if (p.rehearsal.observedBaselines[change.baseline.systemId] !== change.baseline.revisionId) conflict("The rehearsal ran against a different baseline. Rehearse again.");
  }
  p.status = "ready";
  return record(p, "ready", actorId, at);
}

/** A relevant live change invalidates comparisons and activation assumptions. */
export function returnToExploring(raw: Possibility, reason: string, actorId: string, at: string): Possibility {
  const p = copy(raw);
  if (p.status === "made_real" || p.status === "withdrawn") conflict("This possibility is closed.");
  p.status = "exploring";
  p.rehearsal = undefined;
  return record(p, "stale", actorId, at, reason);
}

export function attachActivation(raw: Possibility, activationId: string, actorId: string, at: string): Possibility {
  const p = copy(raw);
  if (p.status !== "ready") conflict("Only a ready possibility can be made real.");
  if (p.activationId) conflict("This possibility is already being made real.");
  p.activationId = activationId;
  return record(p, "make_real_started", actorId, at, activationId);
}

export function detachActivation(raw: Possibility, activationId: string, actorId: string, at: string, settled: { undoneStepIds?: string[]; consumedApprovalIds?: string[] } = {}): Possibility {
  const p = copy(raw);
  if (p.activationId !== activationId) conflict("That activation does not belong to this possibility.");
  p.activationId = undefined;
  if (settled.undoneStepIds?.length) {
    const epochs = { ...(p.keyEpochs ?? {}) };
    for (const id of settled.undoneStepIds) epochs[id] = (epochs[id] ?? 0) + 1;
    p.keyEpochs = epochs;
  }
  if (settled.consumedApprovalIds?.length) p.consumedApprovalIds = [...new Set([...(p.consumedApprovalIds ?? []), ...settled.consumedApprovalIds])];
  return record(p, "make_real_rolled_back", actorId, at, activationId);
}

export function markMadeReal(raw: Possibility, activationId: string, actorId: string, at: string): Possibility {
  const p = copy(raw);
  if (p.activationId !== activationId || p.status !== "ready") conflict("Only the activation that is making this possibility real can close it.");
  p.status = "made_real";
  return record(p, "made_real", actorId, at, activationId);
}

export function withdrawPossibility(raw: Possibility, expectedRevision: number, actorId: string, at: string): Possibility {
  const p = copy(raw);
  expect(p, expectedRevision);
  assertOpen(p);
  p.status = "withdrawn";
  return record(p, "withdraw", actorId, at);
}

function flatten(value: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else if (prefix) {
    out[prefix] = value;
  }
  return out;
}

export interface SystemComparison {
  systemId: string;
  baselineRevisionId: string;
  currentRevisionId: string | null;
  stale: boolean;
  differences: Array<{ path: string; current: unknown; candidate: unknown }>;
}

/** Compare the candidate against what is live right now, per System. */
export async function comparePossibility(p: Possibility, live: LiveSystemsReader): Promise<{ changes: SystemComparison[]; introduces: Array<{ key: string; name: string; extractedFrom: string[]; unresolved: string[] }> }> {
  const changes: SystemComparison[] = [];
  for (const change of p.changes) {
    const current = await live.current(change.baseline);
    const before = flatten(current?.content ?? {}), after = flatten(change.candidate.content);
    const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    changes.push({
      systemId: change.baseline.systemId,
      baselineRevisionId: change.baseline.revisionId,
      currentRevisionId: current?.revisionId ?? null,
      stale: current?.revisionId !== change.baseline.revisionId,
      differences: paths
        .filter((path) => JSON.stringify(before[path]) !== JSON.stringify(after[path]))
        .map((path) => ({ path, current: before[path], candidate: after[path] })),
    });
  }
  return {
    changes,
    introduces: p.introduces.map((i) => ({
      key: i.key, name: i.name, extractedFrom: i.extractedFrom.map((r) => r.systemId),
      unresolved: i.conflicts.filter((c) => !c.resolved).map((c) => c.path),
    })),
  };
}
