import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OWNER_CONTACT_PROBLEM_COPY, PUBLIC_MAIL_DOMAINS, ownerContactProblem } from "@/platform/owner-reach";

describe("ownerContactProblem", () => {
  it("rejects what is not an email", () => {
    expect(ownerContactProblem("not an email")).toBe("invalid");
    expect(ownerContactProblem("")).toBe("invalid");
  });
  it("flags the actor's own non-public domain", () => {
    expect(ownerContactProblem("Pat@North.example", "me@north.example")).toBe("your_domain");
  });
  it("lets a shared mailbox domain through on both sides", () => {
    expect(ownerContactProblem("pat@gmail.com", "me@gmail.com")).toBeNull();
  });
  it("lets another domain through", () => {
    expect(ownerContactProblem("pat@bakery.example", "me@north.example")).toBeNull();
    expect(ownerContactProblem("pat@bakery.example")).toBeNull();
  });
  it("keeps the copy", () => {
    expect(OWNER_CONTACT_PROBLEM_COPY).toEqual({
      invalid: "Check the owner's email address.",
      your_domain: "Use the owner's own email address, not one at your agency.",
    });
  });
});

describe("public mail domains", () => {
  it("match the database list exactly", () => {
    const sql = readFileSync("supabase/migrations/20261027100000_owner_reach.sql", "utf8");
    const body = sql.match(/owner_reach_public_mail_domains\(\) returns text\[\][\s\S]*?array\[([^\]]+)\]/);
    expect(body).not.toBeNull();
    const fromSql = [...(body?.[1] ?? "").matchAll(/'([^']+)'/g)].map(match => match[1]);
    expect(fromSql).toEqual([...PUBLIC_MAIL_DOMAINS]);
  });
});
