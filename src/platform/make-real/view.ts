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
  /** True while any step's outside outcome is unknown. Nothing may be
   * reported as undone or absent until these are reconciled. */
  needsReconciliation: boolean;
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
  const rollbackWaiting = Boolean(a.rollbackStartedAt) && a.status !== "rolled_back";
  const headline =
    a.status === "made_real" ? "Made real. Every operating check passed."
      : rollbackWaiting && unknown.length ? `Rollback is not finished. ${unknown.length} outside effect(s) have an unknown outcome and need reconciliation with evidence before anything can be called undone.`
      : rollbackWaiting ? "Rollback is not finished. Run it again to complete it."
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
    needsReconciliation: unknown.length > 0,
    cannotUndo: accepted.filter((s) => s.reversibility === "irreversible").map((s) => s.label),
    checks: a.checks,
  };
}

/** The customer's word for one step (systems-experience spec section 4). */
export type CustomerStepState =
  | "Done"
  | "Done, not yet confirmed"
  | "Waiting"
  | "Didn't happen"
  | "Not sure yet"
  | "Undone"
  | "Can't be undone"
  | "Not started";

export interface CustomerStepLine {
  step: string;
  label: string;
  state: CustomerStepState;
  /** The reason, and who unblocks it, in plain words. */
  detail: string | null;
  /** An isolated fake's receipt is never shown as a real change. */
  isolated: boolean;
}

export interface CustomerActivationView {
  status: Activation["status"];
  /** "Making consult booking live: 2 of 4 done", "Partly live", "Live.", "Undone." */
  headline: string;
  partlyLive: boolean;
  done: number;
  total: number;
  lines: CustomerStepLine[];
  /** Strelva never says done while any step is unknown. */
  checking: boolean;
}

function plainReason(reason: string | undefined): string | null {
  if (!reason) return null;
  return reason.replace(/^(Waiting|Needs approval): /, "").slice(0, 300) || null;
}

/** One line per step, in the customer's words. Accepted effects that rollback
 * left in place say they can't be undone, with why. */
export function customerStepLines(a: Activation): CustomerStepLine[] {
  return a.steps.flatMap((s): CustomerStepLine[] => {
    const isolated = s.receipt?.adapterMode === "isolated";
    let state: CustomerStepState;
    let detail: string | null = null;
    switch (s.status) {
      case "completed":
        if (s.kind === "effect" && s.effect === "accepted" && a.rollbackStartedAt) {
          state = "Can't be undone";
          detail = plainReason(s.reason) ?? "It already happened outside Strelva.";
        } else if (s.kind === "effect" && s.readBack?.status === "failed") {
          state = "Done, not yet confirmed";
          detail = s.readBack.detail;
        } else {
          state = "Done";
        }
        break;
      case "blocked": state = "Waiting"; detail = plainReason(s.reason); break;
      case "failed": state = "Didn't happen"; detail = plainReason(s.reason); break;
      case "unknown": state = "Not sure yet"; detail = "Strelva is checking."; break;
      case "restored":
      case "compensated": state = "Undone"; detail = plainReason(s.reason); break;
      case "running": state = "Not started"; detail = "Running now."; break;
      default: state = "Not started";
    }
    const main = { step: s.id, label: s.label, state, detail, isolated };
    const cutover = s.receipt?.adapterMode === "live" && Array.isArray(s.receipt.result?.cutover) ? s.receipt.result.cutover : [];
    return [main, ...cutover.flatMap((raw): CustomerStepLine[] => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      if (typeof item.id !== "string" || typeof item.label !== "string" || !["done", "waiting", "failed", "not_needed"].includes(String(item.status))) return [];
      return [{ step: `${s.id}:${item.id}`, label: item.label, state: item.status === "waiting" ? "Waiting" : item.status === "failed" ? "Done, not yet confirmed" : "Done", detail: item.status === "not_needed" ? "Not needed for this site." : null, isolated: false }];
    })];
  });
}

/** The status table in spec section 4. `name` is what is being made live. */
export function customerActivationView(a: Activation, name: string): CustomerActivationView {
  const lines = customerStepLines(a);
  const done = a.steps.filter((s) => s.status === "completed").length;
  const total = a.steps.length;
  const landed = a.steps.some((s) => (s.kind === "effect" && s.effect === "accepted") || (s.kind === "activate" && s.status === "completed"));
  const checking = a.steps.some((s) => s.status === "unknown");
  const cutoverWaiting = lines.some((line) => line.step.includes(":domain_moved") && line.state === "Waiting");
  const partlyLive = (a.status === "needs_attention" || cutoverWaiting) && landed && !a.rollbackStartedAt;
  const headline =
    a.status === "made_real" ? (cutoverWaiting ? "Live at its Strelva address. Your domain is waiting on DNS." : "Live.")
      : a.status === "rolled_back" ? "Undone."
        : a.rollbackStartedAt ? (checking ? "Undoing. Strelva is checking what already happened." : "Undoing.")
          : a.status === "needs_attention" ? (landed ? "Partly live" : "Nothing changed yet. Strelva is on it.")
            : `Making ${name} live: ${done} of ${total} done`;
  return { status: a.status, headline, partlyLive, done, total, lines, checking };
}
