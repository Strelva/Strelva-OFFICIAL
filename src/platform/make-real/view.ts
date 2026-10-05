import type { Activation } from "./contracts";

export interface ActivationView {
  status: Activation["status"];
  headline: string;
  /** Accepted or completed, with whether a fake or live provider did it. */
  done: Array<{ step: string; label: string; provider?: string; mode?: string; readBack?: "confirmed" | "failed" }>;
  /** Stopped and why. Resume retries these after the cause is fixed. */
  waiting: Array<{ step: string; label: string; reason: string }>;
  /** Outcome not known; needs evidence before anything else for that step. */
  unknown: Array<{ step: string; label: string }>;
  notStarted: string[];
  /** True while every pinned System still serves its pre-activation revision. */
  liveUnchanged: boolean;
  /** Accepted effects that rollback cannot remove. */
  cannotUndo: string[];
  checks: Activation["checks"];
}

/** The partial state a customer or operator sees. No fake atomicity: each
 * accepted effect is listed on its own, including ones that cannot be undone. */
export function describeActivation(a: Activation): ActivationView {
  const switched = a.steps.some((s) => s.kind === "activate" && s.status === "completed");
  const done = a.steps.filter((s) => s.status === "completed").map((s) => ({
    step: s.id, label: s.label,
    ...(s.receipt?.providerRef ? { provider: s.receipt.providerRef } : {}),
    ...(s.receipt ? { mode: s.receipt.adapterMode } : {}),
    ...(s.readBack ? { readBack: s.readBack.status } : {}),
  }));
  const waiting = a.steps.filter((s) => s.status === "blocked" || s.status === "failed").map((s) => ({ step: s.id, label: s.label, reason: s.reason ?? "" }));
  const unknown = a.steps.filter((s) => s.status === "unknown").map((s) => ({ step: s.id, label: s.label }));
  const accepted = a.steps.filter((s) => s.kind === "effect" && s.effect === "accepted" && s.status !== "compensated");
  const headline =
    a.status === "made_real" ? "Made real. Every operating check passed."
      : a.status === "rolled_back" ? `Rolled back. ${accepted.length ? `${accepted.length} outside effect(s) already happened and are listed.` : "No outside effect remains."}`
        : a.status === "needs_attention" ? `Partly done: ${done.length} of ${a.steps.length} steps. ${switched ? "Some live Systems already switched." : "Your live Systems are unchanged."}`
          : `In progress: ${done.length} of ${a.steps.length} steps.`;
  return {
    status: a.status,
    headline,
    done,
    waiting,
    unknown,
    notStarted: a.steps.filter((s) => s.status === "pending").map((s) => s.id),
    liveUnchanged: !switched,
    cannotUndo: accepted.filter((s) => s.reversibility === "irreversible").map((s) => s.label),
    checks: a.checks,
  };
}
