import { z } from "zod";
import { canonicalJson, sha256 } from "@/platform/business-record/tenant-import";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { InquiryEngine } from "./inquiry-engine";
import { REHEARSAL_CHECK_IDS } from "./contracts";
import type { InquiryCapabilityDefinition, InquiryEngineState, RehearsalRun } from "./contracts";
import type { InquiryWorkspaceSnapshot, InquiryRepository } from "./repository";
import { inquiryReleaseMayBeOn, inquiryReleaseEnabledForWorkspace } from "./release";

export const askFollowUpRuleSchema = z.object({
  kind: z.literal("inquiry-follow-up-rule"), capabilityId: z.string().min(1).max(120).optional(),
  afterMinutes: z.number().int().min(1).max(525600), maxAttempts: z.number().int().min(1).max(100),
  messageTemplate: z.string().trim().min(1).max(5000).refine(text => /\bstrelva\b/i.test(text), "The follow-up must say Strelva."),
}).strict();
export const askInquiryFollowUpSelectionSchema = z.object({
  kind: z.literal("ask-inquiry-follow-up"), workspaceId: z.string().uuid(), systemId: z.string().uuid(),
  tenantId: z.string().min(1).max(120), tenantStableId: z.string().uuid(), nativeOriginId: z.string().uuid(),
  baselineRevisionId: z.string().uuid(), snapshotRevision: z.number().int().nonnegative(), requestId: z.string().min(1).max(200),
  capabilityId: z.string().min(1).max(120), changeId: z.string().min(1).max(200), version: z.number().int().positive(),
  liveHash: z.string().regex(/^[a-f0-9]{64}$/), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  draftHash: z.string().regex(/^[a-f0-9]{64}$/), seed: z.string().uuid(), at: z.string().datetime(), rule: askFollowUpRuleSchema,
}).strict();
export type AskInquiryFollowUpSelection = z.infer<typeof askInquiryFollowUpSelectionSchema>;
export const inquiryDefinitionHash = (definition: InquiryCapabilityDefinition) => sha256(canonicalJson(definition));

/** Calculate a genuine native rule edit/rehearsal privately. No live configuration or records change. */
export function composeAskInquiryFollowUp(snapshot: InquiryWorkspaceSnapshot, selection: { capabilityId?: string; rule: unknown; actorId: string; seed: string; at: string }) {
  const rule = askFollowUpRuleSchema.parse(selection.rule);
  const capabilities = snapshot.state.capabilities.filter(item => item.status === "live" && item.live && (!selection.capabilityId || item.id === selection.capabilityId));
  if (capabilities.length !== 1) throw new Error("Choose one live inquiry capability for this System.");
  const capability = capabilities[0]!;
  const live = capability.live!;
  if (!live.followUp || capability.activeRequestId) throw new Error("Finish existing inquiry work before changing its current follow-up rule.");
  if (!live.connections.some(item => item.status === "connected" && item.consent === "explicit")) throw new Error("The existing follow-up needs its own current, explicitly consented email Connection.");
  const works = snapshot.state.requests.filter(item => item.capabilityId === capability.id && item.state === "handled" && item.draft && inquiryDefinitionHash(item.draft) === inquiryDefinitionHash(live));
  if (works.length !== 1) throw new Error("This inquiry capability has no exact handled source draft. Strelva must prepare that baseline first.");
  const source = works[0]!;
  let sequence = 0;
  const engine = new InquiryEngine({ businessId: snapshot.businessId, state: structuredClone(snapshot.state) as InquiryEngineState,
    now: () => selection.at, idFactory: prefix => `${selection.seed}:${prefix}:${++sequence}` });
  const result = engine.updateInquiryRules(source.id, { actorId: selection.actorId, source: "words", followUp: { afterMinutes: rule.afterMinutes, maxAttempts: rule.maxAttempts, messageTemplate: rule.messageTemplate }, now: selection.at });
  const rehearsal = engine.runRehearsal(source.id, { now: selection.at });
  const work = engine.getWork(source.id);
  if (!rehearsal.passed || !rehearsal.externalWritesBlocked || !rehearsal.nothingLive) throw new Error("The exact follow-up alternative did not pass its isolated rehearsal.");
  return { state: engine.snapshot(), work, receipt: result.receipt, rehearsal, liveHash: inquiryDefinitionHash(live), sourceHash: sha256(canonicalJson(source)), draftHash: inquiryDefinitionHash(work.draft!) };
}

