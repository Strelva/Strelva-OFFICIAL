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
  it("limits the shelf to consumer products and hides operator-only products", () => {
    expect(discoveryProducts([
      catalog("ai_visibility"),
      catalog("managed_presence", "managed"),
      catalog("homefinder", "not_enabled"),
      catalog("domain_monitoring", "managed"),
      catalog("future_product", "release_gated"),
    ]).map((product) => product.id)).toEqual(["ai_visibility", "managed_presence", "homefinder"]);
  });

  it("does not manufacture a product shelf when the server supplied no catalog", () => {
    expect(discoveryProducts([])).toEqual([]);
  });

  it("keeps inquiry and tracker entries in the shared product allowlist", () => {
    expect(discoveryProducts([catalog("inquiries"), catalog("tracker"), catalog("domain_monitoring")]).map((product) => product.id)).toEqual(["inquiries", "tracker"]);
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
      onAgency: () => undefined,
      onChoose: () => undefined,
      onWorkspace: () => undefined,
      notice: null,
      children: null,
    };
    const html = renderToStaticMarkup(createElement(WorkspaceLayout, layoutProps));
    expect(html).toContain("Harbor Dental");
    expect(html).toContain("/preview/strelva/website");
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
});
