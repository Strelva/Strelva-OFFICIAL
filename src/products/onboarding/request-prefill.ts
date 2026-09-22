/** Keep an explicit subject hint, never invent a name or legal requirements. */
export function onboardingRequestPrefill(request: string): { subjectType: "customer" | "supplier" | "employee"; requirementsText: string } {
  const subjectType = /\bsuppliers?\b/i.test(request) ? "supplier" : /\b(?:employees?|staff)\b/i.test(request) ? "employee" : "customer";
  const requirements = request.split(/\r?\n/).flatMap(line => {
    const match = /^\s*(?:[-*•]|\d+[.)])\s+(.+)\s*$/.exec(line);
    return match?.[1] ? [match[1].trim()] : [];
  });
  return { subjectType, requirementsText: requirements.join("\n") };
}
