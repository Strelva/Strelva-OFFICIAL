import type { InquirySurfaceAction } from "./surface-contracts";
import type { InquiryRepository } from "./repository";
import { resolveInquiryPattern, resolveInquiryPatternVersion } from "./portfolio";
import { InquiryEngine } from "./inquiry-engine";
import type { InquiryWork } from "./contracts";
import {
  getPatternInstallation,
  proposePatternUpdate,
  resolvePatternUpdate,
  stagePatternUpdate,
} from "./inquiry-pattern-updates";
import type { PatternUpdateProposal } from "./inquiry-pattern-updates";

type PatternUpdateAction = Extract<InquirySurfaceAction, { kind: "propose-pattern-update" | "stage-pattern-update" }>;
type PatternCopyAction = Extract<InquirySurfaceAction, { kind: "use-pattern" }>;

export interface PatternUpdateSurfaceResult {
  proposal: PatternUpdateProposal;
  work?: ReturnType<InquiryEngine["getWork"]>;
  change?: ReturnType<InquiryEngine["_change"]>;
  message: string;
}

export async function executePatternCopyAction(input: {
  engine: InquiryEngine;
  action: PatternCopyAction;
  actorId: string;
  businessId: string;
  businessName: string;
  repository?: InquiryRepository;
}): Promise<{ work: InquiryWork; message: string }> {
  const { engine, action, actorId } = input;
  const local = engine._state().capabilities.find((item) => item.id === action.patternId && item.status === "live" && item.live);
  const source = local ? null : await resolveInquiryPattern(action.patternId, input.repository);
  if (!local && !source) throw new Error("This pattern changed or is no longer available to your account. Refresh the list.");
  const crossBusiness = source && source.definition.businessId !== input.businessId;
  let work = engine.copyPattern(source?.definition.id ?? action.patternId, {
    sourceCapabilityId: source?.definition.id ?? action.patternId,
    ...(crossBusiness ? { sourceDefinition: source.definition, sourceBusinessId: source.definition.businessId } : {}),
    targetBusinessId: input.businessId,
    targetActorId: actorId,
    destination: action.destination ?? "your team",
    emailConnection: { status: "missing", consent: "missing", lastCheckedAt: null },
  });
  if (source && source.sourceBusinessName !== input.businessName && work.draft) {
    const brand = (value: string) => value.split(source.sourceBusinessName).join(input.businessName);
    const fields = [
      { path: "form.title", value: work.draft.form.title },
      { path: "form.intro", value: work.draft.form.intro },
      ...(work.draft.followUp ? [{ path: "followUp.messageTemplate", value: work.draft.followUp.messageTemplate }] : []),
    ];
    const edits = fields.filter((field) => brand(field.value) !== field.value).map((field) => ({ actorId, source: "words" as const, path: field.path, after: brand(field.value) }));
    if (edits.length) work = engine.applyDraftEdits(work.id, edits).work;
  }
  ensurePatternResponsibility(engine, work, actorId);
  return {
    work,
    message: "Pattern copied as a draft. Review this business's wording and staff destination, connect its own accounts, and rehearse before making it live.",
  };
}

export function ensurePatternResponsibility(engine: InquiryEngine, work: InquiryWork, actorId: string): void {
  if (engine._state().responsibilities.some((policy) => policy.capabilityId === work.capabilityId)) return;
  engine.createResponsibility({
    actorId,
    capabilityId: work.capabilityId,
    title: "Handle inquiry follow-up",
    scope: "Route inquiry requests to the recorded destination and prepare one follow-up when nobody replies.",
    allowedActions: ["reply", "send_message", "schedule_follow_up", "charge", "delete", "change_permissions"],
    never: [
      { action: "charge", sentence: "Never charge a customer." },
      { action: "delete", sentence: "Never delete an inquiry." },
      { action: "change_permissions", sentence: "Never change anyone's access." },
    ],
    approval: [
      { action: "reply", sentence: "Ask before confirming receipt to a customer." },
      { action: "send_message", sentence: "Ask before sending a message." },
    ],
    escalation: { primary: "Business owner", secondary: null },
    budget: { dailyMessages: 10, timezone: "UTC" },
    hours: { timezone: "UTC", days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" },
  });
}

/** Execute the target-side, source-authorized pattern update commands. */
export async function executePatternUpdateAction(input: {
  engine: InquiryEngine;
  action: PatternUpdateAction;
  actorId: string;
  repository?: InquiryRepository;
}): Promise<PatternUpdateSurfaceResult> {
  const { engine, action, actorId } = input;
  const installation = getPatternInstallation(engine, action.installationId);
  if (installation.capabilityId !== action.capabilityId) throw new Error("That pattern installation does not belong to this capability.");
  const source = await resolveInquiryPatternVersion({
    sourceBusinessId: installation.sourceBusinessId,
    sourceCapabilityId: installation.sourceCapabilityId,
  }, input.repository);
  if (!source) throw new Error("The source pattern is unavailable or your access has changed. Refresh before trying again.");
  if (action.kind === "stage-pattern-update" && source.definition.version !== action.sourceVersion) {
    throw new Error(`The source pattern changed to version ${source.definition.version}. Check for updates again before staging it.`);
  }
  const proposal = proposePatternUpdate(engine, {
    capabilityId: action.capabilityId,
    sourceDefinition: source.definition,
    sourceVersion: source.definition.version,
  });
  if (action.kind === "propose-pattern-update") {
    return {
      proposal,
      message: proposal.status === "up_to_date"
        ? `This installation already uses source version ${proposal.sourceVersion}.`
        : proposal.conflicts.length > 0
          ? `Source version ${proposal.sourceVersion} is available. Choose what to keep for ${proposal.conflicts.length} overlapping edit${proposal.conflicts.length === 1 ? "" : "s"}.`
          : `Source version ${proposal.sourceVersion} is ready to stage. Review the changes before rehearsing them.`,
    };
  }
  const resolution = resolvePatternUpdate(proposal, action.resolutions, engine._now());
  const staged = stagePatternUpdate(engine, { proposal, resolution, actorId });
  return {
    proposal,
    work: staged.work,
    change: staged.change,
    message: "The pattern update is staged as inquiry work. Review the receipt, run a fresh rehearsal, and make it live only after the exact version passes.",
  };
}
