import type { OnboardingCase } from "./contracts";

/** Prefill only explicit subject words and an explicit list. This is editable input, not model inference or acceptance. */
export function onboardingRequestDraft(request: string): { subjectType: OnboardingCase["subjectType"]; title: string; requirements: string[]; subjectExplicit: boolean } {
  const subjects = (["supplier", "employee", "customer"] as const).filter(subject => new RegExp(`\\b${subject}s?\\b`, "i").test(request));
  const subjectType = subjects.length === 1 ? subjects[0]! : "customer";
  const bullets = request.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+?)\s*$/);
    return match?.[1] ? [match[1].trim()] : [];
  });
  const explicitList = request.match(/(?:\brequirements\s*:|\bwe need\s+)([^.!?\n]+)(?:[.!?]|$)/i)?.[1];
  const requirements = bullets.length ? bullets : explicitList && !/\b(?:not|no|without|don't)\b/i.test(explicitList) ? explicitList.split(/\s*,\s*|\s+and\s+/i).map(item => item.trim()).filter(Boolean) : [];
  return { subjectType, subjectExplicit: subjects.length === 1, title: request.trim() ? `${subjectType[0]!.toUpperCase()}${subjectType.slice(1)} onboarding` : "", requirements };
}
