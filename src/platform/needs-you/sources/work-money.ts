/**
 * Needs you source: money (needs-you spec section 6, "Allowance cap, job
 * accept, payer" → money; payer only, signed in).
 *
 * What waits on a person today (src/platform/work-economics), each only for
 * the exact payer or addressee the lifecycle names:
 * - `allowance:<id>` a work allowance in `pending_cap_acceptance` whose payer
 *   is the viewer. Approve runs `acceptWorkAllowanceCap` (RPC
 *   `accept_spending_cap`).
 * - `job:<id>` a job budget in `draft` in the viewer's payer inbox. Approve
 *   runs `acceptPayerJob` (`job_economics_command_with_payer_authority`).
 * - `payer:<id>` a pending payer change addressed to the viewer. Approve runs
 *   `commandPayerTransition` with `accept`.
 *
 * Money is sign-in only: the service refuses every email link before an
 * adapter is reached, and the item is owner-only (adminMayDecide false), as
 * the payer RPCs are. Each RPC rechecks that the actor is the named payer or
 * addressee, so a different owner who taps Approve gets `failed` and the
 * source stays pending.
 *
 * Not yet and a lapse change nothing. Rejecting a payer change stays a
 * separate, explicit action on the account screen; "Not yet" is not a no.
 *
 * Proposing reads the viewer's own payer inbox, so items open only for the
 * payer. Reconciling reads the business-wide state, and anything another
 * member can't read is reported as unknown (the service then leaves the item
 * alone) rather than as gone.
 */
import { createHash } from "node:crypto";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";

export interface MoneyAllowanceView { id: string; workspaceId: string; payerId: string; status: string; spendingCapCents: number; periodStart: string; periodEnd: string }
export interface MoneyJobView { id: string; workspaceId: string; status: string; productId: string; estimateCents: number | null; maxAuthorizedCents: number }
export interface MoneyPayerChangeView { id: string; workspaceId: string; successorUserId: string; proposerEmail: string; status: string }

export interface MoneyBillingView { workspaceId: string; paymentStatus: string; paymentUpdatedAt: string | null; monthlyCents: number }
const billingRevision = (row: MoneyBillingView) => hash(["billing", row.workspaceId, row.paymentStatus, row.paymentUpdatedAt]);
export function billingPaymentItem(row: MoneyBillingView): ProposedItem | null {
  if (row.paymentStatus !== "past_due") return null;
  return moneyItem({ sourceId: `billing:${row.workspaceId}`, revisionHash: billingRevision(row), workspaceId: row.workspaceId,
    title: "Your payment needs attention", detail: "Your sites and inquiry capture keep working. Review your payment in billing settings.",
    approveEffect: "The payment must be fixed in billing settings. This decision never charges a card or changes your plan." });
}

export interface WorkMoneyPorts {
  billing?(actor: WorkspaceActor, workspaceId: string): Promise<MoneyBillingView | null>;
  /** Allowances of one business, as the actor may read them. */
  allowances(actor: WorkspaceActor, workspaceId: string): Promise<MoneyAllowanceView[]>;
  /** The actor's payer inbox: job budgets and payer changes addressed to them. */
  inbox(actor: WorkspaceActor): Promise<{ jobs: MoneyJobView[]; transitions: MoneyPayerChangeView[] }>;
  readJob(actor: WorkspaceActor, jobId: string): Promise<MoneyJobView | null>;
  payerChanges(actor: WorkspaceActor, workspaceId: string): Promise<MoneyPayerChangeView[]>;
  /** The lifecycle's own resolvers. */
  acceptAllowanceCap(actor: WorkspaceActor, allowanceId: string): Promise<unknown>;
  acceptJob(actor: WorkspaceActor, jobId: string): Promise<unknown>;
  acceptPayerChange(actor: WorkspaceActor, transitionId: string): Promise<unknown>;
}

