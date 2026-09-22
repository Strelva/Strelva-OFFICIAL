/** Keep explicit subject and checklist details. Never invent a name or legal requirements. */
export function onboardingRequestPrefill(request: string): { subjectType: "customer" | "supplier" | "employee"; requirementsText: string } {
  const subjects = (["supplier", "employee", "customer"] as const).filter(subject => new RegExp(`\\b${subject}s?\\b`, "i").test(request));
  const subjectType = subjects.length === 1 ? subjects[0]! : /\bstaff\b/i.test(request) && !subjects.length ? "employee" : "customer";
  const bullets = request.split(/\r?\n/).flatMap(line => {
    const match = /^\s*(?:[-*•]|\d+[.)])\s+(.+)\s*$/.exec(line);
    return match?.[1] ? [match[1].trim()] : [];
  });
  // A narrow explicit list, retaining the user's phrasing. Compound names such
  // as "health and safety policy" are not split on an unqualified "and".
  const explicit = request.match(/(?:\brequirements\s*:|\bwe need\s+)([^.!?\n]+)(?:[.!?]|$)/i)?.[1];
  const requirements = bullets.length ? bullets : explicit && !/\b(?:not|no|without|don't)\b/i.test(explicit)
    ? explicit.split(/\s*,\s*|\s+and\s+(?=(?:a|an|the)\s)/i).map(value => value.trim()).filter(Boolean)
    : [];
  return { subjectType, requirementsText: requirements.join("\n") };
}
