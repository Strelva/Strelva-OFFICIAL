import { describe, expect, it } from "vitest";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import type { InquiryLivePublisher } from "@/products/inquiries/contracts";

const FIRST = "2026-09-11T14:00:00.000Z";
const SECOND = "2026-09-11T14:01:00.000Z";
const FIELDS = { name: "Alex Buyer", email: "alex@example.com", phone: "", message: "I would like more information." };

function createEngine(publisher?: InquiryLivePublisher): InquiryEngine {
  let sequence = 0;
  return new InquiryEngine({
    businessId: "buffalo-realty",
    now: () => FIRST,
    idFactory: (prefix) => `${prefix}_${++sequence}`,
    livePublisher: publisher,
  });
}

function draftEngine(publisher?: InquiryLivePublisher) {
  const engine = createEngine(publisher);
  const work = engine.start({ actorId: "owner", intent: "seller inquiry" });
  const accepted = engine.acceptShape(work.id, { actorId: "owner" });
  const connected = engine.setEmailConnection(work.id, { actorId: "owner", status: "connected", consent: "explicit", lastCheckedAt: FIRST });
  return { engine, work: connected.work, capabilityId: accepted.capabilityId };
}

describe("inquiry domain engine", () => {
  it("restores prior content as a new version that can be reloaded", async () => {
    const { engine, work, capabilityId } = draftEngine({ async publish(input) { return { status: "accepted", acceptanceId: `accepted:${input.version}`, acceptedAt: FIRST }; } });
    const originalTitle = work.draft!.form.title;
    engine.runRehearsal(work.id);
    engine.approvePublish(work.id, { actorId: "owner" });
    await engine.publish(work.id, { actorId: "owner", explicit: true });
    engine.recordPublishVerification(work.id, { actorId: "owner", version: work.draft!.version, verified: true, evidence: ["Fixture target read back"] });
    engine.applyDraftEdit(work.id, { actorId: "owner", source: "manual", path: "form.title", after: "An updated headline" });
    engine.runRehearsal(work.id);
    engine.approvePublish(work.id, { actorId: "owner" });
    const changed = await engine.publish(work.id, { actorId: "owner", explicit: true });
    engine.recordPublishVerification(work.id, { actorId: "owner", version: changed.receipt.targetVersion, verified: true, evidence: ["Updated fixture target read back"] });
    const undone = await engine.undo(work.id, { actorId: "owner", explicit: true });
    const reloaded = new InquiryEngine({ businessId: "buffalo-realty", state: engine.snapshot() });
    expect(reloaded.getCapability(capabilityId).live?.form.title).toBe(originalTitle);
    expect(reloaded.getCapability(capabilityId).live?.version).toBe(undone.receipt.targetVersion);
    expect(undone.receipt.targetVersion).toBeGreaterThan(changed.receipt.targetVersion);
  });

  it("returns a shape with safe defaults before creating any draft", () => {
    const engine = createEngine();
    const work = engine.start({ actorId: "owner", intent: "seller inquiry" });
    expect(work.shape.status).toBe("proposed");
    expect(work.shape.defaults.destination).toBe("your team");
    expect(work.shape.title).toBe("Seller inquiries");
    expect(work.draft).toBeNull();
  });

  it("runs eight required checks with no live artifacts", () => {
    const { engine, work } = draftEngine();
    const run = engine.runRehearsal(work.id);
    expect(run.checks).toHaveLength(8);
    expect(run.checks.every((check) => check.status === "passed")).toBe(true);
    expect(run.passed).toBe(true);
    expect(run.passedCount).toBe(8);
    expect(run.totalCount).toBe(8);
    expect(run.externalWritesBlocked).toBe(true);
    expect(run.nothingLive).toBe(true);
    expect(engine.listInquiryRecords()).toHaveLength(0);
  });

  it("groups manual and words edits into one component receipt atomically", () => {
    const { engine, work } = draftEngine();
    const before = engine.snapshot();
    const result = engine.applyDraftEdits(work.id, [
      { actorId: "owner", source: "manual", path: "form.title", after: "A better seller form" },
      { actorId: "owner", source: "words", path: "form.intro", after: "Tell a first time buyer what happens next." },
    ]);
    const formItem = result.receipt.items.find((item) => item.path === "form");
    expect(formItem?.sources).toEqual(["manual", "words"]);
    expect(result.receipt.summary).toContain("1 form");
    expect(result.receipt.summary).not.toContain("2 form");

    expect(() => engine.applyDraftEdits(work.id, [
      { actorId: "owner", source: "manual", path: "form.title", after: "another title" },
      { actorId: "owner", source: "manual", path: "form.component", after: "untrusted_component" },
    ])).toThrow();
    expect(engine.snapshot().requests[0]?.draft?.form.title).toBe("A better seller form");
    expect(engine.snapshot().changes).toHaveLength(before.changes.length);
  });

  it("requires exact versions and records accepted provider writes once", async () => {
    let calls = 0;
    const { engine, work, capabilityId } = draftEngine({
      async publish(input) {
        calls += 1;
        return { status: "accepted", acceptanceId: `accepted-${calls}`, acceptedAt: SECOND, providerReceipt: { isolated: true, capabilityId: input.capabilityId } };
      },
    });
    const run = engine.runRehearsal(work.id);
    expect(run.passed).toBe(true);
    const version = engine.getWork(work.id).draft!.version;
    engine.approvePublish(work.id, { actorId: "owner", version });
    const published = await engine.publish(work.id, { actorId: "owner", version, explicit: true });
    expect(published.provider.status).toBe("accepted");
    expect(calls).toBe(1);
    engine.recordPublishVerification(work.id, { actorId: "owner", version, verified: false, evidence: ["Provider accepted, but read back content did not match."] });
    const replay = await engine.publish(work.id, { actorId: "owner", version, explicit: true });
    expect(replay.provider.status).toBe("accepted");
    expect(calls).toBe(1);

    expect(() => engine.receiveInquiry({ capabilityId, expectedCapabilityVersion: version - 1, fields: FIELDS })).toThrow();
    const record = engine.receiveInquiry({ capabilityId, expectedCapabilityVersion: version, fields: FIELDS, inquiryId: "inquiry_one" });
    expect(record.id).toBe("inquiry_one");
  });

  it("keeps incoming records when an accepted live configuration is undone", async () => {
    let calls = 0;
    const { engine, work, capabilityId } = draftEngine({
      async publish() {
        calls += 1;
        return { status: "accepted", acceptanceId: `accepted-${calls}`, acceptedAt: SECOND };
      },
    });
    engine.runRehearsal(work.id);
    const version = engine.getWork(work.id).draft!.version;
    engine.approvePublish(work.id, { actorId: "owner", version });
    const published = await engine.publish(work.id, { actorId: "owner", version, explicit: true });
    engine.recordPublishVerification(work.id, { actorId: "owner", version, verified: true, evidence: ["Read back the exact accepted definition from the provider."] });
    engine.receiveInquiry({ capabilityId, expectedCapabilityVersion: version, fields: FIELDS, inquiryId: "inquiry_keep" });
    const sourceBeforeUndo = engine.listChanges(capabilityId).find((change) => change.id === published.receipt.id)!;
    const changesBeforePlan = engine.listChanges(capabilityId).length;
    const plan = engine.prepareUndo(work.id);
    expect(plan.preservesInquiryIds).toEqual(["inquiry_keep"]);
    expect(engine.listChanges(capabilityId)).toHaveLength(changesBeforePlan);
    expect(engine.listChanges(capabilityId).find((change) => change.id === sourceBeforeUndo.id)?.undoAvailable).toBe(true);

    const undone = await engine.undo(work.id, { actorId: "owner", explicit: true });
    expect(undone.provider.status).toBe("accepted");
    engine.recordPublishVerification(work.id, { actorId: "owner", version: undone.receipt.targetVersion, verified: true, evidence: ["Read back the removed capability configuration from the provider."] });
    expect(engine.getCapability(capabilityId).live).toBeNull();
    expect(engine.listInquiryRecords(capabilityId).map((record) => record.id)).toEqual(["inquiry_keep"]);
    expect(calls).toBe(2);
  });

  it("records the exact staff assignee in the grouped change and restores it on undo", async () => {
    const { engine, work, capabilityId } = draftEngine({
      async publish() { return { status: "accepted", acceptanceId: "accepted-assignment", acceptedAt: SECOND }; },
    });
    engine.runRehearsal(work.id);
    const version = engine.getWork(work.id).draft!.version;
    engine.approvePublish(work.id, { actorId: "owner", version });
    await engine.publish(work.id, { actorId: "owner", version, explicit: true });
    const record = engine.receiveInquiry({ capabilityId, expectedCapabilityVersion: version, fields: FIELDS, inquiryId: "assign_one" });

    const assigned = engine.bulkUpdateInquiries({ inquiryIds: [record.id], actorId: "staff-one", assigneeId: "staff-one", status: "assigned", why: "Staff accepted this request." });
    expect(engine.listInquiryRecords()[0]).toMatchObject({ status: "assigned", assigneeId: "staff-one" });
    expect(assigned.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "inquiries.assign_one.status", after: "assigned" }),
      expect.objectContaining({ path: "inquiries.assign_one.assigneeId", after: "staff-one" }),
    ]));
    expect(assigned.summary).toBe("1 inquiry record");

    engine.undoBulkChange(assigned.id, { actorId: "owner", now: SECOND });
    expect(engine.listInquiryRecords()[0]).toMatchObject({ status: "new", assigneeId: null });
  });

  it("rejects a stale assignment undo atomically and records reassignment attribution", async () => {
    const { engine, work, capabilityId } = draftEngine({
      async publish() { return { status: "accepted", acceptanceId: "accepted-reassignment", acceptedAt: SECOND }; },
    });
    engine.runRehearsal(work.id);
    const version = engine.getWork(work.id).draft!.version;
    engine.approvePublish(work.id, { actorId: "owner", version });
    await engine.publish(work.id, { actorId: "owner", version, explicit: true });
    const record = engine.receiveInquiry({ capabilityId, expectedCapabilityVersion: version, fields: FIELDS, inquiryId: "assign_twice" });

    const first = engine.bulkUpdateInquiries({ inquiryIds: [record.id], actorId: "staff-a", assigneeId: "staff-a", status: "assigned", why: "Staff A accepted this request." });
    const timelineBeforeReassignment = engine.snapshot().timeline.filter((event) => event.inquiryId === record.id).length;
    const second = engine.bulkUpdateInquiries({ inquiryIds: [record.id], actorId: "staff-b", assigneeId: "staff-b", status: "assigned", why: "Staff B took responsibility." });
    const reassignedTimeline = engine.snapshot().timeline.filter((event) => event.inquiryId === record.id);
    expect(reassignedTimeline).toHaveLength(timelineBeforeReassignment + 1);
    expect(reassignedTimeline.at(-1)?.summary).toBe("Assigned this inquiry to staff-b.");

    expect(() => engine.undoBulkChange(first.id, { actorId: "owner" })).toThrow("Undo its current change first");
    expect(engine.listInquiryRecords()[0]).toMatchObject({ status: "assigned", assigneeId: "staff-b" });

    engine.undoBulkChange(second.id, { actorId: "owner" });
    expect(engine.listInquiryRecords()[0]).toMatchObject({ status: "assigned", assigneeId: "staff-a" });
    engine.undoBulkChange(first.id, { actorId: "owner" });
    expect(engine.listInquiryRecords()[0]).toMatchObject({ status: "new", assigneeId: null });
  });

  it("keeps Why causal claims tied to timeline links", async () => {
    const { engine, work, capabilityId } = draftEngine({
      async publish() {
        return { status: "accepted", acceptanceId: "why-accepted", acceptedAt: SECOND };
      },
    });
    const run = engine.runRehearsal(work.id);
    expect(run.passed).toBe(true);
    const version = engine.getWork(work.id).draft!.version;
    engine.approvePublish(work.id, { actorId: "owner", version });
    await engine.publish(work.id, { actorId: "owner", version, explicit: true });
    engine.recordPublishVerification(work.id, { actorId: "owner", version, verified: true, evidence: ["Read back exact definition."] });
    const record = engine.receiveInquiry({ capabilityId, expectedCapabilityVersion: version, fields: FIELDS, inquiryId: "why_one" });
    const bounced = engine.recordInquiryEvent(record.id, { type: "notification_bounced", actor: { kind: "strelva", id: "mailer", label: "Strelva" }, summary: "The routing notification bounced.", outcome: "blocked", evidence: ["mailbox rejected the address"] });
    engine.recordInquiryEvent(record.id, { type: "follow_up_blocked", actor: { kind: "strelva", id: "follow-up", label: "Strelva" }, summary: "Follow-up was blocked after the bounce.", causedByEventId: bounced.id, outcome: "blocked", evidence: ["the notification attempt failed"] });
    const why = engine.explainWhy(record.id);
    expect(why.summary).toContain("Because of that");
    expect(why.fix?.targetPath).toBe("routing.destination");
  });

  it("starts responsibility supervised and requires sponsor approval, evidence, and budget", () => {
    const { engine, work } = draftEngine();
    const policy = engine.createResponsibility({
      actorId: "owner",
      capabilityId: work.capabilityId,
      title: "Follow up on inquiries",
      scope: "Reply to new inquiries during business hours.",
      allowedActions: ["send_message"],
      preAuthorizedActions: ["send_message"],
      escalation: { primary: "owner", secondary: null },
      budget: { dailyMessages: 1, timezone: "UTC" },
      hours: { timezone: "UTC", days: [5], start: "13:00", end: "16:00" },
    });
    expect(policy.trust).toBe("supervised");
    expect(engine.evaluateResponsibilityAction(policy.id, "send_message", { at: FIRST, messageBody: "This is from Strelva." }).decision).toBe("approval_required");
    expect(() => engine.recordResponsibilityAction({ responsibilityId: policy.id, action: "send_message", actorId: "strelva", at: FIRST, what: "Sent a reply.", why: "The customer asked a question.", approvedBy: "owner", outcome: "accepted", idempotencyKey: "message-one" })).toThrow();
    const accepted = engine.recordResponsibilityAction({ responsibilityId: policy.id, action: "send_message", actorId: "strelva", at: FIRST, what: "Sent a reply.", why: "The customer asked a question.", approvedBy: "owner", outcome: "accepted", outcomeEvidence: ["Provider accepted message-one"], messageBody: "This is from Strelva.", idempotencyKey: "message-one" });
    expect(accepted.status).toBe("accepted");
    expect(engine.promoteResponsibility(policy.id, "owner").trust).toBe("trusted");
    expect(engine.evaluateResponsibilityAction(policy.id, "send_message", { at: FIRST, messageBody: "This is from Strelva." }).decision).toBe("block");
    engine.pauseResponsibility(policy.id, "owner");
    expect(engine.evaluateResponsibilityAction(policy.id, "send_message", { at: FIRST, messageBody: "This is from Strelva." }).reason).toContain("paused");
  });

  it("rejects nested foreign definitions when loading state", () => {
    const { engine, work } = draftEngine();
    const state = engine.snapshot();
    state.requests[0]!.draft!.businessId = "other-business";
    expect(() => new InquiryEngine({ businessId: "buffalo-realty", state })).toThrow();
    expect(work.draft?.businessId).toBe("buffalo-realty");
  });

  it("proves removed optional steps produce no messages or follow-up", () => {
    const engine = createEngine();
    const work = engine.start({ actorId: "owner", intent: "seller inquiry" });
    engine.acceptShape(work.id, { actorId: "owner", selectedLineIds: ["form", "record"] });
    const run = engine.runRehearsal(work.id);
    expect(run.passed).toBe(true);
    expect(run.totalCount).toBe(8);
    expect(run.testInbox).toEqual([]);
    expect(run.outboundMessages).toEqual([]);
    expect(run.fastForwardMinutes).toBe(0);
    expect(run.checks.find((check) => check.id === "follow_up_scheduled")?.detail).toContain("No follow-up was scheduled");
  });

  it("does not retry an ambiguous provider outcome", async () => {
    let calls = 0;
    const { engine, work } = draftEngine({
      async publish() {
        calls += 1;
        throw new Error("connection closed after write");
      },
    });
    engine.runRehearsal(work.id);
    const version = engine.getWork(work.id).draft!.version;
    engine.approvePublish(work.id, { actorId: "owner", version });
    const first = await engine.publish(work.id, { actorId: "owner", version, explicit: true });
    expect(first.retryable).toBe(false);
    expect(first.provider.status).toBe("failed");
    await expect(engine.publish(work.id, { actorId: "owner", version, explicit: true })).rejects.toThrow("ambiguous");
    expect(calls).toBe(1);
  });

  it("requires explicit connection changes and concrete verification evidence", async () => {
    let calls = 0;
    const { engine, work } = draftEngine({
      async publish() {
        calls += 1;
        return { status: "accepted", acceptanceId: `accepted-${calls}`, acceptedAt: SECOND };
      },
    });
    expect(() => engine.applyDraftEdit(work.id, { actorId: "owner", source: "manual", path: "connections.0.status", after: "connected" })).toThrow();
    engine.runRehearsal(work.id);
    const version = engine.getWork(work.id).draft!.version;
    engine.approvePublish(work.id, { actorId: "owner", version });
    await engine.publish(work.id, { actorId: "owner", version, explicit: true });
    await expect(Promise.resolve().then(() => engine.recordPublishVerification(work.id, { actorId: "owner", version, verified: true, evidence: [] }))).rejects.toThrow("evidence");
  });

  it("replays completed responsibility actions by idempotency key", () => {
    const { engine, work } = draftEngine();
    const policy = engine.createResponsibility({ actorId: "owner", capabilityId: work.capabilityId, title: "Reply", scope: "Reply to inquiries.", allowedActions: ["send_message"], preAuthorizedActions: ["send_message"], escalation: { primary: "owner", secondary: null }, hours: { timezone: "UTC", days: [5], start: "13:00", end: "16:00" } });
    const input = { responsibilityId: policy.id, action: "send_message" as const, actorId: "strelva", at: FIRST, what: "Sent a reply.", why: "The customer asked.", approvedBy: "owner", outcome: "accepted" as const, outcomeEvidence: ["Provider accepted the message."], messageBody: "This is from Strelva.", idempotencyKey: "same-action" };
    const first = engine.recordResponsibilityAction(input);
    const second = engine.recordResponsibilityAction(input);
    expect(second.id).toBe(first.id);
    expect(engine.snapshot().responsibilityReceipts).toHaveLength(1);
  });

  it("keeps an Inspector request attached to the selected inquiry version", async () => {
    const { engine, work, capabilityId } = draftEngine({
      async publish(input) {
        return { status: "accepted", acceptanceId: `context-${input.version}`, acceptedAt: SECOND };
      },
    });
    engine.runRehearsal(work.id);
    const version = engine.getWork(work.id).draft!.version;
    engine.approvePublish(work.id, { actorId: "owner", version });
    await engine.publish(work.id, { actorId: "owner", version, explicit: true });
    engine.recordPublishVerification(work.id, { actorId: "owner", version, verified: true, evidence: ["Read back the isolated fixture definition."] });
    const inquiry = engine.receiveInquiry({ capabilityId, expectedCapabilityVersion: version, fields: FIELDS, inquiryId: "context_inquiry" });

    const contextual = engine.startContextualRequest({ actorId: "owner", inquiryId: inquiry.id, intent: "Prepare a bounded response for this inquiry." });
    expect(contextual.context).toEqual({ kind: "inquiry", inquiryId: inquiry.id, capabilityId, capabilityVersion: version });
    expect(engine.snapshot().actionReceipts.find((receipt) => receipt.action === "start_contextual_request")).toMatchObject({ inquiryId: inquiry.id, requestId: contextual.id, outcome: "recorded" });
    expect(new InquiryEngine({ businessId: "buffalo-realty", state: engine.snapshot() }).getWork(contextual.id).context?.capabilityVersion).toBe(version);

  });

  it("edits routing and follow-up as one versioned rules receipt and reruns rehearsal", () => {
    const { engine, work } = draftEngine();
    const initialVersion = work.draft!.version;
    const firstRun = engine.runRehearsal(work.id);
    const result = engine.updateInquiryRules(work.id, {
      actorId: "owner",
      source: "words",
      routing: { destination: "new-owner@example.test", withinMinutes: 25 },
      followUp: { afterMinutes: 120, maxAttempts: 2, messageTemplate: "Hello {name}, this is Strelva checking in." },
    });

    expect(result.work.draft?.version).toBe(initialVersion + 5);
    expect(result.work.draft?.routing?.sentence).toContain("new-owner@example.test");
    expect(result.work.draft?.routing?.sentence).toContain("25 minutes");
    expect(result.work.draft?.followUp?.sentence).toContain("2 hours");
    expect(result.receipt.items.filter((item) => item.kind === "routing_rule" || item.kind === "follow_up_rule")).toHaveLength(2);
    expect(firstRun.definitionVersion).toBe(initialVersion);
    const latest = engine.snapshot().rehearsalRuns.find((run) => run.requestId === work.id && run.definitionVersion === result.work.draft?.version);
    expect(latest?.definitionVersion).toBe(result.work.draft?.version);
    expect(latest?.passed).toBe(true);

    const savedVersion = result.work.draft!.version;
    expect(() => engine.updateInquiryRules(work.id, { actorId: "owner", followUp: { messageTemplate: "" } })).toThrow();
    expect(engine.getWork(work.id).draft?.version).toBe(savedVersion);
  });

  it("records responsibility edits and keeps trust supervised on every boundary change", () => {
    const { engine, work } = draftEngine();
    const policy = engine.createResponsibility({
      actorId: "owner",
      capabilityId: work.capabilityId,
      title: "Handle seller inquiries",
      scope: "Route new seller inquiries during business hours.",
      allowedActions: ["send_message", "schedule_follow_up"],
      preAuthorizedActions: ["schedule_follow_up"],
      escalation: { primary: "owner", secondary: null },
      hours: { timezone: "UTC", days: [5], start: "13:00", end: "16:00" },
    });
    const updated = engine.updateResponsibility(policy.id, {
      actorId: "owner",
      scope: "Route and follow up on seller inquiries during approved hours.",
      budget: { dailyMessages: 4, timezone: "UTC" },
      voice: "Clear and direct.",
      requiredCleanReceipts: 2,
    });
    expect(updated.scope).toContain("follow up");
    expect(updated.budget.dailyMessages).toBe(4);
    expect(updated.trust).toBe("supervised");
    expect(engine.snapshot().actionReceipts.find((receipt) => receipt.action === "update_responsibility")).toMatchObject({ responsibilityId: policy.id, outcome: "recorded" });

    expect(() => engine.updateResponsibility(policy.id, { actorId: "owner", allowedActions: ["send_message"], preAuthorizedActions: ["schedule_follow_up"] })).toThrow("inside the allowed actions");
    expect(engine.snapshot().responsibilities.find((item) => item.id === policy.id)?.budget.dailyMessages).toBe(4);
    expect(() => engine.updateResponsibility(policy.id, { actorId: "owner", scope: "", budget: { dailyMessages: 99 } })).toThrow("responsibility scope");
    expect(engine.snapshot().responsibilities.find((item) => item.id === policy.id)).toMatchObject({ scope: "Route and follow up on seller inquiries during approved hours.", budget: { dailyMessages: 4 } });
  });
});