export function followUpTryView(selection: unknown, draft: unknown, rehearsal: unknown): { afterMinutes: number; maxAttempts: number; messageTemplate: string; checks: RehearsalRun["checks"]; outboundMessages: string[] } | null {
  const parsed = askInquiryFollowUpSelectionSchema.safeParse(selection);
  if (!parsed.success || !draft || !rehearsal || typeof draft !== "object" || typeof rehearsal !== "object") return null;
  const definition = draft as InquiryCapabilityDefinition;
  const run = rehearsal as RehearsalRun;
  try {
    if (inquiryDefinitionHash(definition) !== parsed.data.draftHash || definition.version !== parsed.data.version || definition.businessId !== parsed.data.workspaceId || definition.id !== parsed.data.capabilityId || !definition.followUp
      || run.definitionVersion !== definition.version || run.requestId !== parsed.data.requestId || run.businessId !== definition.businessId || !run.passed || !run.externalWritesBlocked || !run.nothingLive
      || !Array.isArray(run.checks) || run.checks.length !== REHEARSAL_CHECK_IDS.length || !REHEARSAL_CHECK_IDS.every(id => run.checks.some(check => check.id === id)) || !run.checks.every(check => check.status === "passed") || !Array.isArray(run.outboundMessages) || definition.followUp.afterMinutes !== parsed.data.rule.afterMinutes || definition.followUp.maxAttempts !== parsed.data.rule.maxAttempts || definition.followUp.messageTemplate !== parsed.data.rule.messageTemplate) return null;
    return { afterMinutes: definition.followUp.afterMinutes, maxAttempts: definition.followUp.maxAttempts, messageTemplate: definition.followUp.messageTemplate, checks: run.checks, outboundMessages: run.outboundMessages.map(message => typeof message === "string" ? message : JSON.stringify(message)) };
  } catch { return null; }
}

/** Called only inside the approved MakeReal inquiry effect; it never sends a message. */
export async function approveAskInquiryFollowUp(actor: WorkspaceActor, raw: unknown, deps: {
  mayBeOn?: () => boolean; enabled?: (workspaceId: string) => Promise<boolean>;
  authorize: (selection: AskInquiryFollowUpSelection) => Promise<void>; repository: InquiryRepository;
  save: (input: Parameters<InquiryRepository["compareAndSwap"]>[0]) => ReturnType<InquiryRepository["compareAndSwap"]>;
}) {
  if (!(deps.mayBeOn ?? inquiryReleaseMayBeOn)()) throw new Error("Inquiry follow-up alternatives are not enabled.");
  const selection = askInquiryFollowUpSelectionSchema.parse(raw);
  if (!await (deps.enabled ?? (workspaceId => inquiryReleaseEnabledForWorkspace(workspaceId, { userId: actor.userId, operator: false, tester: false })))(selection.workspaceId)) throw new Error("Inquiry follow-up alternatives are not enabled for this business.");
  await deps.authorize(selection);
  const snapshot = await deps.repository.getSnapshot(selection.tenantId, selection.workspaceId);
  if (!snapshot || snapshot.tenantStableId !== selection.tenantStableId) throw new Error("The inquiry tenant baseline changed.");
  const currentWork = snapshot.state.requests.find(item => item.id === selection.requestId);
  const acceptedChange = snapshot.state.changes.find(change => change.id === selection.changeId);
  if (currentWork?.state === "handled" && currentWork.activeChangeId === selection.changeId && currentWork.draft && inquiryDefinitionHash(currentWork.draft) === selection.draftHash && acceptedChange?.providerAcceptanceId) return;
  const live = snapshot.state.capabilities.find(item => item.id === selection.capabilityId)?.live;
  if (!live || inquiryDefinitionHash(live) !== selection.liveHash) throw new Error("The live inquiry rule changed. Review a new alternative.");
  // A lost queue response can resume the identical approved configuration, never reconstruct a second edit.
  if (currentWork?.draft && currentWork.activeChangeId === selection.changeId && inquiryDefinitionHash(currentWork.draft) === selection.draftHash && currentWork.publishApproval?.version === selection.version && currentWork.publishApproval.actorId === actor.userId) return;
  if (!currentWork || sha256(canonicalJson(currentWork)) !== selection.sourceHash) throw new Error("The source inquiry work changed. Review a new alternative.");
  const prepared = composeAskInquiryFollowUp(snapshot, { capabilityId: selection.capabilityId, rule: selection.rule, actorId: actor.userId, seed: selection.seed, at: selection.at });
  if (prepared.draftHash !== selection.draftHash || prepared.work.activeChangeId !== selection.changeId || prepared.work.draft?.version !== selection.version) throw new Error("The follow-up candidate changed.");
  const engine = new InquiryEngine({ businessId: selection.workspaceId, state: prepared.state });
  engine.approvePublish(selection.requestId, { actorId: actor.userId, version: selection.version });
  const saved = await deps.save({ tenantId: selection.tenantId, businessId: selection.workspaceId, expectedRevision: snapshot.revision, state: engine.snapshot(), actorId: actor.userId });
  if (!saved.changed) throw new Error("The inquiry workspace changed before approval was saved.");
}
