import { describe, expect, it } from "vitest";
import {
  APPLICATION_VERSION_HISTORY_LIMIT,
  applicationSpecSchema,
  type ApplicationRecord,
} from "@/products/applications/contracts";
import {
  currentRelease,
  applyLegacyApplicationCommand,
  publishCandidate,
  rehearseCandidate,
  reviseCandidate,
  rollbackRelease,
  validateRecord,
  type ApplicationState,
} from "@/products/applications/domain";

const publication = { at: "2026-09-22T12:00:00.000Z", by: "owner" };
const spec = applicationSpecSchema.parse({
  title: "Requests",
  maintenanceOwner: "owner",
  fields: [{ id: "subject", label: "Subject", type: "text", required: true }],
  components: [{ kind: "form", fields: ["subject"] }],
});

function draft(): ApplicationState {
  return {
    candidate: { designRevision: 1, specVersion: 1, spec, rehearsal: null },
    versions: [{ version: 1, spec }],
    releases: [],
    currentReleaseVersion: null,
    records: [],
    recordsRevision: 0,
    status: "draft",
    history: [],
    legacyRevision: 0,
  };
}

function released(): ApplicationState {
  return publishCandidate(
    rehearseCandidate(draft(), { expectedDesignRevision: 1 }),
    { expectedCandidateRevision: 1, expectedReleaseVersion: null },
    publication,
  );
}

describe("native application domain", () => {
  it("revises a candidate without changing the input, live release, or records", () => {
    const original = released();
    original.records = [{ id: "record-1", values: { subject: "Existing request" } }];
    original.recordsRevision = 1;
    const before = structuredClone(original);
    const next = reviseCandidate(original, {
      expectedDesignRevision: 1,
      spec: { ...spec, title: "Requests v2" },
    });

    expect(original).toEqual(before);
    expect(next.candidate).toMatchObject({ designRevision: 2, specVersion: 2, rehearsal: null });
    expect(currentRelease(next)).toEqual(currentRelease(original));
    expect(next.records).toEqual(original.records);
    expect(next.recordsRevision).toBe(1);
    expect(next.records).not.toBe(original.records);
  });

  it("rejects stale revisions and unaccepted maintenance handoffs without mutation", () => {
    const original = draft();
    const before = structuredClone(original);
    expect(() => reviseCandidate(original, { expectedDesignRevision: 0, spec })).toThrow("candidate changed");
    expect(() => reviseCandidate(original, {
      expectedDesignRevision: 1,
      spec: { ...spec, maintenanceOwner: "other" },
    })).toThrow("accepted handoff");
    expect(original).toEqual(before);
  });

  it("records failed compatibility checks without publishing or mutating the candidate", () => {
    const original = draft();
    original.records = [{ id: "legacy", values: { undeclared: "value" } }];
    const next = rehearseCandidate(original, { expectedDesignRevision: 1 });
    expect(next.candidate.rehearsal?.checks).toContainEqual({ name: "Existing records fit this version", passed: false });
    expect(original.candidate.rehearsal).toBeNull();
    expect(() => publishCandidate(next, {
      expectedCandidateRevision: 1, expectedReleaseVersion: null,
    }, publication)).toThrow("passing rehearsal");
    expect(next.releases).toEqual([]);
  });

  it("rechecks records accepted after a passing rehearsal", () => {
    const original = rehearseCandidate(draft(), { expectedDesignRevision: 1 });
    original.records = [{ id: "late-record", values: { subject: 123 } }];
    const before = structuredClone(original);
    expect(() => publishCandidate(original, {
      expectedCandidateRevision: 1, expectedReleaseVersion: null,
    }, publication)).toThrow("wrong type");
    expect(original).toEqual(before);
  });

  it("uses explicit publication evidence and rejects stale release versions", () => {
    const original = rehearseCandidate(draft(), { expectedDesignRevision: 1 });
    const input = { expectedCandidateRevision: 1, expectedReleaseVersion: null };
    expect(publishCandidate(original, input, publication)).toEqual(publishCandidate(original, input, publication));
    expect(currentRelease(publishCandidate(original, input, publication))).toMatchObject({
      version: 1, publishedAt: publication.at, publishedBy: publication.by, provenance: "published",
    });
    expect(() => publishCandidate(original, { ...input, expectedReleaseVersion: 1 }, publication)).toThrow("release changed");
    expect(original.releases).toEqual([]);
  });

  it("rolls back the definition while retaining all records and release history", () => {
    const v1 = released();
    const candidate = rehearseCandidate(reviseCandidate(v1, {
      expectedDesignRevision: 1, spec: { ...spec, title: "Requests v2" },
    }), { expectedDesignRevision: 2 });
    const v2 = publishCandidate(candidate, { expectedCandidateRevision: 2, expectedReleaseVersion: 1 }, publication);
    v2.records = [{ id: "record-1", values: { subject: "Retained request" } }];
    v2.recordsRevision = 1;
    const before = structuredClone(v2);
    const next = rollbackRelease(v2, { expectedDesignRevision: 2, expectedReleaseVersion: 2, version: 1 });
    expect(currentRelease(next)?.version).toBe(1);
    expect(next.candidate.designRevision).toBe(3);
    expect(next.records).toEqual(v2.records);
    expect(next.recordsRevision).toBe(1);
    expect(next.releases).toEqual(v2.releases);
    expect(v2).toEqual(before);
  });

  it("rejects incompatible rollback and exhausted history without partial changes", () => {
    const original = released();
    original.records = [{ id: "record-1", values: { subject: 123 } }];
    const before = structuredClone(original);
    expect(() => rollbackRelease(original, {
      expectedDesignRevision: 1, expectedReleaseVersion: 1, version: 1,
    })).toThrow("wrong type");
    expect(original).toEqual(before);

    const full = draft();
    full.versions = Array.from({ length: APPLICATION_VERSION_HISTORY_LIMIT }, (_, i) => ({ version: i + 1, spec }));
    const fullBefore = structuredClone(full);
    expect(() => reviseCandidate(full, { expectedDesignRevision: 1, spec })).toThrow("history limit");
    expect(full).toEqual(fullBefore);
  });

  const invalidRecords: Array<[ApplicationRecord["values"], string]> = [
    [{ subject: "A", deadline: "2026-02-30", status: "open" }, "real date"],
    [{ subject: "A", deadline: "2026-02-28", status: "unknown" }, "available options"],
    [{ subject: "A", deadline: "2026-02-28", status: "open", hidden: "B" }, "unknown fields"],
  ];
  it.each(invalidRecords)("rejects invalid declared record values", (values, message) => {
    const fields = applicationSpecSchema.parse({
      ...spec,
      fields: [...spec.fields,
        { id: "deadline", label: "Deadline", type: "date", required: true },
        { id: "status", label: "Status", type: "select", options: ["open", "closed"], required: true },
      ],
    });
    expect(() => validateRecord(fields, { id: "record-1", values })).toThrow(message);
  });
});


