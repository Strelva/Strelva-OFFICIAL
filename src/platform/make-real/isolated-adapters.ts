import type { DeclaredEffect, EffectKind, Reversibility } from "@/platform/possibilities/contracts";
import type { EffectAdapter } from "./ports";

/**
 * ISOLATED FAKE PROVIDERS. Nothing here calls Google Calendar, email, Stripe or
 * a live website. Each adapter keeps an in-process ledger so tests can prove
 * exactly-once behavior. Every receipt carries `adapterMode: "isolated"` and a
 * provider ref starting with `isolated-`, so a fake can never be presented as
 * a real accepted write.
 */

export interface IsolatedLedgerEntry {
  providerRef: string;
  idempotencyKey: string;
  businessId: string;
  effectId: string;
  request: Record<string, unknown>;
  state: "accepted" | "compensated";
}

export interface IsolatedAdapterOptions {
  reversibility?: Reversibility;
  /** Provider dedupes on idempotency key (true for the calendar/payment fakes). */
  idempotentByKey?: boolean;
  /** Provider supports lookup by idempotency key. */
  supportsLookup?: boolean;
}

export interface IsolatedAdapter extends EffectAdapter {
  readonly ledger: IsolatedLedgerEntry[];
  /** Number of times perform reached the provider, including deduped replays. */
  readonly calls: { perform: number; compensate: number };
  /** Fault injection for tests. */
  faults: { throwOnPerform?: boolean; rejectNext?: string; failReadBack?: boolean; acceptThenThrow?: boolean };
}

const DEFAULT_REVERSIBILITY: Record<EffectKind, Reversibility> = {
  calendar: "compensable", // a created slot type / hold can be cancelled
  payment: "compensable", // a checkout link can be deactivated; a captured charge could not
  message: "irreversible", // a delivered message cannot be unsent
  publish: "compensable", // a published section can be unpublished
};

export function createIsolatedAdapter(kind: EffectKind, options: IsolatedAdapterOptions = {}): IsolatedAdapter {
  const ledger: IsolatedLedgerEntry[] = [];
  const calls = { perform: 0, compensate: 0 };
  const idempotentByKey = options.idempotentByKey ?? kind !== "message";
  const supportsLookup = options.supportsLookup ?? true;
  let sequence = 0;
  const adapter: IsolatedAdapter = {
    kind,
    mode: "isolated",
    idempotentByKey,
    ledger,
    calls,
    faults: {},
    reversibility: (_effect: DeclaredEffect) => options.reversibility ?? DEFAULT_REVERSIBILITY[kind],
    async rehearse(effect) {
      return { ok: true, detail: `Isolated ${kind} rehearsal: would ${effect.description.toLowerCase()}. No provider was called.` };
    },
    async perform({ businessId, effect, idempotencyKey }) {
      calls.perform += 1;
      if (adapter.faults.throwOnPerform) throw new Error(`Isolated ${kind} provider timed out.`);
      if (adapter.faults.rejectNext) {
        const reason = adapter.faults.rejectNext;
        adapter.faults.rejectNext = undefined;
        return { status: "rejected", reason };
      }
      const existing = idempotentByKey ? ledger.find((e) => e.idempotencyKey === idempotencyKey && e.businessId === businessId) : undefined;
      const entry = existing ?? { providerRef: `isolated-${kind}-${++sequence}`, idempotencyKey, businessId, effectId: effect.id, request: structuredClone(effect.request), state: "accepted" as const };
      if (!existing) ledger.push(entry);
      if (adapter.faults.acceptThenThrow) {
        adapter.faults.acceptThenThrow = false;
        throw new Error(`Isolated ${kind} provider accepted but the response was lost.`);
      }
      return { status: "accepted", providerRef: entry.providerRef, result: { isolated: true } };
    },
    async find({ businessId, idempotencyKey }) {
      if (!supportsLookup) return null;
      const entry = ledger.find((e) => e.idempotencyKey === idempotencyKey && e.businessId === businessId);
      return entry ? { found: true, providerRef: entry.providerRef } : { found: false };
    },
    async readBack({ businessId, providerRef }) {
      if (adapter.faults.failReadBack) return { ok: false, detail: `Isolated ${kind} read-back unavailable.` };
      const entry = ledger.find((e) => e.providerRef === providerRef && e.businessId === businessId);
      return entry?.state === "accepted" ? { ok: true, detail: `Isolated ${kind} ${providerRef} present.` } : { ok: false, detail: `Isolated ${kind} ${providerRef} not found.` };
    },
    async compensate({ businessId, providerRef }) {
      calls.compensate += 1;
      const entry = ledger.find((e) => e.providerRef === providerRef && e.businessId === businessId);
      if (!entry) return { ok: false, detail: `Isolated ${kind} ${providerRef} not found.` };
      entry.state = "compensated";
      return { ok: true, detail: `Isolated ${kind} ${providerRef} cancelled.` };
    },
  };
  if ((options.reversibility ?? DEFAULT_REVERSIBILITY[kind]) === "irreversible") delete adapter.compensate;
  return adapter;
}
