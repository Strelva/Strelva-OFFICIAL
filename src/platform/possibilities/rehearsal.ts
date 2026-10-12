import { WorkspaceConflictError } from "@/platform/workspaces/types";
import type { Possibility, Rehearsal } from "./contracts";
import type { IsolatedEffectRehearsal, LiveSystemsReader } from "./ports";

/**
 * Rehearse a possibility: observe live baselines through a read-only port and
 * run every declared effect through an isolated adapter. A live adapter is
 * refused outright, so exploring can never send, charge, book or publish.
 * Synthetic rehearsal is not measured business impact; the result says so.
 */
export async function rehearsePossibility(
  p: Possibility,
  live: LiveSystemsReader,
  adapters: readonly IsolatedEffectRehearsal[],
  at: string,
): Promise<Rehearsal> {
  for (const adapter of adapters) {
    if (adapter.mode !== "isolated") throw new WorkspaceConflictError(`Exploring cannot use a live ${adapter.kind} adapter.`);
  }
  const observedBaselines: Record<string, string> = {};
  for (const change of p.changes) {
    const current = await live.current(change.baseline);
    if (current) observedBaselines[change.baseline.systemId] = current.revisionId;
  }
  const effects: Rehearsal["effects"] = [];
  const limitations = ["Isolated rehearsal: no real calendar, message, payment or publish provider was called.", "Synthetic results are not measured customer behavior."];
  for (const effect of p.effects) {
    const adapter = adapters.find((a) => a.kind === effect.kind);
    if (!adapter) {
      effects.push({ effectId: effect.id, mode: "isolated", ok: false, detail: `No isolated ${effect.kind} adapter is available to rehearse this effect.` });
      continue;
    }
    const result = await adapter.rehearse(effect);
    effects.push({ effectId: effect.id, mode: "isolated", ok: result.ok, detail: result.detail.slice(0, 1000) });
  }
  const baselinesMatch = p.changes.every((c) => observedBaselines[c.baseline.systemId] === c.baseline.revisionId);
  if (!baselinesMatch) limitations.push("A live System changed since the candidate was built; refresh before relying on this comparison.");
  return {
    candidateRevision: p.candidateRevision,
    at,
    observedBaselines,
    effects,
    ok: baselinesMatch && effects.every((e) => e.ok),
    limitations,
  };
}
