import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { AuthorityScope, DeclaredEffect, EffectKind, MakeRealChannel, ProposedConnection, Reversibility, SystemIntroduction } from "@/platform/possibilities/contracts";
import type { IsolatedEffectRehearsal, LiveSystemsReader } from "@/platform/possibilities/ports";
import type { SystemRef } from "@/platform/systems/contracts";
import type { Activation } from "./contracts";

/** Private native owner inverse frame; it does not make generic closed plans undoable. */
export interface NativeGoogleCompletedUndo { candidateRevision:number;planFingerprint:string;effectId:string;providerRef:string; }

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
  /** The write path a live adapter wraps. An adapter with no channel serves
   * any effect of its kind (the isolated fakes); a channel adapter serves only
   * effects that name its channel. */
  readonly channel?: MakeRealChannel;
  /** True when the provider itself dedupes on the idempotency key, so a replay
   * with the same key after an interrupted attempt cannot create a duplicate. */
  readonly idempotentByKey: boolean;
  reversibility(effect: DeclaredEffect): Reversibility;
  /** Checked right before the step, after authority: not ready blocks the
   * step without attempting it ("Waiting: reason"), so it is safe to resume. */
  ready?(input: { businessId: string; effect: DeclaredEffect }): Promise<{ ok: true } | { ok: false; reason: string }>;
  perform(input: { businessId: string; effect: DeclaredEffect; idempotencyKey: string }): Promise<EffectPerformResult>;
  /** Look up whether an earlier attempt with this key was accepted. `null`
   * means the provider cannot answer, which leaves the step unknown. The
   * declared effect is passed when known, for providers keyed by its content. */
  find(input: { businessId: string; idempotencyKey: string; effect?: DeclaredEffect }): Promise<{ found: true; providerRef: string } | { found: false } | null>;
  readBack(input: { businessId: string; providerRef: string }): Promise<{ ok: boolean; detail: string }>;
  /** Compensation may not be idempotent; the runner persists a CAS claim
   * before invoking it. `ok: false` means it was refused without taking effect
   * and may be retried. If the provider cannot establish its outcome, throw so
   * the activation records it as unknown and requires evidence before retrying. */
  verifyCompensation?(input: { businessId: string; providerRef: string }): Promise<{ ok: boolean; detail: string }>;
  compensate?(input: { businessId: string; providerRef: string; idempotencyKey: string }): Promise<{ ok: boolean; detail: string }>;
}

/**
 * The adapter for one declared effect: the one wrapping its channel, else an
 * adapter of its kind that names no channel (an isolated fake). A live
 * channel adapter never serves an effect that names another channel or none.
 */
export function selectAdapter<A extends Pick<EffectAdapter, "kind" | "channel">>(adapters: readonly A[], effect: Pick<DeclaredEffect, "kind" | "channel">): A | undefined {
  if (effect.channel) {
    const exact = adapters.find((a) => a.kind === effect.kind && a.channel === effect.channel);
    if (exact) return exact;
  }
  return adapters.find((a) => a.kind === effect.kind && !a.channel);
}

export class BaselineMovedError extends Error {
  constructor(readonly systemId: string, readonly current: string | null) {
    super(`The live System ${systemId} changed since it was pinned.`);
    this.name = "BaselineMovedError";
  }
}

/**
 * Live System state: the minimum Make real needs. The production
 * implementation is `createSystemStoreLiveSystems` over the spine's
 * SystemStore (systems-adapter.ts). Every write is idempotent by `key`.
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
