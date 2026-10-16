/**
 * Words and groupings for the XA agency screens (XA-6: AG1 Today, AG2 Queue,
 * AG3 inside one client, AG6 Minutes). Pure functions over the agency's own
 * reads (`agency-clients.ts`, care-report time entries); no data lives here.
 */
import type { AgencyClientRow, AgencyClientSystem, AgencyQueueItem } from "../../agency-clients";
import { agencyQueueOrder } from "../../agency-clients";
import type { AgencyTimeList } from "@/platform/care-reports/contracts";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** "Three", or "12" past ten. Capitalised for the start of a sentence. */
export function countWord(count: number, start = true): string {
  const word = count >= 0 && count <= 10 ? WORDS[count]! : String(count);
  return start ? word : word.toLowerCase();
}

/** "Harbor Dental", "Harbor Dental and Fieldwork", "A, B and C". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const ROLE_ADDRESSES = new Set(["ops", "info", "admin", "hello", "team", "support", "office", "contact", "mail", "billing", "sales", "help", "studio", "agency", "owner", "me", "hi"]);

/** A first name from a sign-in address when it reads like one ("maya.okafor@…" → "Maya"). */
export function firstNameFromEmail(email: string | null | undefined): string | null {
  const local = (email ?? "").split("@")[0] ?? "";
  const first = local.split(/[._+-]/)[0] ?? "";
  if (!/^[a-z]{2,20}$/i.test(first) || ROLE_ADDRESSES.has(first.toLowerCase())) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/* ---------- Queue ---------- */

/** Items an owner has to act on. Everything else is the agency's to do. */
const OWNER_KINDS = new Set<AgencyQueueItem["kind"]>(["needs_you", "owner_email", "owner_claim"]);

export function waitsOnOwner(item: AgencyQueueItem): boolean {
  return OWNER_KINDS.has(item.kind);
}

/** Broken first, then requests, then the rest; oldest first inside each kind. */
const YOU_ORDER: AgencyQueueItem["kind"][] = ["health", "owner_unreachable", "request", "client_site", "improvement", "operator"];

export function splitQueue(items: readonly AgencyQueueItem[]): { you: AgencyQueueItem[]; owners: AgencyQueueItem[] } {
  const you = YOU_ORDER.flatMap(kind => agencyQueueOrder(items.filter(item => item.kind === kind)));
  const owners = agencyQueueOrder(items.filter(waitsOnOwner));
  return { you, owners };
}

/** Connections a broken System is most often waiting on, longest name first. */
const CONNECTION_NAMES = ["Google Business Profile", "Google Calendar", "Microsoft Outlook", "Outlook Calendar", "QuickBooks", "Mailchimp", "Calendly", "Square", "Stripe", "Google", "Outlook"];

/** The one action a Queue row offers, named for what clicking does. */
export function queueActionLabel(item: AgencyQueueItem): string {
  switch (item.kind) {
    case "health": {
      const text = `${item.title} ${item.label ?? ""}`;
      const connection = CONNECTION_NAMES.find(name => text.includes(name));
      return connection ? `Reconnect ${connection}` : "Open the System";
    }
    case "owner_unreachable": return "Update contact";
    case "improvement": return "Review";
    case "request": return "Open request";
    case "client_site": return "Open site work";
    default: return "Open";
  }
}

/** "North Coast Realty · since 6:14 am", "Lakeview Mediation · request · 3 days". */
export function queueDetail(item: AgencyQueueItem, now = Date.now()): string {
  const since = sinceLabel(item.since, now);
  if (waitsOnOwner(item)) {
    const who = item.kind === "owner_claim" ? `Waiting on ${item.clientName} to claim` : `Waiting on ${item.clientName}`;
    const reach = item.ownerReachable === false ? " · owner not reachable" : "";
    return `${who} · sent ${since}${reach}`;
  }
  const kind = item.label ?? QUEUE_KIND[item.kind];
  return [item.clientName, kind, `since ${since}`].filter(Boolean).join(" · ");
}

const QUEUE_KIND: Partial<Record<AgencyQueueItem["kind"], string>> = {
  request: "request",
  improvement: "from your Library",
  health: "",
  client_site: "site work",
  operator: "platform support",
  owner_unreachable: "owner not reachable",
};

/** "6:14 am": the one clock format every agency screen uses. */
export function clockLabel(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace("AM", "am").replace("PM", "pm");
}

/** "Dec 31, 7:00 pm". */
export function dayAndClockLabel(at: string | Date): string {
  const date = new Date(at);
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${clockLabel(date)}`;
}

/** "6:14 am" today, "yesterday 4:05 pm", "Mon 10:42 am" this week, else "Oct 3". */
export function sinceLabel(at: string, now = Date.now()): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "a while ago";
  const today = new Date(now);
  const time = clockLabel(date);
  const days = Math.floor((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `yesterday ${time}`;
  if (days < 7) return `${date.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Three things wait on you." + "Two more wait on owners." Never the same sentence twice. */
export function queueHeadline(you: number, owners: number): { line: string; quiet: string | null } {
  const line = you === 0 ? "Nothing waits on you." : you === 1 ? "One thing waits on you." : `${countWord(you)} things wait on you.`;
  const quiet = owners === 0 ? null : you === 0 ? `${countWord(owners)} ${owners === 1 ? "waits" : "wait"} on owners.` : `${countWord(owners)} more ${owners === 1 ? "waits" : "wait"} on owners.`;
  return { line, quiet };
}

/* ---------- Clients ---------- */

export type ClientStanding = "needs-you" | "owner" | "broken" | "quiet" | "unread";

const PROBLEM = new Set(["blocked", "degraded"]);

export function problemSystems(client: Pick<AgencyClientRow, "systems">): AgencyClientSystem[] {
  return client.systems.filter(system => system.health && PROBLEM.has(system.health.status));
}

/** Where one client stands for the agency right now, with the line its row shows. */
export function clientStanding(client: AgencyClientRow, queue: readonly AgencyQueueItem[]): { standing: ClientStanding; line: string } {
  if (client.status === "unavailable") return { standing: "unread", line: "Could not be read just now" };
  const mine = queue.filter(item => item.workspaceId === client.workspaceId);
  // An improvement to offer is the agency's, but it never outranks a broken System or an owner's open decision.
  const { you } = splitQueue(mine);
  const yours = you.find(item => item.kind !== "improvement");
  if (yours) return { standing: "needs-you", line: `Needs you · ${lowerFirst(yours.title)}` };
  const broken = problemSystems(client)[0];
  if (broken) return { standing: "broken", line: `${broken.name} · ${broken.health!.summary || "not working"}` };
  if (client.ownerClaimWaiting) return { standing: "owner", line: `Waiting on ${client.name} to claim` };
  const owner = mine.find(waitsOnOwner);
  if (owner) return { standing: "owner", line: `Waiting on ${client.name} · ${lowerFirst(owner.title)}` };
  if (client.needsYou.count) return { standing: "owner", line: `Waiting on ${client.name} · ${client.needsYou.count} ${client.needsYou.count === 1 ? "decision" : "decisions"}` };
  const offer = you[0];
  if (offer) return { standing: "needs-you", line: `Ready to offer · ${lowerFirst(offer.title)}` };
  if (client.openRequests) return { standing: "needs-you", line: `${client.openRequests} open ${client.openRequests === 1 ? "request" : "requests"}` };
  return { standing: "quiet", line: "Quiet" };
}

/** Titles are written as sentences by whoever made them; a name at the start keeps its capital. */
function lowerFirst(text: string): string {
  return text;
}

/** AG1's one paragraph: who needs the agency, who waits on owners, who is quiet. */
export function todaySentence(clients: readonly AgencyClientRow[], queue: readonly AgencyQueueItem[]): string {
  if (!clients.length) return "No clients yet. Add one and Strelva reads its website first.";
  const groups: Record<ClientStanding, string[]> = { "needs-you": [], owner: [], broken: [], quiet: [], unread: [] };
  for (const client of clients) groups[clientStanding(client, queue).standing].push(client.name);
  const parts: string[] = [];
  const you = [...groups["needs-you"], ...groups.broken];
  if (you.length) parts.push(`${short(you)} ${you.length === 1 ? "needs" : "need"} you.`);
  if (groups.owner.length) parts.push(`${short(groups.owner)} ${groups.owner.length === 1 ? "waits on its owner" : "wait on their owners"}.`);
  if (groups.quiet.length) parts.push(you.length || groups.owner.length ? `${short(groups.quiet)} ${groups.quiet.length === 1 ? "is" : "are"} quiet.` : "Every client is quiet.");
  if (groups.unread.length) parts.push(`${short(groups.unread)} could not be read just now.`);
  return parts.join(" ");
}

function short(names: readonly string[]): string {
  return names.length > 3 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : listNames(names);
}

/* ---------- Minutes ---------- */

export interface ClientMinutes {
  workspaceId: string;
  name: string;
  minutes: number;
  /** Notes as written, newest first, without repeats. */
  notes: string[];
  people: string[];
  /** Who logged the time, most minutes first. */
  byPerson: { name: string; minutes: number }[];
}

/** "Logged by Maya 60 · Jonah 36 min". */
export function peopleMinutesLine(row: Pick<ClientMinutes, "byPerson">): string {
  return row.byPerson.length ? `Logged by ${row.byPerson.map(person => `${person.name} ${person.minutes}`).join(" · ")} min` : "";
}

/** Notes keep their own capitals, so they are joined with a middle dot, never mid-sentence. */
export function notesLine(notes: readonly string[], limit = 3): string {
  return notes.slice(0, limit).join(" · ");
}

/** One client's live entries this month, as AG6 reads them. Voided entries never count. */
export function clientMinutes(workspaceId: string, name: string, entries: AgencyTimeList): ClientMinutes {
  const live = entries.filter(entry => !entry.voided).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const notes = [...new Set(live.map(entry => entry.note?.trim()).filter((note): note is string => Boolean(note)))];
  const who = (email: string) => firstNameFromEmail(email) ?? email.split("@")[0] ?? "";
  const people = [...new Set(live.map(entry => who(entry.recordedBy)).filter(Boolean))];
  const totals = new Map<string, number>();
  for (const entry of live) { const name = who(entry.recordedBy); if (name) totals.set(name, (totals.get(name) ?? 0) + entry.minutes); }
  const byPerson = [...totals].map(([person, minutes]) => ({ name: person, minutes })).sort((a, b) => b.minutes - a.minutes);
  return { workspaceId, name, minutes: live.reduce((sum, entry) => sum + entry.minutes, 0), notes, people, byPerson };
}

/** "231 minutes across 4 clients." + "October 1 to 14, by Maya and Jonah." */
export function minutesHeadline(rows: readonly ClientMinutes[], now = new Date()): { line: string; quiet: string } {
  const counted = rows.filter(row => row.minutes > 0);
  const total = counted.reduce((sum, row) => sum + row.minutes, 0);
  const month = now.toLocaleDateString("en-US", { month: "long" });
  const range = now.getDate() === 1 ? `${month} 1` : `${month} 1 to ${now.getDate()}`;
  const people = [...new Set(counted.flatMap(row => row.people))];
  if (!total) return { line: "No minutes logged this month.", quiet: `${range}. Time appears here when someone logs it on a client.` };
  return {
    line: `${total.toLocaleString("en-US")} ${total === 1 ? "minute" : "minutes"} across ${counted.length} ${counted.length === 1 ? "client" : "clients"}.`,
    quiet: people.length ? `${range}, by ${listNames(people.slice(0, 4))}${people.length > 4 ? " and others" : ""}.` : `${range}.`,
  };
}
