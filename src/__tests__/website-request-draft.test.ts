import { expect, it } from "vitest";
import { prepareWebsiteRequestDraft, consumeWebsiteRequestDraft } from "@/lib/website-request-draft";
it("carries the request once to the correct website without putting the text in the URL", () => {
  const map = new Map<string, string>();
  const storage = { setItem: (key: string, value: string) => { map.set(key, value); }, getItem: (key: string) => map.get(key) ?? null, removeItem: (key: string) => { map.delete(key); } };
  expect(prepareWebsiteRequestDraft({ id: "gldf", href: "https://app.strelva.com/client/gldf/dashboard" }, "Change our hours", storage, "http://localhost:3000", "draft-123", 1000)).toBe("/client/gldf/dashboard/chat?draft=draft-123");
  expect(consumeWebsiteRequestDraft("draft-123", "other", storage, 1001)).toBeNull();
  expect(consumeWebsiteRequestDraft("draft-123", "gldf", storage, 1001)).toBe("Change our hours");
  expect(consumeWebsiteRequestDraft("draft-123", "gldf", storage, 1002)).toBeNull();
});
