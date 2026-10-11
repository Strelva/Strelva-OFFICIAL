import { describe, expect, it } from "vitest";
import { actorCopy, actorPresentation, actorSentence, recordedActor } from "@/platform/presentation/actor";
import { handledFromStore, handledFromTenantEvent } from "@/platform/needs-you/handled";
import { handledReceiptSchema } from "@/platform/needs-you/contracts";
import type { UnifiedEvent } from "@/lib/types";

const row = { store: "business_record_revisions", id: "1", at: "2026-10-09T12:00:00Z", changes: ["fact:hours"], undo: "undo" };

describe("recorded actor presentation", () => {
  it.each([
    [{ kind: "platform" }, "Strelva", null],
    [{ kind: "agency", displayName: "Acme Marketing" }, "Acme Marketing", "Runs on Strelva"],
    [{ kind: "agency", displayName: "Strelva Agency" }, "Strelva Agency", "Runs on Strelva"],
    [{ kind: "agency", displayName: "Strelva creative Agency" }, "Strelva creative Agency", "Runs on Strelva"],
    [{ kind: "agency", displayName: "Strelva" }, "Strelva", "Runs on Strelva"],
    [{ kind: "person", displayName: "Sheri" }, "Sheri", null],
    [{ kind: "operator", displayName: "Jacob" }, "Jacob (platform support)", null],
    [{ kind: "operator" }, "Platform operator (support)", null],
  ])("presents %j without changing who acted", (actor, name, credit) => {
    expect(actorPresentation(actor)).toEqual({ name, credit });
    const sentence = actorSentence(actor, "updated your hours");
    expect(sentence).toBe(`${name} updated your hours`);
    expect(actorCopy(sentence, actor)).toBe(sentence);
    const adapted = actorCopy("Strelva updated your hours", actor);
    expect(adapted).toBe(sentence);
    expect(actorCopy(adapted, actor)).toBe(sentence);
  });

  it.each([undefined, null, "strelva", { kind: "agency", displayName: "  " }, { kind: "person", userId: "person-id" }, { kind: "agent" }])("keeps missing/invalid attribution neutral: %j", actor => {
    expect(recordedActor(actor)).toBeNull();
    expect(actorPresentation(actor)).toEqual({ name: null, credit: null });
    expect(actorSentence(actor, "updated your hours")).toBe("Updated your hours");
    expect(actorCopy("Strelva updated your hours", actor)).toBe("Updated your hours");
    expect(actorCopy(actorSentence(actor, "updated your hours"), actor)).toBe("Updated your hours");
  });

  it("does not corrupt an attributed agency sentence when metadata is missing", () => {
    expect(actorCopy("Strelva Agency updated your hours", null)).toBe("Strelva Agency updated your hours");
  });

  it("preserves quoted words and mentions of the platform inside an action", () => {
    expect(actorCopy('"Strelva updated your hours"', null)).toBe('"Strelva updated your hours"');
    expect(actorSentence({ kind: "agency", displayName: "Acme" }, "connected your site to Strelva")).toBe("Acme connected your site to Strelva");
    expect(actorCopy("Strelva is finishing the change", null)).toBe("Finishing the change");
  });

  it("uses recorded agency attribution on a receipt and preserves undo", () => {
    const receipt = handledFromStore({ ...row, actor: { kind: "agency", displayName: "Acme Marketing" } });
    expect(handledReceiptSchema.parse(receipt).actor).toEqual({ kind: "agency", displayName: "Acme Marketing" });
    expect(receipt).toMatchObject({ actor: { kind: "agency", displayName: "Acme Marketing" }, sentence: "Acme Marketing updated your hours in your business record", undo: { state: "undo" } });
  });

  it("never treats a source, agency seat or approval as the executor", () => {
    expect(handledFromStore({ ...row, source: "agent", agencyName: "Acme" })?.sentence).toBe("Updated your hours in your business record");
    expect(handledFromStore({ ...row, source: "operator" })?.sentence).toBe("Platform operator (support) updated your hours in your business record");
    expect(handledFromStore({ ...row, source: "operator", actor: { kind: "agency", displayName: "Acme" } })?.sentence).toBe("Platform operator (support) updated your hours in your business record");
    const decision = { store: "owner_decisions", id: "d1", at: row.at, state: "approved", outcome: "done", title: "Update hours", sourceLifecycle: "website_document", decidedByKind: "operator" };
    expect(handledFromStore(decision)?.sentence).toBe('Completed "Update hours" after Platform operator (support) reviewed it.');
    expect(handledFromStore({ ...decision, decidedByKind: null })?.sentence).toBe('Completed "Update hours" after a decision was recorded.');
  });

  it("does not infer an actor from an automatic tenant-event status", () => {
    const event = { id: "e1", type: "content_update", status: "auto_approved", title: "Friday hours", createdAt: row.at, metadata: {} } as UnifiedEvent;
    expect(handledFromTenantEvent(event)?.sentence).toBe("Updated your website: Friday hours");
    expect(handledFromTenantEvent({ ...event, metadata: { actor: { kind: "operator", displayName: "Taylor" } } })?.sentence).toBe("Taylor (platform support) updated your website: Friday hours");
  });
});
