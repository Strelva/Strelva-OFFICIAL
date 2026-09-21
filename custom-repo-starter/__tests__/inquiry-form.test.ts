import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StrelvaInquiryForm } from "../StrelvaInquiryForm";
import { isPublicInquiryForm, loadInquiryForm, submitInquiryForm, type PublicInquiryForm } from "../inquiry-client";

const definition: PublicInquiryForm = {
  schemaVersion: 1, capabilityId: "capability-example", version: 2, name: "Seller inquiries",
  form: { component: "form", id: "seller", title: "Tell us about your home", intro: "Maria will help with the next step.", disclosure: "Strelva", fields: [
    { id: "name", label: "Name", kind: "text", component: "text_field", required: true },
    { id: "email", label: "Email", kind: "email", component: "email_field", required: true },
    { id: "request", label: "Your request", kind: "textarea", component: "textarea_field", required: true },
  ] },
};

afterEach(() => vi.unstubAllGlobals());

describe("portable inquiry form contract", () => {
  it("renders the fixed fields, escaped content, labels, and Strelva disclosure", () => {
    const html = renderToStaticMarkup(createElement(StrelvaInquiryForm, { definition: { ...definition, form: { ...definition.form, title: "<script>unsafe</script>" } } }));
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("type=\"email\"");
    expect(html).toContain("Strelva helps this business handle your request.");
    expect(html).toContain("Preview only. This form does not send a request.");
  });

  it("rejects invented components, duplicate field IDs, and unsupported versions", () => {
    expect(isPublicInquiryForm(definition)).toBe(true);
    expect(isPublicInquiryForm({ ...definition, schemaVersion: 2 })).toBe(false);
    expect(isPublicInquiryForm({ ...definition, form: { ...definition.form, fields: [...definition.form.fields, definition.form.fields[0]] } })).toBe(false);
    expect(isPublicInquiryForm({ ...definition, form: { ...definition.form, fields: [{ ...definition.form.fields[0], component: "arbitrary_html" }] } })).toBe(false);
  });

  it("does not load a paused/missing form or accept malformed public configuration", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("", { status: 404 })).mockResolvedValueOnce(Response.json({ form: "bad" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(loadInquiryForm("https://app.example", "example", "capability-example")).rejects.toThrow("unavailable");
    await expect(loadInquiryForm("https://app.example", "example", "capability-example")).rejects.toThrow("could not be loaded");
  });

  it("binds a submission to the displayed version and preserves errors for retry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("", { status: 409 })).mockResolvedValueOnce(Response.json({ ok: false }));
    vi.stubGlobal("fetch", fetcher);
    const fields = { name: "Test customer", email: "customer@example.invalid", request: "Please help sell my home." };
    await expect(submitInquiryForm("https://app.example", "example", definition, fields)).rejects.toThrow("form changed");
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({ capabilityId: definition.capabilityId, capabilityVersion: 2, fields });
    expect(init.credentials).toBe("omit");
    await expect(submitInquiryForm("https://app.example", "example", definition, fields)).rejects.toThrow("not confirmed");
  });
});
