import type { BusinessRecord } from "@/platform/business-record/contracts";

type IdeasInput = { record?: BusinessRecord | null; businessName?: string; systemName?: string; systemKind?: string; aboutSystem?: boolean };

/**
 * One idea to start from (XA · AS1): the words, the System it touches (its
 * clay tile) and what asking it does. `kind` "record" is the business record.
 */
export interface AskIdea { text: string; kind: string; effect: string }

/** Examples describe saved business facts; they never invent a service or approve a change. */
export function askIdeas(input: IdeasInput): AskIdea[] {
  const name = promptName(input.systemName ?? input.businessName) || "this business";
  const kind = input.systemKind ?? "website";
  const ideas: AskIdea[] = input.aboutSystem
    ? [{ text: `What does ${name} do today?`, kind, effect: "Reads it as visitors see it" }, { text: `What could we improve about ${name}?`, kind, effect: "Suggests; changes nothing" }]
    : [{ text: `What do you know about ${name}?`, kind: "record", effect: "Reads the business record" }, { text: `What changed for ${name} this month?`, kind: "changes", effect: "Reads What changed" }];
  const service = input.record?.services.find(item => item.active && item.verified && promptName(item.name));
  if (service) ideas.push({ text: `Draft a clearer explanation of our ${promptName(service.name)} service.`, kind: "website", effect: "Drafts a site change for a yes" });
  else if (input.record?.facts.hours?.verified) ideas.push({ text: "What are our saved opening hours?", kind: "bookings", effect: "Reads the saved hours" });
  else if (input.record?.facts.description?.verified) ideas.push({ text: "Draft a clearer business description using our saved facts.", kind: "website", effect: "Drafts a change for a yes" });
  else ideas.push({ text: "What business details should I add first?", kind: "record", effect: "Finds what the record is missing" });
  return ideas;
}

/** The words alone, for callers that only show prompts. */
export function askSuggestions(input: IdeasInput): string[] {
  return askIdeas(input).map(idea => idea.text);
}

function promptName(value: string | undefined): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
