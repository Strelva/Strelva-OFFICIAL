import { describe, expect, it } from "vitest";
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import type { InquiryCapabilityDefinition, RehearsalRun } from "@/products/inquiries/contracts";
import {
  commitPatternUpdate,
  listPatternInstallations,
  patternUpdatePublishReadiness,
  proposePatternUpdate,
  resolvePatternUpdate,
  stagePatternUpdate,
} from "@/products/inquiries/inquiry-pattern-updates";

const FIRST = "2026-09-11T15:00:00.000Z";
const SECOND = "2026-09-11T15:01:00.000Z";

function engine(businessId: string): InquiryEngine {
  let sequence = 0;
  return new InquiryEngine({
    businessId,
    now: () => FIRST,
    idFactory: (prefix) => `${prefix}_${++sequence}`,
  });
}

function sourceDefinition(): { source: InquiryEngine; definition: InquiryCapabilityDefinition } {
  const source = engine("source-business");
  const work = source.start({ actorId: "source-owner", intent: "Collect seller inquiries", destination: "private@example.test" });
  const accepted = source.acceptShape(work.id, { actorId: "source-owner" });
  return { source, definition: structuredClone(accepted.draft!) };
}

function installed(): { target: InquiryEngine; source: InquiryEngine; sourceDefinition: InquiryCapabilityDefinition; capabilityId: string } {
  const { source, definition } = sourceDefinition();
  const target = engine("target-business");
  const work = target.copyPattern(definition.id, {
    sourceCapabilityId: definition.id,
    sourceDefinition: definition,
    sourceBusinessId: definition.businessId,
    targetBusinessId: target.businessId,
    targetActorId: "target-owner",
    destination: "target@example.test",
  });
  return { target, source, sourceDefinition: definition, capabilityId: work.capabilityId };
}

