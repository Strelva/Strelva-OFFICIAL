import { describe, expect, it } from "vitest";
import { prepareContextPayload, prepareContextText } from "@/platform/work-context/preparation";

describe("safe context projection", () => {
  it("removes complete quoted secrets rather than only their first word", () => {
    const input = `Business notes. password="fictional secret phrase"; token='another fictional phrase'. Keep our office hours.`;
    const result = prepareContextText({ value: input });
    expect(result.redacted).toBe(true);
    expect(result.value).not.toContain("fictional");
    expect(result.value).not.toContain("phrase");
    expect(result.value).toContain("Keep our office hours");
  });

  it("does not treat untrusted payload keys as object prototype setters", () => {
    const source: unknown = JSON.parse('{"__proto__":{"injected":true},"title":"Office hours"}');
    const result = prepareContextPayload(source) as Record<string, unknown>;
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(result.injected).toBeUndefined();
    expect(result.title).toBe("Office hours");
  });
});
