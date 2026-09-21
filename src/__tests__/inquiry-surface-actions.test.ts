import { describe, expect, it } from "vitest";
import { parseInquirySurfaceAction } from "@/products/inquiries/server";
import { InquiryValidationError } from "@/products/inquiries/repository";

describe("inquiry surface action boundary", () => {
  it("replaces browser actor identity and drops forged connection consent", () => {
    expect(parseInquirySurfaceAction({
      kind: "start",
      input: {
        actorId: "attacker",
        intent: "Collect seller inquiries",
        emailConnection: { status: "connected", consent: "explicit", lastCheckedAt: "2099-01-01T00:00:00Z" },
      },
    }, "owner-1", "business-stable")).toEqual({
      kind: "start",
      input: { actorId: "owner-1", intent: "Collect seller inquiries" },
    });
  });

  it.each(["save_state", "make_live", "record_overlay"])("rejects the retired browser authority action %s", (kind) => {
    expect(() => parseInquirySurfaceAction({ kind, state: {}, actorId: "attacker" }, "owner-1", "business-stable"))
      .toThrow(InquiryValidationError);
  });

  it("rejects a pattern target outside the authorized business", () => {
    expect(() => parseInquirySurfaceAction({
      kind: "use-pattern",
      patternId: "pattern-1",
      businessId: "foreign-business",
      actorId: "attacker",
    }, "owner-1", "business-stable")).toThrow("A pattern can only be installed in the selected business.");
  });

  it("binds pattern update commands to the authenticated actor and validates explicit choices", () => {
    expect(parseInquirySurfaceAction({ kind: "propose-pattern-update", installationId: "install-1", capabilityId: "capability-1", actorId: "attacker" }, "owner-1", "business-stable")).toEqual({
      kind: "propose-pattern-update", installationId: "install-1", capabilityId: "capability-1", actorId: "owner-1",
    });
    expect(parseInquirySurfaceAction({ kind: "stage-pattern-update", installationId: "install-1", capabilityId: "capability-1", sourceVersion: 4, resolutions: [{ path: "form.title", choice: "local" }], actorId: "attacker" }, "owner-1", "business-stable")).toEqual({
      kind: "stage-pattern-update", installationId: "install-1", capabilityId: "capability-1", sourceVersion: 4, resolutions: [{ path: "form.title", choice: "local" }], actorId: "owner-1",
    });
    expect(() => parseInquirySurfaceAction({ kind: "stage-pattern-update", installationId: "install-1", capabilityId: "capability-1", sourceVersion: 4, resolutions: [{ path: "form.title", choice: "skip" }], actorId: "attacker" }, "owner-1", "business-stable")).toThrow("local or source");
  });

  it("binds contextual requests and rule edits to the authenticated actor", () => {
    expect(parseInquirySurfaceAction({ kind: "contextual-request", inquiryId: "inquiry-1", intent: "Review this record", actorId: "attacker" }, "owner-1", "business-stable")).toEqual({
      kind: "contextual-request",
      inquiryId: "inquiry-1",
      intent: "Review this record",
      actorId: "owner-1",
    });
    expect(parseInquirySurfaceAction({ kind: "edit-rules", requestId: "request-1", input: { actorId: "attacker", routing: { destination: "owner@example.test", withinMinutes: 15 }, followUp: { afterMinutes: 60, maxAttempts: 1, messageTemplate: "Hello {name}, this is Strelva." } } }, "owner-1", "business-stable")).toMatchObject({
      kind: "edit-rules",
      requestId: "request-1",
      input: { actorId: "owner-1", routing: { destination: "owner@example.test", withinMinutes: 15 } },
    });
  });

  it("accepts only fixed responsibility actions and strips the browser actor", () => {
    const parsed = parseInquirySurfaceAction({
      kind: "update-responsibility",
      responsibilityId: "responsibility-1",
      input: {
        actorId: "attacker",
        scope: "Route seller inquiries.",
        allowedActions: ["send_message", "schedule_follow_up"],
        preAuthorizedActions: ["schedule_follow_up"],
        budget: { dailyMessages: 5, timezone: "UTC" },
        escalation: { primary: "owner", secondary: null },
      },
    }, "owner-1", "business-stable");
    expect(parsed).toMatchObject({ kind: "update-responsibility", responsibilityId: "responsibility-1", input: { actorId: "owner-1", allowedActions: ["send_message", "schedule_follow_up"] } });
    expect(() => parseInquirySurfaceAction({ kind: "update-responsibility", responsibilityId: "responsibility-1", input: { allowedActions: ["run_code"] } }, "owner-1", "business-stable")).toThrow("unsupported action");
  });
});
