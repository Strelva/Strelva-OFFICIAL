import { describe, it, expect } from "vitest";

import {
  normalizeSubmission,
  humanizeKey,
  isEmail,
  renderFormEmailHtml,
  renderFormEmailText,
  MAX_FIELDS,
  isStandaloneFormConfigured,
} from "../scaffold-forms";

describe("humanizeKey", () => {
  it("title-cases snake, kebab, and camel keys", () => {
    expect(humanizeKey("phone_number")).toBe("Phone Number");
    expect(humanizeKey("first-name")).toBe("First Name");
    expect(humanizeKey("phoneNumber")).toBe("Phone Number");
  });
});

describe("normalizeSubmission", () => {
  it("strips control keys, keeps real fields in order, surfaces email as replyTo", () => {
    const { fields, replyTo } = normalizeSubmission({
      formName: "Contact",
      website: "", // honeypot control key — never rendered
      name: "Janet",
      email: "janet@example.com",
      message: "Hi there",
    });
    expect(replyTo).toBe("janet@example.com");
    expect(fields.map(([label]) => label)).toEqual(["Name", "Email", "Message"]);
    expect(fields).not.toContainEqual(["Form Name", "Contact"]);
  });

  it("coerces booleans, numbers, and arrays; skips empties", () => {
    const { fields } = normalizeSubmission({
      subscribe: true,
      party_size: 4,
      interests: ["a", "b"],
      blank: "",
      missing: null,
    });
    expect(fields).toContainEqual(["Subscribe", "Yes"]);
    expect(fields).toContainEqual(["Party Size", "4"]);
    expect(fields).toContainEqual(["Interests", "a, b"]);
    expect(fields.find(([l]) => l === "Blank" || l === "Missing")).toBeUndefined();
  });

  it("caps the number of fields", () => {
    const body: Record<string, string> = {};
    for (let i = 0; i < MAX_FIELDS + 10; i++) body[`f${i}`] = "x";
    expect(normalizeSubmission(body).fields.length).toBe(MAX_FIELDS);
  });

  it("does not treat a malformed email as replyTo", () => {
    expect(normalizeSubmission({ email: "not-an-email" }).replyTo).toBeUndefined();
  });
});

describe("isEmail", () => {
  it("accepts valid and rejects invalid", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("nope")).toBe(false);
    expect(isEmail("a@b")).toBe(false);
  });
});

describe("isStandaloneFormConfigured", () => {
  it("requires a send key, from address, and at least one recipient", () => {
    expect(isStandaloneFormConfigured({ apiKey: "", from: "forms@mail.example", to: ["owner@example.com"] })).toBe(false);
    expect(isStandaloneFormConfigured({ apiKey: "re_test", from: "", to: ["owner@example.com"] })).toBe(false);
    expect(isStandaloneFormConfigured({ apiKey: "re_test", from: "forms@mail.example", to: [] })).toBe(false);
    expect(isStandaloneFormConfigured({ apiKey: "re_test", from: "forms@mail.example", to: [" owner@example.com "] })).toBe(true);
  });
});

describe("render", () => {
  const meta = { siteName: "McLear's Cottage", formName: "Contact", submittedAt: "Jul 18, 2026, 2:00 PM" };
  const fields: Array<[string, string]> = [["Name", "Janet"], ["Message", "Hello <b>there</b>"]];

  it("text render lists every field and the site/form", () => {
    const out = renderFormEmailText(meta, fields);
    expect(out).toContain("McLear's Cottage — New Contact submission");
    expect(out).toContain("Name: Janet");
    expect(out).toContain("Message: Hello <b>there</b>");
  });

  it("html render escapes field values", () => {
    const out = renderFormEmailHtml(meta, fields);
    expect(out).toContain("New Contact submission");
    expect(out).toContain("Hello &lt;b&gt;there&lt;/b&gt;");
    expect(out).not.toContain("<b>there</b>");
  });
});
