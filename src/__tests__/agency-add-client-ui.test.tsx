import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgencyAddClient, AgencyClientAiCheck } from "@/experience/workspace/agency/AgencyAddClient";
import type { ClientAiCheck } from "@/products/agency-clients/contracts";

const href = "/workspace?workspaceId=agency&work=assessment";
const ready: Extract<ClientAiCheck, { status: "ready" }> = { status: "ready", workId: "assessment", href,
  result: { business: "Northside Bakery", score: 70, grade: "C", verdict: "Readiness measured", topFix: "Add business schema",
    signals: [], measurementStatus: "partial", readinessMeasured: true,
    citation: { probed: false, mentioned: false, recommended: false, note: "Not run" } } };

describe("agency client AI check", () => {
  it("links to the existing private work and distinguishes readiness from an unrun live probe", () => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={ready} />);
    expect(html).toContain("grade C (70 of 100)");
    expect(html).toContain("Strelva has not asked a live assistant yet.");
    expect(html).toContain("Add business schema");
    expect(html).toContain('href="/workspace?workspaceId=agency&amp;work=assessment"');
    expect(html).not.toContain("AI doesn't recommend");
  });

  it("does not show a grade when neither readiness nor a live answer was measured", () => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={{ ...ready, result: { ...ready.result,
      measurementStatus: "unavailable", readinessMeasured: false, score: 0, grade: "F" } }} />);
    expect(html).not.toContain("0 of 100");
    expect(html).not.toContain("grade F");
    expect(html).toContain("Open the AI check in your agency");
  });

  it("does not grade readiness from a citation-only partial result", () => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={{ ...ready, result: { ...ready.result,
      readinessMeasured: false, citation: { ...ready.result.citation, probed: true, note: "One live Gemini answer measured." } } }} />);
    expect(html).not.toContain("70 of 100");
    expect(html).toContain("One live Gemini answer measured");
    expect(html).toContain("Strelva asked a live assistant.");
  });

  it.each(["unavailable", "pending"] as const)("keeps recovery available for a %s check", (status) => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={{ status, message: "Client retained. Check unavailable.", href: "/workspace?workspaceId=agency&view=work" }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain(status === "pending" ? "Strelva is also checking how search assistants describe their site." : "Client retained");
    expect(html).toContain("Open the AI check in your agency");
    expect(html).not.toContain("of 100");
  });

  it("draws nothing when no check was requested (the page already says no website was read)", () => {
    const html = renderToStaticMarkup(<AgencyClientAiCheck check={{ status: "not_requested" }} />);
    expect(html).toBe("");
  });
});


describe("agency owner-link email choice", () => {
  it("keeps email absent by default and available only when the server releases it", () => {
    const props = { agencyWorkspaceId: "00000000-0000-4000-8000-000000000010", prospecting: false, initialProspectId: null };
    const off = renderToStaticMarkup(<AgencyAddClient {...props} />);
    const on = renderToStaticMarkup(<AgencyAddClient {...props} emailEnabled />);
    expect(off).not.toContain("Email this owner their claim link");
    expect(on).toContain("Email this owner their claim link if email is permitted");
    expect(on).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(off).toContain("Copy and share it after adding the client");
  });
});
