import type { BusinessRecord } from "@/platform/business-record/contracts";

/** Examples describe saved business facts; they never invent a service or approve a change. */
export function askSuggestions(input: { record?: BusinessRecord | null; businessName?: string; systemName?: string; aboutSystem?: boolean }): string[] {
  const name = promptName(input.systemName ?? input.businessName) || "this business";
  const suggestions = input.aboutSystem
    ? [`What does ${name} do today?`, `What could we improve about ${name}?`]
    : [`What do you know about ${name}?`, `What changed for ${name} this month?`];
  const service = input.record?.services.find(item => item.active && item.verified && promptName(item.name));
  if (service) suggestions.push(`Draft a clearer explanation of our ${promptName(service.name)} service.`);
  else if (input.record?.facts.hours?.verified) suggestions.push("What are our saved opening hours?");
  else if (input.record?.facts.description?.verified) suggestions.push("Draft a clearer business description using our saved facts.");
  else suggestions.push("What business details should I add first?");
  return suggestions;
}

function promptName(value: string | undefined): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
