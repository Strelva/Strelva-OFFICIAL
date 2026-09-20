import { describe, expect, it, vi } from "vitest";
import {
  ApplicationUseAccessError,
  ApplicationUseConflictError,
  ApplicationUseInputError,
  applicationUseEditSchema,
  createApplicationAccessService,
  type ApplicationUseContext,
  type ApplicationUseGrant,
  type ApplicationUsePersistence,
} from "@/products/applications/access";
import { applicationSpecSchema } from "@/products/applications/contracts";
import { isApplicationDateOnly } from "@/products/applications/date-only";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const staffId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const workId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const grantId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-09-20T12:00:00.000Z");
const actor = { userId: staffId, verifiedEmail: "staff@example.com" };

function grant(overrides: Partial<ApplicationUseGrant> = {}): ApplicationUseGrant {
  return {
    id: grantId,
    workId,
    workspaceId,
    recipientEmail: actor.verifiedEmail,
    views: ["form", "list"],
    recordRead: "own",
    recordSubmit: true,
    recordEdit: "own",
    purpose: "Correct submitted requests",
    expiresAt: "2026-09-21T12:00:00.000Z",
    status: "active",
    grantedBy: ownerId,
    createdAt: "2026-09-20T10:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

function context(overrides: Partial<ApplicationUseContext> = {}): ApplicationUseContext {
  return {
    workId,
    workspaceId,
    title: "Repair requests",
    releaseVersion: 1,
    releasedSpec: {
      title: "Repair requests",
      maintenanceOwner: ownerId,
      fields: [
        { id: "visit_date", label: "Visit date", type: "date", required: true },
        { id: "problem", label: "Problem", type: "text", required: true },
      ],
      components: [
        { kind: "form", fields: ["visit_date", "problem"] },
        { kind: "list", fields: ["visit_date", "problem"] },
      ],
    },
    records: [
      { id: "mine", values: { visit_date: "2026-02-28", problem: "Leaking tap" }, createdBy: staffId, revision: 4 },
      { id: "other", values: { visit_date: "2024-02-29", problem: "Broken hinge" }, createdBy: otherId, revision: 2 },
    ],
    grant: grant(),
    ...overrides,
  };
}

function fakePersistence(initial: ApplicationUseContext): ApplicationUsePersistence & { edits: unknown[] } {
  let current = structuredClone(initial);
  const edits: unknown[] = [];
  return {
    edits,
    inspect: vi.fn(async () => structuredClone(current)),
    list: vi.fn(async () => [structuredClone(current.grant)]),
    grant: vi.fn(async () => current.grant),
    revoke: vi.fn(async () => undefined),
    submit: vi.fn(async () => structuredClone(current)),
    edit: vi.fn(async (editor, _resourceId, input) => {
      edits.push(input);
      const record = current.records.find(value => value && typeof value === "object" && (value as { id?: unknown }).id === input.record.id) as { id: string; values: Record<string, unknown>; createdBy: string; revision: number } | undefined;
      if (!record) throw new ApplicationUseAccessError("That record is no longer available to your account.");
      if (record.revision !== input.expectedRecordRevision) throw new ApplicationUseConflictError("That record changed. Your correction is still here.");
      current = {
        ...current,
        records: current.records.map(value => {
          if (!value || typeof value !== "object" || (value as { id?: unknown }).id !== record.id) return value;
          return { ...record, values: input.record.values, revision: record.revision + 1 };
        }),
      };
      return structuredClone(current);
    }),
  };
}

describe("application date fields and recipient edits", () => {
  it("accepts real calendar dates as date-only values and rejects rollover dates", () => {
    const spec = {
      title: "Appointments",
      maintenanceOwner: ownerId,
      fields: [{ id: "visit_date", label: "Visit date", type: "date", required: true }],
      components: [{ kind: "form", fields: ["visit_date"] }],
    } as const;

    expect(applicationSpecSchema.parse(spec).fields[0]).toMatchObject({ type: "date" });
    expect(isApplicationDateOnly("2024-02-29")).toBe(true);
    expect(isApplicationDateOnly("2026-02-29")).toBe(false);
    expect(isApplicationDateOnly("2026-02-30")).toBe(false);
    expect(isApplicationDateOnly("0100-02-29")).toBe(false);
    expect(isApplicationDateOnly("0400-02-29")).toBe(true);
    expect(() => applicationUseEditSchema.parse({
      record: { id: "record-1", values: { visit_date: "2026-02-30" } },
      releaseVersion: 1,
      expectedRecordRevision: 1,
      idempotencyKey: "edit-1",
    })).not.toThrow();
  });

  it("rejects an invalid calendar date before the edit persistence boundary", async () => {
    const persistence = fakePersistence(context());
    const service = createApplicationAccessService(persistence, () => now);

    await expect(service.edit(actor, workId, {
      record: { id: "mine", values: { visit_date: "2026-02-30", problem: "Invalid date" } },
      releaseVersion: 1,
      expectedRecordRevision: 4,
      idempotencyKey: "invalid-date-edit",
    })).rejects.toBeInstanceOf(ApplicationUseInputError);
    expect(persistence.edits).toHaveLength(0);
  });

  it("projects record revisions and edits only the recipient's own record", async () => {
    const persistence = fakePersistence(context());
    const service = createApplicationAccessService(persistence, () => now);

    const before = await service.inspect(actor, workId);
    expect(before.records).toEqual([{ id: "mine", values: { visit_date: "2026-02-28", problem: "Leaking tap" }, revision: 4 }]);

    const after = await service.edit(actor, workId, {
      record: { id: "mine", values: { visit_date: "2026-02-28", problem: "Loose tap" } },
      releaseVersion: 1,
      expectedRecordRevision: 4,
      idempotencyKey: "edit-1",
    });
    expect(persistence.edits).toHaveLength(1);
    expect(after.records[0]).toMatchObject({ id: "mine", revision: 5, values: { visit_date: "2026-02-28", problem: "Loose tap" } });
  });

  it("keeps shared records readable without offering edits outside the recipient's scope", async () => {
    const service = createApplicationAccessService(fakePersistence(context({ grant: grant({ recordRead: "all", recordEdit: "own" }) })), () => now);
    const snapshot = await service.inspect(actor, workId);
    expect(snapshot.records).toHaveLength(2);
    expect(snapshot.records[0]).toMatchObject({ id: "mine", revision: 4 });
    expect(snapshot.records[1]).toEqual({ id: "other", values: { visit_date: "2024-02-29", problem: "Broken hinge" } });

    const sharedEditor = createApplicationAccessService(fakePersistence(context({ grant: grant({ recordRead: "all", recordEdit: "all" }) })), () => now);
    expect((await sharedEditor.inspect(actor, workId)).records[1]).toMatchObject({ id: "other", revision: 2 });
  });

  it("denies foreign and unscoped edits before the native edit boundary", async () => {
    const foreignPersistence = fakePersistence(context());
    const foreignService = createApplicationAccessService(foreignPersistence, () => now);
    await expect(foreignService.edit(actor, workId, {
      record: { id: "other", values: { visit_date: "2024-02-29", problem: "Changed" } },
      releaseVersion: 1,
      expectedRecordRevision: 2,
      idempotencyKey: "foreign-edit",
    })).rejects.toBeInstanceOf(ApplicationUseAccessError);
    expect(foreignPersistence.edits).toHaveLength(0);

    const unscopedPersistence = fakePersistence(context({ grant: grant({ recordEdit: "none" }) }));
    const unscopedService = createApplicationAccessService(unscopedPersistence, () => now);
    await expect(unscopedService.edit(actor, workId, {
      record: { id: "mine", values: { visit_date: "2026-02-28", problem: "Changed" } },
      releaseVersion: 1,
      expectedRecordRevision: 4,
      idempotencyKey: "no-edit",
    })).rejects.toBeInstanceOf(ApplicationUseAccessError);
    expect(unscopedPersistence.edits).toHaveLength(0);
  });

  it("keeps the entered correction available when the record clock is stale", async () => {
    const persistence = fakePersistence(context());
    const service = createApplicationAccessService(persistence, () => now);
    const input = {
      record: { id: "mine", values: { visit_date: "2026-02-28", problem: "Correction kept after a lost response" } },
      releaseVersion: 1,
      expectedRecordRevision: 3,
      idempotencyKey: "stale-edit",
    } as const;
    await expect(service.edit(actor, workId, input)).rejects.toThrow(/changed/i);
    expect(persistence.edits).toEqual([input]);
    expect((await service.inspect(actor, workId)).records[0]).toMatchObject({ revision: 4, values: { problem: "Leaking tap" } });
  });
});
