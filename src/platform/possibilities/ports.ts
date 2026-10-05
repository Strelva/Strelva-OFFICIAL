import type { DeclaredEffect, EffectKind } from "./contracts";
import type { SystemRef } from "./refs";

/** Read-only view of live Systems. Exploring code receives only this port, so
 * it has no method that could write live state. */
export interface LiveSystemsReader {
  current(ref: SystemRef): Promise<{ revisionId: string; content: Record<string, unknown> } | null>;
}

/** An adapter that can rehearse an effect without touching a real provider.
 * `mode` is checked at runtime as well as by type: rehearsal refuses anything
 * that is not declared isolated. */
export interface IsolatedEffectRehearsal {
  readonly kind: EffectKind;
  readonly mode: "isolated" | "live";
  rehearse(effect: DeclaredEffect): Promise<{ ok: boolean; detail: string }>;
}