function hash(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

const allowanceRevision = (row: MoneyAllowanceView) => hash(["allowance", row.id, row.status, row.payerId, row.spendingCapCents, row.periodStart, row.periodEnd]);
const jobRevision = (row: MoneyJobView) => hash(["job", row.id, row.status, row.estimateCents, row.maxAuthorizedCents]);
const payerRevision = (row: MoneyPayerChangeView) => hash(["payer", row.id, row.status, row.successorUserId]);

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function moneyItem(input: { sourceId: string; revisionHash: string; title: string; detail: string; approveEffect: string; workspaceId: string }): ProposedItem {
  return {
    kind: "money",
    route: "owner_decides",
    title: input.title.slice(0, 200).trim(),
    detail: input.detail,
    approveEffect: input.approveEffect,
    notYetEffect: "Nothing is charged or changed; it waits for you.",
    sourceLifecycle: "work_money",
    sourceId: input.sourceId,
    revisionHash: input.revisionHash,
    urgent: false,
    adminMayDecide: false,
    openHref: `/workspace/account?workspaceId=${encodeURIComponent(input.workspaceId)}`,
  };
}

export function allowanceItem(row: MoneyAllowanceView, actor: WorkspaceActor): ProposedItem | null {
  if (row.status !== "pending_cap_acceptance" || row.payerId !== actor.userId) return null;
  return moneyItem({
    sourceId: `allowance:${row.id}`, revisionHash: allowanceRevision(row), workspaceId: row.workspaceId,
    title: `Accept a spending cap of ${dollars(row.spendingCapCents)}`,
    detail: `For work from ${row.periodStart.slice(0, 10)} to ${row.periodEnd.slice(0, 10)}. It limits cost; it is not an invoice.`,
    approveEffect: `Strelva may spend up to ${dollars(row.spendingCapCents)} on this work in the period.`,
  });
}

export function jobItem(row: MoneyJobView): ProposedItem | null {
  if (row.status !== "draft") return null;
  return moneyItem({
    sourceId: `job:${row.id}`, revisionHash: jobRevision(row), workspaceId: row.workspaceId,
    title: `Accept a budget of up to ${dollars(row.maxAuthorizedCents)}`,
    detail: row.estimateCents === null ? "No estimate yet. The cap is the most it can cost." : `Estimated ${dollars(row.estimateCents)}.`,
    approveEffect: `The work may start and cost up to ${dollars(row.maxAuthorizedCents)}.`,
  });
}

export function payerChangeItem(row: MoneyPayerChangeView, actor: WorkspaceActor): ProposedItem | null {
  if (row.status !== "pending" || row.successorUserId !== actor.userId) return null;
  return moneyItem({
    sourceId: `payer:${row.id}`, revisionHash: payerRevision(row), workspaceId: row.workspaceId,
    title: "Become the payer for this business",
    detail: `${row.proposerEmail} asked you to take over paying for Strelva's work here.`,
    approveEffect: "You become the payer for future work.",
  });
}

function split(sourceId: string): { kind: "allowance" | "job" | "payer" | "billing"; id: string } | null {
  const [kind, id] = sourceId.split(":");
  if ((kind !== "allowance" && kind !== "job" && kind !== "payer" && kind !== "billing") || !id) return null;
  return { kind, id };
}

export function workMoneyAdapter(ports: WorkMoneyPorts): SourceAdapter {
  /** Current revision, or null when nothing waits any more. Throws when the actor can't tell. */
  async function current(actor: WorkspaceActor, workspaceId: string, sourceId: string): Promise<string | null> {
    const source = split(sourceId);
    if (!source) return null;
    if (source.kind === "billing") {
      if (source.id !== workspaceId) throw new Error("billing_wrong_business");
      const row = await ports.billing?.(actor, workspaceId);
      return row?.paymentStatus === "past_due" ? billingRevision(row) : null;
    }
    if (source.kind === "allowance") {
      const row = (await ports.allowances(actor, workspaceId)).find(item => item.id === source.id && item.workspaceId === workspaceId);
      if (!row) throw new Error("allowance_not_visible");
      return row.status === "pending_cap_acceptance" ? allowanceRevision(row) : null;
    }
    if (source.kind === "job") {
      const row = await ports.readJob(actor, source.id);
      if (!row || row.workspaceId !== workspaceId) throw new Error("job_not_visible");
      return row.status === "draft" ? jobRevision(row) : null;
    }
    const row = (await ports.payerChanges(actor, workspaceId)).find(item => item.id === source.id && item.workspaceId === workspaceId);
    if (!row) throw new Error("payer_change_not_visible");
    return row.status === "pending" ? payerRevision(row) : null;
  }
  return {
    lifecycle: "work_money",
    needsMemberActor: true,
    async propose(ctx) {
      if (!ctx.actor) return { items: [], complete: false };
      const actor = ctx.actor;
      const items: ProposedItem[] = [];
      let complete = true;
      try {
        items.push(...(await ports.allowances(actor, ctx.workspaceId)).filter(row => row.workspaceId === ctx.workspaceId).flatMap(row => allowanceItem(row, actor) ?? []));
      } catch { complete = false; }
      try {
        const inbox = await ports.inbox(actor);
        items.push(...inbox.jobs.filter(row => row.workspaceId === ctx.workspaceId).flatMap(row => jobItem(row) ?? []));
        items.push(...inbox.transitions.filter(row => row.workspaceId === ctx.workspaceId).flatMap(row => payerChangeItem(row, actor) ?? []));
      } catch { complete = false; }
      if (ports.billing) {
        try {
          const row = await ports.billing(actor, ctx.workspaceId);
          if (row) {
            const item = billingPaymentItem(row);
            if (item) items.push({ ...item, openHref: `/workspace/billing?workspaceId=${encodeURIComponent(ctx.workspaceId)}` });
          }
        } catch { complete = false; }
      }
      return { items, complete };
    },
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      return current(ctx.actor, ctx.workspaceId, sourceId);
    },
    async resolve(ctx, item, decision, by) {
      if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
      if (decision === "not_yet") return { outcome: "done", reason: "Not yet" };
      // Money is never decided from an email link (the service refuses first); this is the second lock.
      if (by.kind !== "session") return { outcome: "failed", reason: "sign_in_required" };
      const source = split(item.sourceId);
      if (!source) return { outcome: "failed", reason: "source_invalid" };
      try {
        const revision = await current(by.actor, ctx.workspaceId, item.sourceId);
        if (revision === null) return { outcome: "done", reason: "already_resolved" };
        if (revision !== item.revisionHash) return { outcome: "failed", reason: "changed_since_decision" };
        if (source.kind === "billing") return { outcome: "failed", reason: "Fix the payment in billing settings; Strelva has not charged or changed anything." };
        if (source.kind === "allowance") await ports.acceptAllowanceCap(by.actor, source.id);
        else if (source.kind === "job") await ports.acceptJob(by.actor, source.id);
        else await ports.acceptPayerChange(by.actor, source.id);
        return { outcome: "done", receiptRef: `work_money:${source.kind}:${source.id}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
