import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { AuthorityScope, DeclaredEffect, EffectKind, ProposedConnection, Reversibility, SystemIntroduction } from "@/platform/possibilities/contracts";
import type { IsolatedEffectRehearsal, LiveSystemsReader } from "@/platform/possibilities/ports";
import type { SystemRef } from "@/platform/possibilities/refs";
import type { Activation } from "./contracts";

export type EffectPerformResult =
  | { status: "accepted"; providerRef: string; result?: Record<string, unknown> }
  | { status: "rejected"; reason: string };

/**
 * One outside provider behind a stable interface. `mode` is recorded on every
 * receipt so an isolated fake can never be mistaken for a live write.
 */
export interface EffectAdapter extends IsolatedEffectRehearsal {
  readonly kind: EffectKind;
  readonly mode: "isolated" | "live";
  /** True when the provider itself dedupes on the idempotency key, so a replay
   * with the same key after an interrupted attempt cannot create a duplicate. */
  readonly idempotentByKey: boolean;
  reversibility(effect: DeclaredEffect): Reversibility;
  perform(input: { businessId: string; effect: DeclaredEffect; idempotencyKey: string }): Promise<EffectPerformResult>;
  /** Look up whether an earlier attempt with this key was accepted. `null`
   * means the provider cannot answer, which leaves the step unknown. */
  find(input: { businessId: string; idempotencyKey: string }): Promise<{ found: true; providerRef: string } | { found: false } | null>;
  readBack(input: { businessId: string; providerRef: string }): Promise<{ ok: boolean; detail: string }>;
  compensate?(input: { businessId: string; providerRef: string; idempotencyKey: string }): Promise<{ ok: boolean; detail: string }>;
}

export class BaselineMovedError extends Error {
  constructor(readonly systemId: string, readonly current: string | null) {
    super(`The live System ${systemId} changed since it was pinned.`);
    this.name = "BaselineMovedError";
  }
}

/**
 * Live System state. Reconcile with src/platform/systems (lane B): this is the
 * minimum Make real needs. Every write is idempotent by `key`.
 * `activate` is compare-and-set on the current revision pointer and must
 * throw BaselineMovedError if it moved. Issued outputs are never touched.
 */
export interface LiveSystemsPort extends LiveSystemsReader {
  stageRevision(ref: SystemRef, candidate: { summary: string; content: Record<string, unknown> }, key: string): Promise<{ revisionId: string }>;
  introduceSystem(businessId: string, intro: SystemIntroduction, key: string): Promise<{ systemId: string; revisionId: string }>;
  activate(ref: SystemRef, revisionId: string, expectedCurrent: string | null): Promise<void>;
  restore(ref: SystemRef, revisionId: string | null, expectedCurrent: string): Promise<void>;
  connect(businessId: string, connection: { from: string; to: string; kind: ProposedConnection["kind"]; purpose: string }, key: string): Promise<{ connectionId: string }>;
  disconnect(businessId: string, connectionId: string): Promise<void>;
}

export type AuthorityDecision = { allowed: true; grantId: string } | { allowed: false; reason: string };

/** Current authority, re-evaluated before every step. Never cached. */
export interface AuthorityPort {
  check(actor: WorkspaceActor, input: { businessId: string; scope: AuthorityScope; systemId?: string }): Promise<AuthorityDecision>;
}

export interface OperatingChecksPort {
  run(input: { businessId: string; checkId: string; activation: Activation }): Promise<{ passed: boolean; detail: string }>;
}