describe("legacy application command rules", () => {
  it("rejects a data-breaking legacy edit immediately without changing the live app", () => {
    const original = released();
    original.records = [{ id: "existing", values: { subject: "Existing request" } }];
    const before = structuredClone(original);
    const incompatible = { ...spec, fields: [{ ...spec.fields[0]!, type: "number" as const }] };
    expect(() => applyLegacyApplicationCommand(original, { kind: "revise", expectedRevision: 0, spec: incompatible }, "owner", publication.at)).toThrow("wrong type");
    expect(original).toEqual(before);
  });

  it("keeps the explicit draft path distinct from legacy immediate validation", () => {
    const original = released();
    original.records = [{ id: "existing", values: { subject: "Existing request" } }];
    const incompatible = { ...spec, fields: [{ ...spec.fields[0]!, type: "number" as const }] };
    const proposed = reviseCandidate(original, { expectedDesignRevision: 1, spec: incompatible });
    expect(currentRelease(proposed)).toEqual(currentRelease(original));
    expect(rehearseCandidate(proposed, { expectedDesignRevision: 2 }).candidate.rehearsal?.checks.some(check => !check.passed)).toBe(true);
  });

  it("requires the legacy revision and preserves state after rejection", () => {
    const original = draft();
    expect(() => applyLegacyApplicationCommand(original, { kind: "retire", expectedRevision: 7 }, "owner", publication.at)).toThrow("work changed");
    expect(original.status).toBe("draft");
  });

  it("uses the provided publication identity and time without mutating rehearsal state", () => {
    const original = rehearseCandidate(draft(), { expectedDesignRevision: 1 });
    const before = structuredClone(original);
    const installed = applyLegacyApplicationCommand(original, { kind: "install", expectedRevision: 0 }, "owner", publication.at);
    expect(currentRelease(installed)).toMatchObject({ publishedBy: "owner", publishedAt: publication.at });
    expect(original).toEqual(before);
    expect(installed.status).toBe("installed");
  });
});
