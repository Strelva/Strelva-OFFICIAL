import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceHelp } from "@/experience/workspace/WorkspaceHelp";

describe("workspace help entry", () => {
  it("keeps general help and agency access outside a closed business-setup disclosure", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceHelp, {
      onAgency: () => undefined,
    }));
    expect(html).toContain("What do you need?");
    expect(html).toContain('id="capability-request"');
    expect(html).toContain("Sharing &amp; agency access");
    expect(html).toContain("Open email");
    expect(html).not.toContain("<details");
  });

  it("does not require business setup for a whitespace-only request", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceHelp, {
      initialRequest: "  \n ",
      onAgency: () => undefined,
    }));
    expect(html).toContain("Sharing &amp; agency access");
    expect(html).not.toContain("Choose a business for this request.");
  });

  it("keeps retained service requests on explicit business setup without mounting hidden autofocus fields", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceHelp, {
      initialRequest: "Have Strelva build our website.",
    }));
    expect(html).toContain("Choose a business for this request.");
    expect(html).toContain("Checking the businesses you can manage");
    expect(html).toContain("Contact the team without setting up a business");
    expect(html).not.toContain('id="capability-request"');
  });

  it("keeps a selected business on durable requests instead of creating another business", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceHelp, {
      workspaceId: "b9100000-0000-4000-8000-000000000003",
      initialRequest: "Have Strelva build our website.",
    }));
    expect(html).toContain("Save request");
    expect(html).toContain("Review saved requests and delivery deadlines");
    expect(html).not.toContain("Choose a business for this request.");
  });
});
