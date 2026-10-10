import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AgencyVerification } from "@/experience/workspace/agency/AgencyOnboarding";
import type { AgencyEffectState } from "@/platform/workspaces/agency-onboarding";

const agency = { id: "22222222-2222-4222-8222-222222222222", name: "Example agency", role: "owner" as const };
const effects: AgencyEffectState[] = ["publish", "google", "email", "payments"].map(effect => ({ effect: effect as AgencyEffectState["effect"], verified: effect === "publish", recordedAt: null }));
it("keeps effect-specific verification distinct and offers no invented submission flow", () => {
  const html = renderToStaticMarkup(createElement(AgencyVerification, { onboarding: { agency, effects } }));
  expect(html).toContain("Publishing");
  expect(html).toContain("Verified");
  expect(html.match(/Not verified/g)).toHaveLength(3);
  expect(html).toContain("There is nothing to submit here yet");
  expect(html).not.toContain("<button");
  expect(html).not.toContain("Continue verification");
});
it("does not describe absent verification evidence as approved", () => {
  const html = renderToStaticMarkup(createElement(AgencyVerification, { onboarding: { agency, effects: [] } }));
  expect(html).toContain("No verification records could be read. Outside changes stay locked.");
  expect(html).not.toContain("verified for every effect");
});
