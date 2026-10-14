import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AgencyVerification } from "@/experience/workspace/agency/AgencyOnboarding";
import type { QualificationState } from "@/experience/workspace/agency/qualification-model";

const agency = { id: "22222222-2222-4222-8222-222222222222", name: "Example agency", role: "owner" as const };
const fictionalQualification: QualificationState = { workspaceId: agency.id, canSubmit: true, submissions: [], effects: ["publish", "google", "email", "payments"].map(effect => ({ effect: effect as QualificationState["effects"][number]["effect"], available: false })) };
it("leads with submitting per-effect evidence instead of permission law", () => {
  const html = renderToStaticMarkup(createElement(AgencyVerification, { onboarding: { agency, effects: [] }, fictionalQualification }));
  expect(html).toContain("Get verified for client work");
  expect(html.match(/<button[^>]*>Submit evidence<\/button>/g)).toHaveLength(4);
  expect(html).toContain("Every agency follows the same review");
  expect(html).toContain("domain authority");
  expect(html).toContain("consent, exclusions and unsubscribe handling");
  expect(html).not.toContain("nothing to submit");
});
it("locks unavailable qualification and exposes recovery without inventing approval", () => {
  const html = renderToStaticMarkup(createElement(AgencyVerification, { onboarding: { agency, effects: [] } }));
  expect(html).toContain("Loading verification submissions");
  expect(html).not.toContain("verified for every effect");
});
