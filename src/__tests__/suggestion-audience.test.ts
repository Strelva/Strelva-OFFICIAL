import { describe, it, expect } from "vitest";
import { suggestionAudience, ownerSuggestions, operatorSuggestions, type Suggestion } from "@/lib/suggestions";

function sug(title: string): Suggestion {
  return {
    id: `s_${title}`,
    tenantId: "t1",
    type: "growth",
    title,
    description: "",
    action: "prompt:do it",
    createdAt: new Date().toISOString(),
    status: "pending",
  };
}

describe("suggestionAudience — clients never get handed our craft", () => {
  it("classifies the site/SEO/content suggestions as operator work", () => {
    for (const title of [
      "Write your site description",
      "Recommended site improvement",
      "Freshen up your hero",
      "People are searching \"ac repair\"",
      "Traffic dropped this week",
      "Add an upcoming event",
      "Add more client reviews",
    ]) {
      expect(suggestionAudience(title)).toBe("operator");
    }
  });

  it("ownerSuggestions is empty for a list of pure operator work", () => {
    const list = ["Write your site description", "Recommended site improvement"].map(sug);
    expect(ownerSuggestions(list)).toHaveLength(0);
    expect(operatorSuggestions(list)).toHaveLength(2);
  });

  it("owner + operator partitions are disjoint and cover the whole list", () => {
    const list = ["Write your site description", "Traffic dropped this week"].map(sug);
    expect(ownerSuggestions(list).length + operatorSuggestions(list).length).toBe(list.length);
  });
});
