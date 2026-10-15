import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BusinessAiBudgetSummary, StartWorkspacePlan, WorkspacePlanUnavailable } from "@/experience/workspace/billing/StartWorkspacePlan";

const budget = { spentUsd: "3.50", reservedUsd: "1.25", capCents: 1000, subscribed: true, since: "2026-10-01T00:00:00Z", resetsAt: "2026-11-01T00:00:00Z", unknownCostCalls: 0 };
it("shows spend, conservative reservations, remaining cap and its recorded reset date", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={budget} capUsd={10} enforced />);
  for (const text of ["$3.50", "$1.25", "$5.25", "November 1, 2026 (UTC)", "reserve their maximum cost", "stay committed until the reset"]) expect(html).toContain(text);
});
it("unknown spend does not invent remaining budget or a reset date", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={null} capUsd={10} enforced />);
  expect(html).toContain("Usage could not be confirmed"); expect(html).toContain("stays paused");
  expect(html).not.toContain("$10.00"); expect(html).not.toContain("November");
});
it("flag-off plan copy does not promise an enforced cap", () => {
  const html = renderToStaticMarkup(<StartWorkspacePlan workspaceId="a0000000-0000-4000-8000-000000000001" />);
  expect(html).toContain("shown before you pay"); expect(html).toContain("Your current usage limit has not been confirmed");
  expect(html).not.toContain("Building pauses at the limit");
});

it("unpriced historical calls make remaining usage unavailable instead of suggesting spendable dollars", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={{ ...budget, unknownCostCalls: 1 }} capUsd={10} enforced />);
  expect(html).not.toContain("$5.25"); expect(html).toContain("Usage could not be confirmed");
  expect(html).toContain("$3.50");
});

it("unconfigured plans show honest pricing and an available agency path without checkout", () => {
  const html = renderToStaticMarkup(<WorkspacePlanUnavailable workspaceId="business one" />);
  expect(html).toContain("Price shown before you pay");
  expect(html).toContain("Self-serve plans are not available yet");
  expect(html).toContain("/workspace?view=help&amp;workspaceId=business%20one");
  expect(html).not.toContain("Start your plan");
  expect(html).not.toContain("[price]");
});

it("unknown historical spend is disclosed without falsely pausing an uncapped paid business", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={{ ...budget, capCents: null, unknownCostCalls: 1 }} capUsd={null} enforced />);
  expect(html).toContain("Recorded spend is incomplete");
  expect(html).toContain("No spending limit is recorded");
  expect(html).not.toContain("stays paused");
});
