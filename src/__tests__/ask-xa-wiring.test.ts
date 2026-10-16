import { describe, expect, it } from "vitest";
import { askDraftRefs, askOutcomes, askOwnerName, type AskDecisionRecord, type AskReceiptRecord } from "@/platform/ask/outcomes";
import { askIdeas, askSuggestions } from "@/platform/ask/suggestions";
import { readAskIdeas, readAskOutcomes, readAskOwner } from "@/experience/ask/ask-model";
import { xaInitialOf } from "@/components/ui/strelva/xa/state";

const REF = "22222222-2222-4222-8222-222222222222";
const decision = (extra: Partial<AskDecisionRecord> = {}): AskDecisionRecord => ({
  id: REF, state: "approved", outcome: "done", outcomeReason: null, receiptRef: "rcpt-1", decidedByKind: "session", decidedAt: "2026-10-15T10:41:00Z", openedAt: "2026-10-15T10:14:00Z",
  actor: { kind: "agency", displayName: "North Studio" }, decidedActor: { kind: "person", displayName: "Dr. Lin" }, ...extra,
});
const receipt = (extra: Partial<AskReceiptRecord> = {}): AskReceiptRecord => ({
  id: "rcpt-1", at: "2026-10-15T10:43:00Z", changed: "An Insurance section under Hours", actor: { kind: "platform" },
  evidence: { providerAccepted: true, readBack: "verified" }, undo: { state: "undo" }, ...extra,
});

describe("What happened after the yes (XA · AS5 wiring)", () => {
  it("joins the decision and its receipt, naming each person", () => {
    const out = askOutcomes({ refs: [REF], decisions: [decision()], receipts: [receipt()] });
    expect(out[REF]).toEqual({
      state: "approved", outcome: "done", sentBy: "North Studio", sentAt: "2026-10-15T10:14:00Z", decidedBy: "Dr. Lin", decidedAt: "2026-10-15T10:41:00Z",
      liveBy: "Strelva", liveAt: "2026-10-15T10:43:00Z", readBackAt: "2026-10-15T10:43:00Z", reason: null, undo: "available",
      facts: [["What changed", "An Insurance section under Hours"]],
    });
    // The browser reads back exactly what the route sends.
    expect(readAskOutcomes(JSON.parse(JSON.stringify(out)))).toEqual(out);
  });

  it("claims read back only when verified, and never Live from a failed outcome", () => {
    expect(askOutcomes({ refs: [REF], decisions: [decision()], receipts: [receipt({ evidence: { providerAccepted: true, readBack: "not_checked" } })] })[REF]!.readBackAt).toBeNull();
    const failed = askOutcomes({ refs: [REF], decisions: [decision({ outcome: "failed", outcomeReason: "The page changed. " })], receipts: [receipt()] })[REF]!;
    expect(failed).toMatchObject({ liveBy: null, liveAt: null, readBackAt: null, undo: null, reason: "The page changed." });
    expect(failed.facts).toBeUndefined();
  });

  it("leaves open items out, ignores other refs, and never invents an actor", () => {
    expect(askOutcomes({ refs: [REF], decisions: [decision({ state: "open", decidedAt: null })], receipts: [] })).toEqual({});
    expect(askOutcomes({ refs: ["other"], decisions: [decision()], receipts: [] })).toEqual({});
    const unknown = askOutcomes({ refs: [REF], decisions: [decision({ decidedActor: null, actor: null, state: "declined", outcome: null })], receipts: [] })[REF]!;
    expect(unknown).toMatchObject({ state: "declined", decidedBy: "Actor not recorded", sentBy: null, outcome: null });
    const byLink = askOutcomes({ refs: [REF], decisions: [decision({ decidedActor: null, decidedByKind: "owner_link", state: "declined" })], receipts: [], ownerName: "Dr. Amy Lin" })[REF]!;
    expect(byLink.decidedBy).toBe("Dr. Amy Lin");
    expect(askOutcomes({ refs: [REF], decisions: [decision({ state: "superseded" })], receipts: [] })[REF]!.state).toBe("withdrawn");
  });

  it("finds draft refs in saved results only", () => {
    expect(askDraftRefs([{ result: null }, { result: { items: [{ kind: "draft", needsYou: { itemRef: REF } }, { kind: "request", needsYou: { itemRef: "x" } }, null] } }])).toEqual([REF]);
  });

  it("drops malformed outcomes in the browser", () => {
    expect(readAskOutcomes({ [REF]: { state: "approved", decidedBy: "", decidedAt: "x" } })).toEqual({});
    expect(readAskOutcomes([1, 2])).toEqual({});
  });
});

describe("Who a draft waits for (XA · AS4 owner name)", () => {
  const record = (facts: Record<string, unknown>, people: Array<{ name: string; roleTitle: string | null; active?: boolean; verified?: boolean }> = []) => ({
    facts: Object.fromEntries(Object.entries(facts).map(([key, value]) => [key, { value }])),
    people: people.map(person => ({ active: true, verified: true, ...person })),
  });
  it("reads the owner recipient's name, else a verified person titled Owner, never an email", () => {
    expect(askOwnerName(record({ owner_recipient: { email: "lin@example.test", name: "Dr. Amy Lin" } }))).toBe("Dr. Amy Lin");
    expect(askOwnerName(record({ owner_recipient: { email: "lin@example.test" } }, [{ name: "Amy Lin", roleTitle: "Owner" }]))).toBe("Amy Lin");
    expect(askOwnerName(record({}, [{ name: "Amy Lin", roleTitle: "Owner", verified: false }, { name: "Sam", roleTitle: "Front desk" }]))).toBeNull();
    expect(askOwnerName(null)).toBeNull();
    expect(readAskOwner({ name: "Dr. Lin" })).toBe("Dr. Lin");
    expect(readAskOwner({ name: "bad\nname" })).toBeNull();
  });
});

describe("Ideas to start from (XA · AS1)", () => {
  it("say which System each touches and what asking does", () => {
    const ideas = askIdeas({ businessName: "Harbor Dental" });
    expect(ideas.map(idea => idea.kind)).toEqual(["record", "changes", "record"]);
    expect(ideas.every(idea => idea.effect.length > 0)).toBe(true);
    expect(askSuggestions({ businessName: "Harbor Dental" })).toEqual(ideas.map(idea => idea.text));
    expect(askIdeas({ systemName: "Website", systemKind: "website", aboutSystem: true })[0]).toMatchObject({ kind: "website", effect: "Reads it as visitors see it" });
    expect(readAskIdeas(ideas)).toEqual(ideas);
    expect(readAskIdeas([{ text: "ok", kind: "Bad Kind" }])).toEqual([{ text: "ok", kind: "website", effect: null }]);
    expect(readAskIdeas([{ text: "" }])).toBeNull();
  });
});

describe("One initials rule", () => {
  it("uses the surname for someone known by a title, else the first letter", () => {
    expect(xaInitialOf("Dr. Amy Lin")).toBe("L");
    expect(xaInitialOf("Dr. Lin")).toBe("L");
    expect(xaInitialOf("Dr Lin")).toBe("L");
    expect(xaInitialOf("Maya Okafor")).toBe("M");
    expect(xaInitialOf("North Studio")).toBe("N");
    expect(xaInitialOf("")).toBe("·");
  });
});
