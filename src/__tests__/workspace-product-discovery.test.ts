import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { discoveryProducts, sameAppHref } from "@/experience/workspace/WorkspaceProductDiscovery";
import { WorkspaceProductDiscovery } from "@/experience/workspace/WorkspaceProductDiscovery";
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

  it("accepts only same-app managed work destinations", () => {
    expect(sameAppHref("/dashboard")).toBe("/dashboard");
    expect(sameAppHref("/dashboard?tenant=client")).toBe("/dashboard?tenant=client");
    expect(sameAppHref("https://app.strelva.com/client/safe-id/dashboard")).toBe("https://app.strelva.com/client/safe-id/dashboard");
    expect(sameAppHref("http://localhost:3000/client/safe-id/dashboard")).toBe("http://localhost:3000/client/safe-id/dashboard");
    expect(sameAppHref("https://strelva.com/client/safe-id/dashboard")).toBeNull();
    expect(sameAppHref("https://evil.strelva.com/client/safe-id/dashboard")).toBeNull();
    expect(sameAppHref("https://strelva.example/dashboard")).toBeNull();
    expect(sameAppHref("//other.example/dashboard")).toBeNull();
  });

  it("renders only server-supplied managed destinations and a truthful disabled Homefinder state", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceProductDiscovery, {
      products: [
        catalog("ai_visibility"),
        catalog("managed_presence", "managed"),
        catalog("domain_monitoring", "managed"),
        catalog("homefinder", "not_enabled"),
      ],
      managedWork: [{ id: "tenant", title: "Harbor Dental", href: "/client/harbor/dashboard", productId: "managed_presence", relationship: "client" }],
      onStartAiVisibility: () => undefined,
    }));
    expect(html).toContain("Harbor Dental");
    expect(html).toContain("/client/harbor/dashboard");
    expect(html).toContain("Not enabled");
    expect(html).not.toContain("domain_monitoring");
  });
});
