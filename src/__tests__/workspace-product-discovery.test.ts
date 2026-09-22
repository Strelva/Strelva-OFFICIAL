import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { discoveryProducts, sameAppHref } from "@/experience/workspace/workspace-discovery";
import { WorkspaceLayout } from "@/experience/workspace/WorkspaceLayout";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";
import { InquiryWorkspaceExperience } from "@/experience/inquiries/InquiryExperience";
import type { WorkspaceProduct } from "@/experience/workspace/contracts";

const catalog = (id: string, availability: WorkspaceProduct["availability"] = "available"): WorkspaceProduct => ({
  id,
  name: id,
  description: `${id} description`,
  availability,
});

describe("workspace product discovery", () => {
  it("keeps supported customer products in shared discovery and hides operator-only records", () => {
    expect(discoveryProducts([
      catalog("ai_visibility"),
      catalog("managed_presence", "managed"),
      catalog("homefinder", "not_enabled"),
      catalog("domain_monitoring", "managed"),
      catalog("future_product", "release_gated"),
    ]).map((product) => product.id)).toEqual(["ai_visibility", "managed_presence", "homefinder"]);
  });

  it("does not manufacture discovery entries when the server supplied no catalog", () => {
    expect(discoveryProducts([])).toEqual([]);
  });

  it("keeps inquiry, tracker, and document entries in the shared product allowlist", () => {
    expect(discoveryProducts([catalog("inquiries"), catalog("tracker"), catalog("documents"), catalog("domain_monitoring")]).map((product) => product.id)).toEqual(["inquiries", "tracker", "documents"]);
  });

  it("accepts only same-app managed work destinations", () => {
    expect(sameAppHref("/dashboard")).toBe("/dashboard");
    expect(sameAppHref("/dashboard?tenant=client")).toBe("/dashboard?tenant=client");
    expect(sameAppHref("https://app.strelva.com/client/safe-id/dashboard")).toBe("https://app.strelva.com/client/safe-id/dashboard");
    expect(sameAppHref("https://app.strelva.com:443/client/safe-id/dashboard")).toBe("https://app.strelva.com:443/client/safe-id/dashboard");
    expect(sameAppHref("https://app.strelva.com:8443/client/safe-id/dashboard")).toBeNull();
    expect(sameAppHref("javascript://app.strelva.com/client/safe-id/dashboard")).toBeNull();
    expect(sameAppHref("https://user:pass@app.strelva.com/client/safe-id/dashboard")).toBeNull();
    expect(sameAppHref("http://localhost:3000/client/safe-id/dashboard")).toBe("http://localhost:3000/client/safe-id/dashboard");
    expect(sameAppHref("http://localhost:3000/client/safe-id/dashboard", { nodeEnv: "production" })).toBeNull();
    expect(sameAppHref("https://strelva.com/client/safe-id/dashboard")).toBeNull();
    expect(sameAppHref("https://evil.strelva.com/client/safe-id/dashboard")).toBeNull();
    expect(sameAppHref("https://strelva.example/dashboard")).toBeNull();
    expect(sameAppHref("//other.example/dashboard")).toBeNull();
    expect(sameAppHref("/\\evil.example/dashboard")).toBeNull();
    expect(sameAppHref("/dashboard\n?tenant=client")).toBeNull();
  });

  it("renders authorized managed destinations through the active Strelva shell", async () => {
    const snapshot = await (await createPreviewRequest("managed")("/api/workspace")).json();
    const layoutProps = {
      appBase: "/preview/strelva",
      signOut: null,
      snapshot,
      managedWork: snapshot.managedWork,
      home: true,
      agency: false,
      busy: false,
      selectedWork: null,
      onHome: () => undefined,
      onNew: () => undefined,
      onOngoing: () => undefined,
      onAgency: () => undefined,
      onChoose: () => undefined,
      onWorkspace: () => undefined,
      onOpenClientWork: () => undefined,
      notice: null,
      children: null,
    };
    const html = renderToStaticMarkup(createElement(WorkspaceLayout, layoutProps));
    expect(html).toContain("Harbor Dental");
    expect(html).toContain("Websites available to your account");
    expect(html).toContain("Account-authorized website");
    expect(html).toContain(`href="${snapshot.managedWork[0].href}"`);
    expect(html).not.toContain('data-testid="website-assignment-handoff"');
    expect(html).not.toContain("Website installation");
    expect(html).toContain("Recent work");
    expect(html).toContain("AI Visibility assessment");
    expect(html).not.toContain("workspace-products");
  });

  it("embeds inquiry content without mounting a second application frame", () => {
    const html = renderToStaticMarkup(createElement(InquiryWorkspaceExperience, {
      adapter: createPreviewInquiryAdapter("business"),
      basePath: "/workspace",
      initialView: "home",
    }));
    expect(html).toContain("data-inquiry-embedded");
    expect(html).toContain("What should Strelva handle?");
    expect(html).not.toContain("Inquiry navigation");
  });

  it("carries a start request into the inquiry New view", () => {
    const html = renderToStaticMarkup(createElement(InquiryWorkspaceExperience, {
      adapter: createPreviewInquiryAdapter("business"),
      basePath: "/workspace",
      initialView: "new",
      initialRequestText: "Collect quote requests and follow up when nobody replies.",
    }));
    expect(html).toContain("Collect quote requests and follow up when nobody replies.");
  });

  it("links saved tracker provenance to its readable plan receipt", async () => {
    const snapshot = await (await createPreviewRequest("managed")("/api/workspace")).json();
    const sourcePlan = { ...snapshot.work[0], id: "plan-1", productId: "work_plans", resourceKind: "plan", title: "Plan for the tracker" };
    const tracker = { ...snapshot.work[0], id: "tracker-1", productId: "tracker", resourceKind: "tracker", title: "Customer tracker", sourceWorkId: sourcePlan.id };
    const html = renderToStaticMarkup(createElement(WorkspaceLayout, {
      appBase: "/preview/strelva",
      signOut: null,
      snapshot: { ...snapshot, work: [tracker, sourcePlan] },
      managedWork: snapshot.managedWork,
      home: false,
      agency: false,
      busy: false,
      selectedWork: tracker,
      onHome: () => undefined,
      onNew: () => undefined,
      onOngoing: () => undefined,
      onAgency: () => undefined,
      onChoose: () => undefined,
      onWorkspace: () => undefined,
      onOpenClientWork: () => undefined,
      notice: null,
    }, createElement("p", null, "tracker detail")));
    expect(html).toContain("View plan and creation receipt");
    expect(html).toContain(`/preview/strelva/workspace?workspaceId=${snapshot.workspaceId}&amp;view=plan&amp;work=plan-1`);
  });
});
