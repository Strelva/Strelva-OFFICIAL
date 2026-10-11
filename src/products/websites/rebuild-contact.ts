import { z } from "zod";
import type { BusinessFacts } from "./rebuild-pipeline";
import { phoneKey } from "@/platform/business-record/contracts";

const email = z.string().email().max(254);

/** Only literal contact destinations. No URI parameters or inferred routing. */
export function rebuildContactLink(text: string): { label: string; href: string } | null {
  if (/^[a-z0-9._+-]+@[a-z0-9.-]+$/i.test(text) && email.safeParse(text).success) return { label: "Email us", href: `mailto:${text}` };
  if (text.length > 40 || !/^\+?[\d(][\d() .-]*\d\)?$/.test(text) || !phoneKey(text)) return null;
  if (text.includes("(") && !/^(?:\+\d{1,3}[ .-]?)?\(\d{2,4}\)[ .-]?\d[\d .-]*$/.test(text)) return null;
  const date = text.replace(/^\+/, "");
  if (/^(?:\d{4}[-. ]\d{1,2}[-. ]\d{1,2}|\d{1,2}[-. ]\d{1,2}[-. ]\d{4})$/.test(date)) return null;
  return { label: "Call us", href: `tel:${text.replace(/[^+\d]/g, "")}` };
}

/** Retain explicitly supplied details alongside the unchanged description. */
export function descriptionContactSpans(description: string): Array<{ text: string; start: number; end: number }> {
  const contacts: Array<{ text: string; start: number; end: number }> = [];
  const add = (text: string, start: number) => {
    if (rebuildContactLink(text) && !contacts.some(contact => contact.start === start)) contacts.push({ text, start, end: start + text.length });
  };
  const offered = (index: number, length: number, context?: RegExp) => {
    const parts = description.slice(Math.max(0, index - 120), index).split(/[.!?;]\s+|\n/);
    let prefix = parts.at(-1)!;
    // A literal email cue may put its destination on the next line. Retain
    // only that immediately preceding cue and its own negative/history scope.
    const previous = parts.at(-2) ?? "";
    if (context && !prefix.trim() && /\b(?:email|e-mail|mail|contact|reach|write)(?:\s+(?:us|me|our|office|at|on|team|business)){0,4}\s*:?\s*$/i.test(previous)) prefix = previous;
    const suffix = description.slice(index + length, index + length + 60);
    if (/\b(?:do not|don't|never|not|no longer|retired|former|previous|old|discontinued|obsolete)\b/i.test(prefix)) return false;
    if (/^\s*(?:is|was|has been)?\s*(?:retired|discontinued|obsolete|no longer)/i.test(suffix)) return false;
    return !context || context.test(prefix);
  };
  for (const match of description.matchAll(/[^\s<>"(),;]+@[^\s<>"(),;]+/g)) {
    // A literal cue can touch its address (Email:orders@…). Do not peel off
    // arbitrary URI schemes: javascript:/mailto: remain invalid destinations.
    const labelled = /^(?:email|e-mail|mail|contact|reach|write):(.+)$/i.exec(match[0]);
    const value = labelled?.[1] ?? match[0];
    const start = match.index! + match[0].length - value.length;
    const text = value.replace(/\.$/, "");
    if (offered(start, text.length, /\b(?:email|e-mail|mail|contact|reach|write)\b/i)) add(text, start);
  }
  // Unlabelled local numbers could be dates, prices, quantities or order IDs.
  for (const match of description.matchAll(/(?<![\w:/])(?:call|phone|telephone|tel)\b(?:\s+(?:us|me|at|on|number)){0,2}\s*:?\s*(\+?[\d(][\d(). -]*\d\)?)(?![\w@/])/gi)) {
    if (offered(match.index!, match[0].length)) add(match[1]!, match.index! + match[0].lastIndexOf(match[1]!));
  }
  for (const match of description.matchAll(/(?<!\S)(\+\d[\d(). -]*\d)(?![\w@/])/g)) {
    const prefix = description.slice(Math.max(0, match.index! - 40), match.index);
    if (/(?:order|invoice|reference|price|cost|date|event|id|sku|quantity|tracking)\s*(?:id|number|#|:)?\s*$/i.test(prefix)) continue;
    if (offered(match.index!, match[0].length, /\b(?:call|phone|telephone|tel|reach|contact)(?:\s+(?:us|me|our|office|at|on|number|team|business)){0,4}\s*:?\s*$/i)) add(match[1]!, match.index!);
  }
  return contacts;
}

export function descriptionContacts(description: string): string[] {
  const contacts = new Map<string, string>();
  for (const contact of descriptionContactSpans(description)) {
    const href = rebuildContactLink(contact.text)!.href.toLowerCase();
    if (!contacts.has(href)) contacts.set(href, contact.text);
  }
  return [...contacts.values()];
}

/** Keep original input lines separate, but join chunks within the same line. */
export function descriptionContactBindings(facts: BusinessFacts): Array<{ claimId: string; contactId: string; start: number; end: number }> {
  if (facts.sourcePages.length) return [];
  const claims = facts.claims.filter(id => id !== facts.nameFactId && facts.facts[id]?.kind === "claim" && facts.facts[id]!.sources.length === 0);
  const active = new Set(claims);
  // Facts are canonical and deduplicated; their occurrences supply context.
  // Preserve every supplied line/chunk occurrence before matching its spans.
  const lines = facts.descriptionClaimLines ?? [claims];
  let description = "";
  const ranges: Array<{ claimId:string; start:number; end:number }> = [];
  for (const line of lines) {
    const ids = line.filter(id => active.has(id));
    if (!ids.length) continue;
    if (description) description += "\n";
    for (const [index,claimId] of ids.entries()) {
      if (index) description += " ";
      const start = description.length;
      description += facts.facts[claimId]!.text;
      ranges.push({ claimId,start,end:description.length });
    }
  }
  const bindings: Array<{ claimId: string; contactId: string; start: number; end: number }> = [];
  for (const span of descriptionContactSpans(description)) {
    const href = rebuildContactLink(span.text)!.href.toLowerCase();
    const contactId = facts.contact.find(id => facts.facts[id]?.sources.length === 0 && rebuildContactLink(facts.facts[id]!.text)?.href.toLowerCase() === href);
    const range = ranges.find(range => span.start >= range.start && span.end <= range.end);
    if (contactId && range) {
      const binding = { claimId:range.claimId,contactId,start:span.start-range.start,end:span.end-range.start };
      // A repeated occurrence can reference the same canonical claim span.
      // Rewrite that span once, while retaining distinct spans/claim IDs.
      if (!bindings.some(existing => existing.claimId === binding.claimId && existing.contactId === binding.contactId && existing.start === binding.start && existing.end === binding.end)) bindings.push(binding);
    }
  }
  return bindings;
}
