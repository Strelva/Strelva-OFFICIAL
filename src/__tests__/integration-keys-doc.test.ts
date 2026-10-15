import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KEYED_INTEGRATIONS, PROVIDER_KEY_REQUIREMENTS } from "@/platform/connections/provider-keys";

const doc = readFileSync("docs/operations/integration-keys.md", "utf8");

describe("docs/operations/integration-keys.md", () => {
  it("names every env key the code checks, so a new key cannot ship undocumented", () => {
    const missing = KEYED_INTEGRATIONS.flatMap(integration =>
      PROVIDER_KEY_REQUIREMENTS[integration].flatMap(requirement => requirement.anyOf.filter(name => !doc.includes(`\`${name}\``))));
    expect(missing).toEqual([]);
  });

  it("states that no key has been set and that client email stays off", () => {
    expect(doc).toContain("Nothing\nin this document has been set in any environment.");
    expect(doc).toContain("Client and customer email stays OFF");
  });

  it("holds no secret-looking value", () => {
    expect(doc).not.toMatch(/(sk_live|sk_test|re_[A-Za-z0-9]{10,}|ya29\.|GOCSPX)/);
  });
});
