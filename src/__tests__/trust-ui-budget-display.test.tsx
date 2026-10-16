import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BusinessAiBudgetSummary, StartWorkspacePlan, WorkspacePlanUnavailable } from "@/experience/workspace/billing/StartWorkspacePlan";

const budget = { spentUsd: "3.50", reservedUsd: "1.25", capCents: 1000, subscribed: true, since: "2026-10-01T00:00:00Z", resetsAt: "2026-11-01T00:00:00Z", unknownCostCalls: 0 };
it("says this month's share used and its reset day, with no dollar figure or builder words", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={budget} capUsd={10} enforced />);
  expect(html).toContain("48% of this month&#x27;s Strelva work is used. It resets November 1.");
  for (const builder of ["$", "UTC", "calls", "held", "job", "Recorded spend"]) expect(html).not.toContain(builder);
});
it("unknown spend does not invent remaining budget or a reset date", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={null} capUsd={10} enforced />);
  expect(html).toContain("couldn&#x27;t be read just now"); expect(html).toContain("holds new work");
  expect(html).not.toContain("$"); expect(html).not.toContain("November");
});
it("flag-off plan copy promises no cap and shows no price", () => {
  const html = renderToStaticMarkup(<StartWorkspacePlan workspaceId="a0000000-0000-4000-8000-000000000001" />);
  expect(html).toContain("Nothing is charged for Strelva work until plans open."); expect(html).toContain("Choose a plan");
  expect(html).not.toContain("$");
});

it("unpriced historical calls make remaining usage unavailable instead of suggesting spendable dollars", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={{ ...budget, unknownCostCalls: 1 }} capUsd={10} enforced />);
  expect(html).not.toContain("%"); expect(html).toContain("hasn&#x27;t been tallied yet");
  expect(html).toContain("holds new work");
});

it("closed plans are an honest waitlist with an agency path, never checkout or a price", () => {
  const html = renderToStaticMarkup(<WorkspacePlanUnavailable workspaceId="business one" businessName="Harbor Dental" agencyHref="/workspace?view=help&workspaceId=business%20one" />);
  expect(html).toContain("Plans aren’t open yet.");
  expect(html).toContain("Strelva can&#x27;t take on new work for Harbor Dental");
  expect(html).toContain("Tell me when plans open");
  expect(html).toContain("data-xa-primary");
  expect(html).toContain("/workspace?view=help&amp;workspaceId=business%20one");
  expect(html).not.toContain("Choose a plan");
  expect(html).not.toContain("$");
});
it("a business already on the list says where the note goes and offers to leave", () => {
  const html = renderToStaticMarkup(<WorkspacePlanUnavailable workspaceId="b" businessName="Harbor Dental" agencyHref="/help" joinedEmail="amy@harbordental.com" />);
  expect(html).toContain("On the list"); expect(html).toContain("amy@harbordental.com");
  expect(html).toContain("Take Harbor Dental off the list"); expect(html).not.toContain("Tell me when plans open");
});
it("someone who isn't the owner reads why instead of a dead button", () => {
  const html = renderToStaticMarkup(<WorkspacePlanUnavailable workspaceId="b" businessName="Harbor Dental" agencyHref="/help" canJoin={false} />);
  expect(html).toContain("The business owner can ask"); expect(html).not.toContain("<button");
});

it("unknown historical spend is disclosed without falsely pausing an uncapped paid business", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={{ ...budget, capCents: null, unknownCostCalls: 1 }} capUsd={null} enforced />);
  expect(html).toContain("hasn&#x27;t been tallied yet");
  expect(html).toContain("nothing is held while");
  expect(html).not.toContain("holds new work");
});

const controls = (over = {}) => ({ paused: false, monthlyCapCents: null, reviewAutoPost: "client_choice" as const, revision: 1, setBy: null, changedAt: null, ...over });
it("renders today's output with no controls row", () => {
  const without = renderToStaticMarkup(<BusinessAiBudgetSummary budget={budget} capUsd={10} enforced />);
  const withNull = renderToStaticMarkup(<BusinessAiBudgetSummary budget={budget} capUsd={10} enforced controls={null} />);
  expect(withNull).toBe(without);
});
it("names the agency that paused Strelva work", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={budget} capUsd={10} enforced controls={controls({ paused: true, setBy: { kind: "agency", agencyName: "North Studio" }, changedAt: "2026-10-12T15:00:00Z" })} />);
  expect(html).toContain("North Studio paused Strelva work for this business on October 12.");
});
it("shows an agency limit with who set it and the reset, never its dollar amount", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={budget} capUsd={10} enforced controls={controls({ monthlyCapCents: 2500, setBy: { kind: "agency", agencyName: "North Studio" }, changedAt: "2026-10-12T15:00:00Z" })} />);
  expect(html).toContain("North Studio set a monthly limit on Strelva work here. It resets November 1.");
  expect(html).not.toContain("$25");
});
it("names a Strelva operator without inventing an agency, and never says AI in the new lines", () => {
  const html = renderToStaticMarkup(<BusinessAiBudgetSummary budget={budget} capUsd={10} enforced controls={controls({ paused: true, monthlyCapCents: 500, setBy: { kind: "operator", agencyName: null } })} />);
  expect(html).toContain("A Strelva operator paused Strelva work for this business.");
  expect(html).toContain("Strelva set a monthly limit on Strelva work here.");
});
it("steps the plan button down when another decision holds the screen's one primary", () => {
  expect(renderToStaticMarkup(<StartWorkspacePlan workspaceId="a0000000-0000-4000-8000-000000000001" />)).toContain("data-xa-primary");
  expect(renderToStaticMarkup(<StartWorkspacePlan primary={false} workspaceId="a0000000-0000-4000-8000-000000000001" />)).not.toContain("data-xa-primary");
});
