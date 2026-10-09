import { describe, expect, it } from "vitest";
import { extractBusinessFacts, isHighRiskWebsiteClaim, runWebsiteRebuild } from "@/products/websites/rebuild-pipeline";
import { renderSiteDocumentHtml } from "@/products/websites/site-export";
import { siteDocumentSchema } from "@/products/websites/site-document";

const description = "We bake sourdough bread for Saturday pickup. Email orders@example.test or call 716-555-0100 to place an order.";
const input = { businessName: "Fictional Juniper Bread", description };

describe("supplied contact details in a new website description", () => {
  it("retains supplied contact facts and actionable links on Contact in private, static and native hosted renders", async () => {
    const result = await runWebsiteRebuild(input);
    expect(result.crawl).toBeUndefined(); expect(result.content.writer).toBe("source");
    expect(result.document.provenance.composer).toBe("rules");
    expect(siteDocumentSchema.safeParse(result.document).success).toBe(true);
    expect(Object.values(result.document.facts)).toContainEqual(expect.objectContaining({ text: description, kind: "claim", origin: "owner_stated", sources: [] }));
    const contacts = result.facts.contact.map(id => ({ id, fact: result.document.facts[id]! }));
    expect(contacts.map(({ fact }) => fact.text)).toEqual(["orders@example.test", "716-555-0100"]);
    for (const { id, fact } of contacts) {
      expect(fact).toMatchObject({ kind: "contact", origin: "owner_stated", sources: [], highRisk: isHighRiskWebsiteClaim(fact.text) });
      expect(Object.values(result.document.nodes).some(node => node.type === "Cta" && node.factIds.includes(id))).toBe(true);
    }
    for (const path of ["/", "/contact"]) {
      for (const options of [{ preview: true }, {}, { tenant: "fictional-juniper" }]) {
        const html = renderSiteDocumentHtml(result.document, path, options);
        expect(html).toContain('href="mailto:orders@example.test"');
        expect(html).toContain('href="tel:7165550100"');
        expect(html).toContain("orders@example.test"); expect(html).toContain("716-555-0100");
        expect(html).not.toContain('href="tel:716-555-0100"');
      }
    }
    expect(result.document.capabilities).toBeUndefined();
    const privateHtml = renderSiteDocumentHtml(result.document, "/contact", { preview: true });
    expect(privateHtml).toContain("<fieldset disabled>"); expect(privateHtml).not.toContain("data-site-inquiry");
    expect(renderSiteDocumentHtml(result.document, "/contact")).toContain("This inquiry form is not connected yet.");
    const nativeHtml = renderSiteDocumentHtml(result.document, "/contact", { tenant: "fictional-juniper" });
    expect(nativeHtml).toContain('data-site-inquiry="fictional-juniper"'); expect(nativeHtml).toContain("site-lead-runtime.mjs");
    expect(nativeHtml).not.toContain("This inquiry form is not connected yet.");
  });
  it("keeps an ordinary description unchanged when no explicit contact is supplied", async () => {
    const description = "We bake sourdough bread for Saturday pickup.";
    const result = await runWebsiteRebuild({ ...input, description });
    expect(result.facts.contact).toEqual([]); expect(Object.keys(result.facts.facts)).toHaveLength(2);
    expect(Object.values(result.document.facts).map(fact => fact.text)).toEqual([input.businessName, description]);
    expect(Object.values(result.document.nodes).some(node => node.type === "Cta")).toBe(false);
  });
  it.each([
    ["Email Orders+pickup@example.test.", "Orders+pickup@example.test", "mailto:Orders+pickup@example.test"],
    ["Phone: (716) 555-0100.", "(716) 555-0100", "tel:7165550100"],
    ["Call us at +1 716 555 0100.", "+1 716 555 0100", "tel:+17165550100"],
    ["Reach our office on +44 20 7946 0958.", "+44 20 7946 0958", "tel:+442079460958"],
  ])("uses the exact explicit destination from %s", async (description, text, href) => {
    const result = await runWebsiteRebuild({ ...input, description });
    expect(result.facts.contact.map(id => result.facts.facts[id]!.text)).toEqual([text]);
    expect(renderSiteDocumentHtml(result.document, "/contact", { preview: true })).toContain(`href="${href}"`);
  });
  it.each([
    "Pickup on 2026-10-09. Prices are $1234567. Order ID 716-555-0100. We bake 1234567890 loaves.",
    "Call us on 2026-10-09 or 10.09.2026. Phone: 123456. Tel: 1234567890123456.",
    "Call about order #7165550100. Telephone order number 7165550100.",
    "Reference 716-555-0100. Event +2026-10-09.",
    "Email orders@@example.test, a..b@example.test, orders@example or javascript:orders@example.test.",
    "Email orders@example.test?subject=Injected or orders%0D%0A@example.test.",
    "Order +1234567890. Use https://example.test/+17165550100 or javascript:tel:7165550100. Phone: 7165550100ABC.",
    "Revenue grew by +12345678 this year. Growth was +12345678. Contact us to discuss revenue +12345678.",
    "Do not call 716-555-0100. Our retired phone: 716-555-0100. Phone: 716-555-0100 is retired.",
    "Do not email old@example.test. Our previous email: old@example.test. Email old@example.test is discontinued.",
  ])("does not infer a contact destination from invalid or unrelated details: %s", description => {
    const facts = extractBusinessFacts({ ...input, description });
    expect(facts.contact).toEqual([]);
    expect(Object.values(facts.facts)).toContainEqual(expect.objectContaining({ text: description, kind: "claim" }));
  });
  it("escapes original business copy and keeps contact provenance without inventing a capability or scheme", async () => {
    const description = '<img src=x onerror="alert(1)"> Email orders@example.test.';
    const result = await runWebsiteRebuild({ ...input, description });
    const html = renderSiteDocumentHtml(result.document, "/", { preview: true });
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"); expect(html).not.toContain("<img src=x");
    expect(html).toContain('href="mailto:orders@example.test"'); expect(html).not.toContain('href="javascript:');
    expect(Object.values(result.document.facts).every(fact => fact.origin === "owner_stated" && fact.sources.length === 0)).toBe(true);
    expect(result.document.capabilities).toBeUndefined();
  });
});
