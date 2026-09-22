import { describe, expect, it } from "vitest";
import { clearRequestDrafts, readRequestDraft, requestDraftKey, writeRequestDraft } from "@/experience/workspace/request-draft";
import { searchWorkspaceItems, type WorkspaceSearchItem } from "@/experience/workspace/workspace-search";

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); }, clear: () => values.clear() };
}

describe("scoped request drafts", () => {
  it("keeps actors and businesses separate", () => {
    const a = requestDraftKey({ actorEmail: "owner@example.com", workspaceId: "business-a" });
    const b = requestDraftKey({ actorEmail: "owner@example.com", workspaceId: "business-b" });
    const other = requestDraftKey({ actorEmail: "other@example.com", workspaceId: "business-a" });
    expect(new Set([a, b, other]).size).toBe(3);
    const store = storage();
    expect(writeRequestDraft(store, a, "Supplier onboarding\nKeep these requirements.")).toBe(true);
    expect(readRequestDraft(store, a)).toBe("Supplier onboarding\nKeep these requirements.");
    expect(readRequestDraft(store, b)).toBe("");
    expect(readRequestDraft(store, other)).toBe("");
  });
  it("preserves the request without executing or interpreting it", () => {
    const store = storage();
    const key = requestDraftKey({ actorEmail: "owner@example.com", workspaceId: "a" });
    const request = "Make an app and then a document. Do not publish either.";
    writeRequestDraft(store, key, request);
    expect(readRequestDraft(store, key)).toBe(request);
    writeRequestDraft(store, key, "");
    expect(store.getItem(key)).toBeNull();
  });
  it("bounds and validates untrusted browser storage", () => {
    const store = storage();
    store.setItem("draft", "bad json");
    expect(readRequestDraft(store, "draft")).toBe("");
    store.setItem("draft", JSON.stringify({ version: 2, text: "no" }));
    expect(readRequestDraft(store, "draft")).toBe("");
    writeRequestDraft(store, "draft", "a".repeat(4000));
    expect(readRequestDraft(store, "draft")).toHaveLength(3000);
  });
  it("does not prevent editing when browser storage is blocked", () => {
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
    expect(readRequestDraft(blocked, "draft")).toBe("");
    expect(writeRequestDraft(blocked, "draft", "keep typing")).toBe(false);
  });
  it("clears only its own private drafts on sign-out", () => {
    const store = storage();
    const key = requestDraftKey({ actorEmail: "owner@example.com", workspaceId: "a" });
    writeRequestDraft(store, key, "private request");
    store.setItem("unrelated", "keep");
    clearRequestDrafts(store);
    expect(store.getItem(key)).toBeNull();
    expect(store.getItem("unrelated")).toBe("keep");
  });
});

describe("workspace search", () => {
  const items: WorkspaceSearchItem[] = Array.from({ length: 24 }, (_, index) => ({ id: String(index), title: `Staff request ${index + 1}`, detail: "Application", href: `/workspace?work=${index}` }));
  it("does not silently cap matching results at six", () => {
    expect(searchWorkspaceItems(items, "staff")).toHaveLength(24);
    expect(searchWorkspaceItems(items, "request 24")[0]?.id).toBe("23");
  });
  it("matches both names and types, irrespective of accents or case", () => {
    expect(searchWorkspaceItems([{ id: "cafe", title: "Café requests", detail: "Tracker", href: "/workspace" }], "CAFE tracker")).toHaveLength(1);
  });
  it("keeps all authorized items reachable without mutating the input", () => {
    expect(searchWorkspaceItems(items, "   ")).toEqual(items);
    expect(searchWorkspaceItems(items, "missing")).toEqual([]);
    expect(items).toHaveLength(24);
  });
});
