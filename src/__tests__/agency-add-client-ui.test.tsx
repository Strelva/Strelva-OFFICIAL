import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgencyClientAiCheck } from "@/experience/workspace/agency/AgencyAddClient";
import type { ClientAiCheck } from "@/products/agency-clients/contracts";

const href = "/workspace?workspaceId=agency&work=assessment";
const ready: Extract<ClientAiCheck, { status: "ready" }> = { status: "ready", workId: "assessment", href,
  result: { business: "Northside Bakery", score: 70, grade: "C", verdict: "Readiness measured", topFix: "Add business schema",
    signals: [], measurementStatus: "partial", readinessMeasured: true,
    citation: { probed: false, mentioned: false, recommended: false, note: "Not run" } } };

describe("agency client AI check", () => {
  it("links to the existing private work and distinguishes readiness from an unrun live probe", () => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={ready} />);
    expect(html).toContain("C · 70/100");
    expect(html).toContain("Probe not completed");
    expect(html).toContain("Add business schema");
    expect(html).toContain('href="/workspace?workspaceId=agency&amp;work=assessment"');
    expect(html).not.toContain("AI doesn't recommend");
  });

  it("does not show a grade when neither readiness nor a live answer was measured", () => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={{ ...ready, result: { ...ready.result,
      measurementStatus: "unavailable", readinessMeasured: false, score: 0, grade: "F" } }} />);
    expect(html).not.toContain("0/100");
    expect(html).not.toContain("F ·");
    expect(html).toContain("Open saved AI check");
  });

  it("does not grade readiness from a citation-only partial result", () => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={{ ...ready, result: { ...ready.result,
      readinessMeasured: false, citation: { ...ready.result.citation, probed: true, note: "One live Gemini answer measured." } } }} />);
    expect(html).not.toContain("70/100");
    expect(html).toContain("One live Gemini answer measured");
    expect(html).toContain("Probe completed");
  });

  it.each(["unavailable", "pending"] as const)("keeps recovery available for a %s check", (status) => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={{ status, message: "Client retained. Check unavailable.", href: "/workspace?workspaceId=agency&view=work" }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Client retained");
    expect(html).toContain("Open agency saved work");
    expect(html).not.toContain("/100");
  });

  it("states that no check was requested without a website", () => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={{ status: "not_requested" }} />);
    expect(html).toContain("No website given");
    expect(html).not.toContain("href=");
  });
});