describe("inquiry pattern update projection", () => {
  it("registers a source version pin with shape-only data", () => {
    const { target, sourceDefinition: definition, capabilityId } = installed();
    const installation = listPatternInstallations(target)[0]!;

    expect(installation).toMatchObject({
      businessId: "target-business",
      capabilityId,
      sourceBusinessId: "source-business",
      sourceCapabilityId: definition.id,
      sourceVersion: definition.version,
      targetVersion: 1,
      status: "installed",
    });
    const serialized = JSON.stringify(installation);
    expect(serialized).not.toContain("private@example.test");
    expect(serialized).not.toContain("target@example.test");
    expect(Object.hasOwn(installation.lastSourceShape, "connections")).toBe(false);
    expect(Object.hasOwn(installation.lastSourceShape, "inquiries")).toBe(false);
    expect(Object.hasOwn(installation.lastSourceShape, "credentials")).toBe(false);
    expect(Object.hasOwn(installation.lastSourceShape, "grants")).toBe(false);
    const reloaded = new InquiryEngine({ businessId: target.businessId, state: target.snapshot() });
    expect(listPatternInstallations(reloaded)[0]?.sourceVersion).toBe(installation.sourceVersion);
    expect(sourceDefinition).toBeDefined();
  });

  it("keeps local edits and makes overlapping source updates explicit conflicts", () => {
    const { target, sourceDefinition: initial, capabilityId } = installed();
    const work = target.listWorks().find((item) => item.capabilityId === capabilityId)!;
    target.applyDraftEdit(work.id, { actorId: "target-owner", source: "manual", path: "form.title", after: "Target's seller intake" });

    const incoming = structuredClone(initial);
    incoming.version = initial.version + 1;
    incoming.form.title = "Source's improved intake";
    incoming.form.intro = "Explain the next step for a seller.";
    incoming.routing!.withinMinutes = 30;

    const proposal = proposePatternUpdate(target, { capabilityId, sourceDefinition: incoming });
    expect(proposal.status).toBe("conflicted");
    expect(proposal.conflicts).toEqual([expect.objectContaining({ path: "form.title", localValue: "Target's seller intake" })]);
    expect(proposal.preservedLocalPaths).toContain("form.title");
    expect(proposal.nextDefinition.form.title).toBe("Target's seller intake");
    expect(proposal.nextDefinition.form.intro).toBe(incoming.form.intro);
    expect(proposal.nextDefinition.routing?.withinMinutes).toBe(30);
    expect(proposal.nextDefinition.form.fields.find((field) => field.id === "email")?.placeholder).toBe("you@example.com");

    expect(() => resolvePatternUpdate(proposal, [])).toThrow("Resolve every pattern conflict");
    const resolved = resolvePatternUpdate(proposal, [{ path: "form.title", choice: "local" }], SECOND);
    expect(resolved.definition.form.title).toBe("Target's seller intake");
    expect(resolved.definition.form.intro).toBe(incoming.form.intro);
    expect(resolved.definition.routing?.withinMinutes).toBe(30);
    expect(resolved.definition.version).toBe(proposal.targetVersion);
  });

  it("requires an explicit newer source version and an exact isolated rehearsal", () => {
    const { target, sourceDefinition: initial, capabilityId } = installed();
    const same = structuredClone(initial);
    const proposal = proposePatternUpdate(target, { capabilityId, sourceDefinition: same });
    expect(proposal.status).toBe("up_to_date");
    const staleReadiness = patternUpdatePublishReadiness(proposal, null, []);
    expect(staleReadiness.ready).toBe(false);
    expect(staleReadiness.reasons.join(" ")).toContain("not newer");

    const incoming = structuredClone(initial);
    incoming.version += 1;
    incoming.form.intro = "A newer reusable explanation.";
    const newer = proposePatternUpdate(target, { capabilityId, sourceDefinition: incoming });
    const resolved = resolvePatternUpdate(newer, [], SECOND);
    const beforeRehearsal = patternUpdatePublishReadiness(newer, resolved, []);
    expect(beforeRehearsal.ready).toBe(false);
    expect(beforeRehearsal.reasons.join(" ")).toContain("isolated rehearsal");

    const rehearsal = {
      requestId: newer.requestId,
      capabilityId,
      definitionVersion: newer.targetVersion,
      passed: true,
      externalWritesBlocked: true,
      nothingLive: true,
    } as RehearsalRun;
    const afterRehearsal = patternUpdatePublishReadiness(newer, resolved, [rehearsal]);
    expect(afterRehearsal.ready).toBe(true);
  });

  it("advances the pin only after the canonical publish result is supplied", () => {
    const { target, sourceDefinition: initial, capabilityId } = installed();
    const incoming = structuredClone(initial);
    incoming.version += 1;
    incoming.form.intro = "The updated reusable explanation.";
    const proposal = proposePatternUpdate(target, { capabilityId, sourceDefinition: incoming });
    const resolved = resolvePatternUpdate(proposal, [], SECOND);
    const committed = commitPatternUpdate(target, {
      proposal,
      resolution: resolved,
      definition: resolved.definition,
      sourceDefinition: incoming,
      actorId: "target-owner",
      now: SECOND,
    });

    expect(committed.sourceVersion).toBe(incoming.version);
    expect(committed.targetVersion).toBe(proposal.targetVersion);
    expect(committed.status).toBe("installed");
    expect(listPatternInstallations(target)[0]?.lastSourceShape.version).toBe(incoming.version);
  });

  it("stages a resolved update as ordinary work with a pending source handoff", () => {
    const { target, sourceDefinition: initial, capabilityId } = installed();
    const incoming = structuredClone(initial);
    incoming.version += 1;
    incoming.form.intro = "The staged reusable explanation.";
    const proposal = proposePatternUpdate(target, { capabilityId, sourceDefinition: incoming });
    const resolution = resolvePatternUpdate(proposal, [], SECOND);
    const staged = stagePatternUpdate(target, { proposal, resolution, actorId: "target-owner", now: SECOND });

    expect(staged.work.draft?.version).toBe(proposal.targetVersion);
    expect(staged.work.state).toBe("planned");
    expect(staged.change.targetVersion).toBe(proposal.targetVersion);
    expect(listPatternInstallations(target)[0]?.pendingUpdate).toMatchObject({
      proposalId: proposal.id,
      sourceVersion: incoming.version,
      targetVersion: proposal.targetVersion,
    });
  });

  it("applies a source field-list update as one explicit reusable shape", () => {
    const { target, sourceDefinition: initial, capabilityId } = installed();
    const incoming = structuredClone(initial);
    incoming.version += 1;
    incoming.form.fields[0]!.label = "Seller name";
    const proposal = proposePatternUpdate(target, { capabilityId, sourceDefinition: incoming });
    expect(proposal.status).toBe("ready");
    const resolved = resolvePatternUpdate(proposal, [], SECOND);
    const staged = stagePatternUpdate(target, { proposal, resolution: resolved, actorId: "target-owner", now: SECOND });

    expect(staged.work.draft?.form.fields[0]?.label).toBe("Seller name");
  });

  it("rejects private source copy text instead of persisting it", () => {
    const { target, sourceDefinition: initial, capabilityId } = installed();
    const incoming = structuredClone(initial);
    incoming.version += 1;
    incoming.form.intro = "Call private@example.test for help.";
    expect(() => proposePatternUpdate(target, { capabilityId, sourceDefinition: incoming })).toThrow("private or secret data");
  });

  it("does not allocate a target capability when the source projection is rejected", () => {
    const { definition: initial } = sourceDefinition();
    const target = engine("target-business");
    const invalid = structuredClone(initial);
    invalid.form.intro = "Use api_key=real-secret for this pattern.";
    expect(() => target.copyPattern(invalid.id, {
      sourceCapabilityId: invalid.id,
      sourceDefinition: invalid,
      sourceBusinessId: invalid.businessId,
      targetBusinessId: target.businessId,
      targetActorId: "target-owner",
    })).toThrow("private or secret data");
    expect(target.snapshot().capabilities).toHaveLength(0);
    expect(target.snapshot().requests).toHaveLength(0);
    expect(listPatternInstallations(target)).toEqual([]);
  });
});
