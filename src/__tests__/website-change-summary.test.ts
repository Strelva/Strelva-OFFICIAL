import { describe, expect, it } from "vitest";
import { siteDocumentSchema, type SiteDocument } from "@/products/websites/site-document-schema";
import { websiteChangeSummary } from "@/products/websites/site-report";

/** A fictional two-page site; each test changes one thing and reads what the monthly recap would say. */
function site(patch: (doc: SiteDocument) => void = () => undefined): SiteDocument {
  const doc = siteDocumentSchema.parse({ version: 2, siteName: "Fictional Dental", theme: { palette: "light", typeScale: "standard" },
    pages: [{ path: "/", title: "Home", description: "", root: "home" }, { path: "/contact", title: "Contact", description: "", root: "contact" }],
    nodes: {
      home: { id: "home", type: "Section", variant: "container", props: {}, children: ["hero", "cta", "hours"], factIds: [] },
      hero: { id: "hero", type: "Hero", variant: "split", props: { title: "Gentle care on Elmwood" }, children: [], factIds: [] },
      cta: { id: "cta", type: "Cta", variant: "band", props: { title: "Book a visit" }, children: [], factIds: [] },
      hours: { id: "hours", type: "Hours", variant: "table", props: { title: "Hours" }, children: [], factIds: [] },
      contact: { id: "contact", type: "Section", variant: "container", props: {}, children: ["map"], factIds: [] },
      map: { id: "map", type: "Map", variant: "static", props: { address: "1180 Elmwood Ave" }, children: [], factIds: [] },
    }, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" } });
  const copy = structuredClone(doc);
  patch(copy);
  return siteDocumentSchema.parse(copy);
}

describe("what a published website change did, read from the documents", () => {
  it("names the first publish", () => expect(websiteChangeSummary(null, site())).toBe("published the site"));

  it("names the sections of one page that changed, in a visitor's words", () => {
    expect(websiteChangeSummary(site(), site(doc => { (doc.nodes.hours!.props as Record<string, unknown>).title = "Fall hours"; }))).toBe("changed the hours on the home page");
    expect(websiteChangeSummary(site(), site(doc => {
      (doc.nodes.hours!.props as Record<string, unknown>).title = "Fall hours";
      (doc.nodes.cta!.props as Record<string, unknown>).title = "Book online";
    }))).toBe("changed the booking button and the hours on the home page");
  });

  it("says a reorder as moved sections", () => {
    expect(websiteChangeSummary(site(), site(doc => { doc.nodes.home!.children = ["cta", "hero", "hours"]; }))).toBe("moved sections on the home page");
  });

  it("names added pages and changes across pages", () => {
    const withInsurance = site(doc => {
      doc.pages.push({ path: "/insurance", title: "Insurance", description: "", root: "insurance" });
      doc.nodes.insurance = { id: "insurance", type: "RichText", variant: "standard", props: { text: "We take Delta Dental." }, children: [], factIds: [] } as never;
    });
    expect(websiteChangeSummary(site(), withInsurance)).toBe("added the Insurance page");
    expect(websiteChangeSummary(site(), site(doc => {
      (doc.nodes.hours!.props as Record<string, unknown>).title = "Fall hours";
      (doc.nodes.map!.props as Record<string, unknown>).address = "1182 Elmwood Ave";
    }))).toBe("changed the home page and Contact page");
  });

  it("never says nothing changed: a settings-only change is named as one", () => {
    expect(websiteChangeSummary(site(), site(doc => { doc.redirects = [{ from: "/old", to: "/" }]; }))).toBe("updated the site's settings");
  });
});
