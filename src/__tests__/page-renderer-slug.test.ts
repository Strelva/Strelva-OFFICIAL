import { describe, it, expect } from "vitest";
import { pageKeyFromSlug } from "../../custom-repo-starter/PageRenderer";

describe("pageKeyFromSlug — dynamic page routing", () => {
  it("maps the catch-all root to the home page", () => {
    expect(pageKeyFromSlug(undefined)).toBe("home");
    expect(pageKeyFromSlug([])).toBe("home");
  });
  it("joins nested slugs into a page key", () => {
    expect(pageKeyFromSlug(["about"])).toBe("about");
    expect(pageKeyFromSlug(["services", "hvac"])).toBe("services/hvac");
  });
});
