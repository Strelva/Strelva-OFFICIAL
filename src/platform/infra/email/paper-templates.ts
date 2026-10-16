import { actorPresentation, type RecordedActor } from "@/platform/presentation/actor";
import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";
import type { PaperAction, PaperBlock, PaperEmail } from "./paper";

export interface EmailIdentity { sender: string; senderDetail: string }
export interface DecisionMailItem {
  category: string; title: string; detail: string;
  /** All links open a review page. Existing issuance owns authority. */
  approve?: PaperAction; notYet?: PaperAction; open: PaperAction;
}
const p = (text: string, muted = false): PaperBlock => ({ kind: "paragraph", text, muted });
const a = (actions: readonly PaperAction[], full = true): PaperBlock => ({ kind: "actions", actions, full });

export function urgentNeedsYouEmail(input: EmailIdentity & {
  actor?: RecordedActor | null;
  subject: string; person: string; source: string; inquiry: string; draft: string;
  send: PaperAction; notYet: PaperAction; change: PaperAction; policyNote: string; white?: boolean;
}): PaperEmail {
  const actor = actorPresentation(input.actor);
  return { ...input, footer: [input.policyNote, actor.credit].filter(Boolean).join(" · "), blocks: [
    { kind: "label", text: `${input.person} · ${input.source}` }, p(input.inquiry),
    { kind: "draft", label: actor.name ? `Your reply, drafted by ${actor.name}` : "Your reply · Actor not recorded", text: input.draft },
    a([{ ...input.send, style: "primary" }]), a([{ ...input.notYet, style: "soft" }, { ...input.change, style: "soft" }]),
    p("Each button opens a page where you confirm. Nothing sends from this email alone.", true),
  ] };
}

export function morningNeedsYouEmail(input: EmailIdentity & { subject: string; items: readonly DecisionMailItem[]; handled: string; receipts?: readonly { actor: RecordedActor | null; action: string }[]; white?: boolean }): PaperEmail {
  return { ...input, footer: "One email at 7:00 in your business’s timezone, only when something waits on you. Urgent items come right away.", blocks: [
    ...input.items.map((item): PaperBlock => ({ kind: "decision", category: item.category, title: item.title, detail: item.detail,
      actions: [...(item.approve ? [{ ...item.approve, style: "primary" as const }] : []), ...(item.notYet ? [{ ...item.notYet, style: "text" as const }] : []), { ...item.open, style: "text" }] })),
    { kind: "label", text: `${STRELVA_HANDLED_LABEL} yesterday` },
    // One line per receipt: email HTML collapses a newline inside a paragraph.
    ...(input.receipts ? input.receipts.map(receipt => {
      const actor = actorPresentation(receipt.actor);
      return p(`${actor.name ?? "Actor not recorded"} · ${receipt.action}${actor.credit ? ` · ${actor.credit}` : ""}`, true);
    }) : [p(input.handled, true)]),
  ] };
}

/**
 * A new inquiry with nothing to decide (XA · E1 voice): who wrote and how,
 * their words, then one sentence naming whoever already acted, and one
 * button. No boxed receipt.
 */
export function newInquiryEmail(input: EmailIdentity & { person: string; source: string; inquiry: string; recordedOutcome: string; policyNote: string; open: PaperAction }): PaperEmail {
  return { ...input, subject: `New inquiry from ${input.person}`, preheader: input.recordedOutcome, footer: `${input.policyNote} You get one of these per inquiry. Change this in Who decides.`, blocks: [
    { kind: "label", text: `${input.person} · ${input.source}` }, p(`“${input.inquiry}”`),
    { kind: "rule" }, p(input.recordedOutcome), a([{ ...input.open, style: "primary" }], false),
  ] };
}

export function weeklyRecapEmail(input: EmailIdentity & { subject: string; metrics: Extract<PaperBlock, { kind: "metrics" }>["rows"]; sourceNote: string; possibility?: Extract<PaperBlock, { kind: "possibility" }> }): PaperEmail {
  return { ...input, footer: input.sourceNote, blocks: [{ kind: "metrics", rows: input.metrics }, ...(input.possibility ? [input.possibility] : [])] };
}

export function ownerInvitationPaperEmail(input: EmailIdentity & { business: string; greeting: string; systems: Extract<PaperBlock, { kind: "rows" }>["rows"]; accept: PaperAction; expires: string; invitedBy: string }): PaperEmail {
  return { ...input, subject: `Your workspace for ${input.business} is ready`, footer: `Invited by ${input.invitedBy}. Not expecting this? Ignore it and nothing changes.`, blocks: [
    p(input.greeting), { kind: "rows", rows: input.systems }, a([{ ...input.accept, style: "primary" }]),
    p(`Accept this invitation with the email address it was sent to. You’ll be asked to sign in. This invitation expires ${input.expires}. You can also answer decision emails without opening the workspace.`, true),
  ] };
}

export function cardDeclinedPaperEmail(input: EmailIdentity & { payer: string; chargeDescription: string; knownSchedule: Extract<PaperBlock, { kind: "rows" }>["rows"]; update: PaperAction; serviceNote: string }): PaperEmail {
  return { ...input, subject: `The card for ${input.payer} was declined`, footer: "Questions about this charge: reply to this email.", blocks: [
    p(input.chargeDescription), ...(input.knownSchedule.length ? [{ kind: "rows" as const, rows: input.knownSchedule }] : []),
    a([{ ...input.update, style: "primary" }]), p(input.serviceNote, true),
  ] };
}

export function exportReadyPaperEmail(input: EmailIdentity & { business: string; filename: string; fileDetail: string; included: string; omitted: string; unavailable?: string; download: PaperAction; linkNote: string; requestedBy: string }): PaperEmail {
  return { ...input, subject: `Your export of ${input.business} is ready`, footer: `${input.requestedBy} Exporting doesn’t change or cancel anything.`, blocks: [
    { kind: "file", name: input.filename, detail: input.fileDetail }, { kind: "label", text: "Included" }, p(input.included),
    { kind: "label", text: "Left out, and why" }, p(input.omitted, true),
    ...(input.unavailable ? [{ kind: "label" as const, text: "Unavailable" }, p(input.unavailable, true)] : []),
    a([{ ...input.download, style: "primary" }]), p(input.linkNote, true),
  ] };
}

export function bookingVisitorPaperEmail(input: EmailIdentity & { subject: string; details: string; note: string; manage: PaperAction; footer: string }): PaperEmail {
  return { ...input, clientBranded: true, blocks: [p(input.details), p(input.note, true), a([{ ...input.manage, style: "date" }])] };
}

export function offeredDatesPaperEmail(input: EmailIdentity & { subject: string; greeting: string; dates: readonly { label: string; reviewUrl: string }[]; footer: string }): PaperEmail {
  if (input.dates.length < 1 || input.dates.length > 3) throw new Error("An offer must contain one to three dates");
  return { ...input, clientBranded: true, blocks: [p(input.greeting),
    ...input.dates.map(date => a([{ label: date.label, url: date.reviewUrl, style: "date" }])),
    p("None work? Reply with what does.", true),
  ] };
}
