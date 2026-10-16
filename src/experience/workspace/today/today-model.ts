/**
 * XA-3 · Owner Today, the yes and after (October 15, 2026).
 *
 * Pure words and states for Today (O1, O2), the prepared change (O3), right
 * after the yes (O4), Requests (O5) and Running (O6). Everything here is
 * derived from records the server already returns: owner decisions, their
 * receipts, Systems health and responsibility proof. Nothing adds a fact
 * those records do not carry.
 */
import { XA_YES_LABELS } from "@/platform/presentation/place-labels";
import { actorCopy, actorPresentation } from "@/platform/presentation/actor";
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import type { XaYesState } from "@/components/ui/strelva/Xa";
import type { SystemView } from "@/experience/systems/model";
import type { ItemNotice } from "../useNeedsYou";
import { decisionPresentation } from "../needs-you-presentation";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** "Seven" up to ten, then digits. Lower case when it is not the first word. */
export function countWord(count: number, lower = false): string {
  const word = count < WORDS.length ? WORDS[count]! : count.toLocaleString("en-US");
  return lower ? word.toLowerCase() : word;
}

/** "Good morning, Dr. Lin." The name only when one is recorded; never the email. */
export function todayGreeting(minute: number | null, name?: string | null): string {
  const who = name?.trim() ? `, ${name.trim()}` : "";
  if (minute === null) return `Welcome back${who}.`;
  const hour = new Date(minute * 60_000).getHours();
  return `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${who}.`;
}

/** "7:02", "4:12 pm": mornings bare, afternoons marked, the way the board writes times. */
export function clockTime(value: string | number | Date): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  const text = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return text.replace(/\s?am$/, "").replace(/\s?pm$/, " pm");
}

/** "Oct 12", for anything older than today. */
export function shortDay(value: string | number | Date): string {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** When a time belongs to an earlier day, say which: "yesterday 4:12 pm", "Oct 12". */
export function relativeWhen(value: string, now: number): string {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return "";
  const day = (time: number) => new Date(time).toDateString();
  if (day(at) === day(now)) return clockTime(at);
  if (day(at) === day(now - 86_400_000)) return `yesterday ${clockTime(at)}`;
  return shortDay(at);
}

/** Who prepared or did something, by the recorded name. Unknown stays unnamed. */
export function actedBy(actor: unknown): string | null {
  return actorPresentation(actor).name;
}

/** The latest Systems check, and whether any System needs a look. */
export function systemsCheck(systems: readonly SystemView[]): { checkedAt: string | null; down: SystemView[] } {
  const down = systems.filter(system => system.health.state === "blocked" || system.health.state === "degraded");
  const times = systems.map(system => system.health.lastVerifiedAt).filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)));
  const checkedAt = times.length ? times.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest)) : null;
  return { checkedAt, down };
}

export interface TodayLedeInput {
  waiting: number;
  /** False for a member or agency person who can see but not decide. */
  canDecide: boolean;
  systems: readonly SystemView[];
  /** The decisions read failed or was incomplete. */
  unchecked: boolean;
  /** False when this business has no decisions read at all (Needs you off): claim nothing about them. */
  decisionsKnown?: boolean;
}

/** One plain sentence under the greeting. Exceptions first; never "all good" without a check. */
export function todayLede({ waiting, canDecide, systems, unchecked, decisionsKnown = true }: TodayLedeInput): string {
  const { checkedAt, down } = systemsCheck(systems);
  const rest = down.length
    ? `${down.length === 1 ? down[0]!.name : `${countWord(down.length)} Systems`} ${down.length === 1 ? "needs" : "need"} a look. Strelva is on it.`
    : checkedAt ? `${waiting ? "The rest" : "Everything"} passed ${waiting ? "their" : "its"} checks at ${clockTime(checkedAt)}.` : "";
  if (!decisionsKnown) return rest || "Ask Strelva for what your business needs.";
  // Pebble says the failed check beside the composer; the lede keeps to what is known.
  if (unchecked) return down.length ? rest : checkedAt ? `Your Systems passed their checks at ${clockTime(checkedAt)}.` : "Your Systems are below.";
  if (!waiting) return [down.length ? "" : "Nothing needs you.", rest].filter(Boolean).join(" ");
  const who = canDecide ? "you" : "the owner";
  const head = waiting === 1 ? `One thing waits for ${who}.` : `${countWord(waiting)} things wait for ${who}.`;
  return [head, rest].filter(Boolean).join(" ");
}

/**
 * The latest recorded changes, oldest first, each naming whoever acted. A time
 * for today, a day for earlier ones. Without a clock (server render) every
 * line shows its day, so nothing claims "since yesterday" it cannot know.
 */
