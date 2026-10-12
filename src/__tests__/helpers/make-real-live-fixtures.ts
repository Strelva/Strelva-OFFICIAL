import { randomUUID } from "node:crypto";
import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { createInMemoryPossibilityRepository, createPossibility, markReady, recordRehearsal, rehearsePossibility, type DeclaredEffect, type Possibility, type PossibilityInput } from "@/platform/possibilities";
import { createInMemoryActivationRepository, createInMemoryApprovalRecords, createInMemoryLiveSystems, createIsolatedAdapter, type ActivationRepository, type EffectAdapter } from "@/platform/make-real";
import { createLiveMakeRealService } from "@/platform/make-real/live";
import type { LiveChannelContext } from "@/platform/make-real/live-adapters";

// Shared in-memory channel and plan fixtures; no provider or native database calls.
export const BIZ = "b1000000-0000-4000-8000-000000000001";

export const OWNER: WorkspaceActor = { userId: "b1000000-0000-4000-8000-0000000000a1", verifiedEmail: "owner@mooney.test" };

export const AT = "2026-10-06T12:00:00.000Z";

export const WORK = "b1000000-0000-4000-8000-0000000000c1";

export const HASH = "a".repeat(64);

export function ctx(on: Record<string, boolean> = {}): LiveChannelContext {
  return { actor: OWNER, enabled: async (channel) => on[channel] ?? true };
}

export function hostedPorts() {
  const state = {
    revision: 7, status: "review_ready", approved: null as number | null, candidate: { revision: 3, contentHash: HASH } as { revision: number; contentHash: string } | null,
    receipt: null as null | { receiptId: string; candidateRevision: number; providerUrl: string },
    readBack: null as null | { status: string; message: string }, launches: 0, approvals: 0, failAfterWrite: false,
  };
  return {
    state,
    ports: {
      async read() { return { rebuild: { revision: state.revision, status: state.status, approvedCandidateRevision: state.approved, candidate: state.candidate, tenantId: "mooney", launch: { receipt: state.receipt, readBack: state.readBack } } }; },
      async approve(_a: WorkspaceActor, _w: string, selection: { expectedRevision: number; candidateRevision: number }) {
        if (selection.expectedRevision !== state.revision) throw new WorkspaceConflictError("stale");
        state.approvals++; state.status = "approved"; state.approved = selection.candidateRevision; state.revision++;
      },
      async launch(_a: WorkspaceActor, _w: string, selection: { candidateRevision: number; expectedRevision: number }) {
        if (state.status !== "approved" || selection.expectedRevision !== state.revision) throw new WorkspaceConflictError("Approve the exact current preview before launching.");
        state.launches++;
        state.receipt = { receiptId: `hosted-${selection.candidateRevision}`, candidateRevision: selection.candidateRevision, providerUrl: "https://mooney.strelva.com/" };
        state.readBack = { status: "verified", message: "Serves every page." };
        state.status = "launched";
        if (state.failAfterWrite) throw new Error("Response lost after publish.");
        return { rebuild: { launch: { receipt: state.receipt, readBack: state.readBack } } };
      },
    },
  };
}

export function hostedEffect(id = "publish-site", candidateRevision = 3): DeclaredEffect {
  return {
    id, kind: "publish", channel: "hosted_website", system: { systemId: "b1000000-0000-4000-8000-0000000000e1" }, description: "Publish the rebuilt site",
    request: { workId: WORK, candidateRevision, candidateContentHash: HASH }, after: [], publish: { section: "hero", data: { headline: "Mooney Firm" } },
  };
}

export async function readyPossibility(input: Partial<PossibilityInput> & { effects: DeclaredEffect[] }) {
  const live = createInMemoryLiveSystems();
  const site = { businessId: BIZ, systemId: "b1000000-0000-4000-8000-0000000000e1" };
  const baseline = live.seed(site, "attymooney.com", { pages: 3 });
  let p = createPossibility({
    title: "consult booking", intent: "Add consult booking.",
    changes: [{ baseline: { ...site, revisionId: baseline, number: 1 }, candidate: { summary: "booking", content: { pages: 4 } } }],
    checks: [{ id: "site-serves", description: "attymooney.com serves every page." }],
    ...input,
  }, { id: randomUUID(), businessId: BIZ, actorId: OWNER.userId, at: AT });
  const rehearsal = await rehearsePossibility(p, live.port, [createIsolatedAdapter("publish"), createIsolatedAdapter("calendar")], AT);
  p = recordRehearsal(p, rehearsal, p.revision, OWNER.userId, AT);
  p = await markReady(p, live.port, p.revision, OWNER.userId, AT);
  return { p, live, site };
}

export function service(input: { p: Possibility; live: ReturnType<typeof createInMemoryLiveSystems>; adapters: EffectAdapter[]; activations?: ActivationRepository; clock?: { now: number }; recordService?: Parameters<typeof createLiveMakeRealService>[0]["recordService"]; adapterFactory?: Parameters<typeof createLiveMakeRealService>[0]["adapters"] }) {
  const possibilities = createInMemoryPossibilityRepository();
  const activations = input.activations ?? createInMemoryActivationRepository();
  const approvals = createInMemoryApprovalRecords();
  const clock = input.clock ?? { now: Date.parse(AT) };
  const svc = createLiveMakeRealService({
    possibilities: () => possibilities, activations: () => activations, live: () => input.live.port,
    adapters: input.adapterFactory ?? (() => input.adapters), approvals, clock: () => new Date(clock.now).toISOString(),
    ...(input.recordService ? { recordService: input.recordService } : {}),
  });
  return { svc, possibilities, activations, approvals, clock };
}