export function sinceLines(handled: readonly Pick<HandledReceipt, "at" | "sentence">[], now: number | null, limit = 4): { time: string; dateTime: string; text: string; recent: boolean }[] {
  return handled
    .filter(receipt => Number.isFinite(Date.parse(receipt.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-limit)
    .map(receipt => {
      const at = Date.parse(receipt.at);
      const recent = now !== null && at <= now && now - at < 36 * 3_600_000;
      const sameDay = now !== null && new Date(at).toDateString() === new Date(now).toDateString();
      return { time: sameDay || recent ? clockTime(at) : shortDay(at), dateTime: receipt.at, text: receipt.sentence.trim().replace(/([^.!?])$/, "$1."), recent };
    });
}

/** "Since yesterday" only when every line is from the last day and a half. */
export function sinceLabel(lines: readonly { recent: boolean }[]): string {
  return lines.length && lines.every(line => line.recent) ? "Since yesterday" : "Lately";
}

/** Not working first, then off, then live; the order the sidebar and phone rows share. */
export function ownerSystemRank(system: Pick<SystemView, "health" | "lifecycle">): number {
  return system.health.state === "blocked" || system.health.state === "degraded" ? 0 : system.lifecycle !== "live" ? 1 : 2;
}

/** The yes label: the consequence, in the board's words (XA_YES_LABELS). */
export function yesLabel(item: OwnerDecision): string {
  const verb = decisionPresentation(item).verb;
  if (verb === "Hold to make it live") return XA_YES_LABELS.yes;
  if (verb === "Hold to confirm") return "Confirm it";
  if (verb === "Send") return "Send it";
  return verb;
}

/** What the yes does, as the quiet half of the headline. Never a repeat of the title. */
export function yesConsequence(item: OwnerDecision): string {
  const label = yesLabel(item);
  if (label === XA_YES_LABELS.yes) return "Your yes puts it live.";
  if (label === "Send it") return "Your yes sends it.";
  if (label === "Confirm it") return "Your yes confirms it.";
  if (label === "Approve this preview") return "Your yes approves the preview. Nothing goes live yet.";
  if (label === "Acknowledge") return "Nothing changes when you acknowledge it.";
  return "It waits for your yes.";
}

/** "Waits for you · from North Studio". */
export function waitingKicker(item: OwnerDecision, canDecide: boolean): string {
  const from = actedBy(item.actor);
  return [`Waits for ${canDecide ? "you" : "the owner"}`, from ? `from ${from}` : null].filter(Boolean).join(" · ");
}

/** The plain answers beside the decision: what each choice does, in the decision's own words. */
export function decisionAnswers(item: OwnerDecision): [string, string][] {
  const rows: [string, string][] = [
    ["If you say yes", actorCopy(item.approveEffect, item.actor)],
    ["If not yet", actorCopy(item.notYetEffect, item.actor)],
  ];
  if (item.operatorNote) rows.push([actorPresentation(item.noteActor?.kind === "operator" ? item.noteActor : { kind: "operator" }).name ?? "Support", item.operatorNote]);
  return rows;
}

/** The receipt Strelva records for a decided item. */
export function decisionReceipt(handled: readonly HandledReceipt[], itemId: string): HandledReceipt | undefined {
  return handled.find(receipt => receipt.id === `decision:${itemId}`);
}

export interface YesPhaseInput {
  itemId: string;
  /** The item is still open in the latest read. */
  open: boolean;
  pending: string | null;
  notice?: ItemNotice;
  receipt?: HandledReceipt;
  /** The owner pressed the yes in this session (Not yet never reaches Live). */
  saidYes: boolean;
  /** The Undo window ran out. */
  expired: boolean;
}

/** The one yes, as XaYes reads it, from the decision's real server state. */
export function yesPhase({ itemId, open, pending, notice, receipt, saidYes, expired }: YesPhaseInput): XaYesState {
  if (pending === itemId) return "going";
  if (receipt?.undo.state === "undone") return "undone";
  if (notice?.tone === "error" && saidYes) return "failed";
  if (saidYes && (receipt || (notice && notice.tone !== "error") || !open)) return expired ? "expired" : "live";
  return "waiting";
}

/** The Working trail after a yes: only steps the records prove. */
export function yesSteps(receipt: HandledReceipt | undefined, phase: XaYesState): { id: string; label: string; state: "done" | "active" | "failed" }[] {
  if (phase === "going") return [{ id: "yes", label: "Recording your yes", state: "active" }];
  if (phase === "failed") return [{ id: "yes", label: "Strelva tried it once", state: "failed" }];
  if (!receipt) return [{ id: "yes", label: "Your yes is recorded", state: "done" }, { id: "read", label: "Waiting for the receipt", state: "active" }];
  const steps: { id: string; label: string; state: "done" | "active" | "failed" }[] = [{ id: "yes", label: `Your yes is recorded at ${clockTime(receipt.at)}`, state: "done" }];
  if (receipt.evidence?.providerAccepted) steps.push({ id: "accepted", label: "Accepted where it lives", state: "done" });
  if (receipt.evidence?.readBack === "verified") steps.push({ id: "read", label: "Strelva read it back", state: "done" });
  else if (receipt.evidence?.readBack === "not_verified") steps.push({ id: "read", label: "Reading it back", state: "active" });
  return steps;
}

/** The headline after the yes: what is true now, then how Strelva knows. */
export function afterYesHeadline(item: Pick<OwnerDecision, "title" | "kind">, receipt: HandledReceipt | undefined): { headline: string; quiet: string } {
  const live = yesLabel(item as OwnerDecision) === XA_YES_LABELS.yes;
  const headline = live ? "It's live." : "Done.";
  if (!receipt) return { headline, quiet: "Strelva is recording the receipt." };
  if (receipt.evidence?.readBack === "verified") return { headline, quiet: `Strelva read it back at ${clockTime(receipt.at)}.` };
  if (receipt.evidence?.readBack === "not_verified") return { headline, quiet: "Strelva is still reading it back." };
  return { headline, quiet: receipt.sentence.trim().replace(/([^.!?])$/, "$1.") };
}
