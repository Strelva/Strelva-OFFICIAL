import { describe, expect, it, vi } from "vitest";
import {
  ApplicationUseAccessError,
  ApplicationUseConflictError,
  ApplicationUseInputError,
  applicationUseSubmitSchema,
  createApplicationAccessService,
  type ApplicationUseContext,
  type ApplicationUseGrant,
  type ApplicationUsePersistence,
} from "@/products/applications/access";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const staffId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-09-14T12:00:00.000Z");
const actor = { userId: staffId, verifiedEmail: "staff@example.com" };

function grant(overrides: Partial<ApplicationUseGrant> = {}): ApplicationUseGrant {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    workId,
    workspaceId,
    recipientEmail: actor.verifiedEmail,
    views: ["form", "list"],
    recordRead: "own",
    recordSubmit: true,
    purpose: "Submit repair requests",
    expiresAt: "2026-09-15T12:00:00.000Z",
    status: "active",
    grantedBy: ownerId,
    createdAt: "2026-09-14T10:00:00.000Z",
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
      fields: [
        { id: "problem", label: "Problem", type: "text", required: true },
        { id: "internalNote", label: "Internal note", type: "text", required: false },
      ],
      components: [
        { kind: "form", fields: ["problem"] },
        { kind: "list", fields: ["problem"] },
        { kind: "detail", fields: ["problem", "internalNote"] },
      ],
    },
    records: [
      { id: "mine", values: { problem: "Leaking tap", internalNote: "owner only" }, createdBy: staffId },
      { id: "other", values: { problem: "Broken hinge", internalNote: "private" }, createdBy: ownerId },
    ],
    grant: grant(),
    ...overrides,
  };
}

function fakePersistence(initial: ApplicationUseContext): ApplicationUsePersistence & { submitted: unknown[] } {
  let current = structuredClone(initial);
  const submitted: unknown[] = [];
  return {
    submitted,
    inspect: vi.fn(async () => structuredClone(current)),
    list: vi.fn(async () => [structuredClone(current.grant)]),
    grant: vi.fn(async () => current.grant),
    revoke: vi.fn(async () => undefined),
    submit: vi.fn(async (submitter, _resourceId, input) => {
      submitted.push(input);
      current = {
        ...current,
        records: [...current.records, { id: input.record.id, values: input.record.values, createdBy: submitter.userId }],
      };
      return structuredClone(current);
    }),
  };
}

describe("focused application use access", () => {
  it("projects only the released views and own records", async () => {
    const persistence = fakePersistence(context());
    const service = createApplicationAccessService(persistence, () => now);

    const snapshot = await service.inspect(actor, workId);

    expect(snapshot.views.map(view => view.kind)).toEqual(["form", "list"]);
    expect(snapshot.records).toEqual([{ id: "mine", values: { problem: "Leaking tap" } }]);
    expect(snapshot.access).toMatchObject({ recordRead: "own", recordSubmit: true });
    expect(snapshot.records[0]).not.toHaveProperty("createdBy");
  });

  it("rejects hidden fields and forged ownership before the native submit boundary", async () => {
    const persistence = fakePersistence(context());
    const service = createApplicationAccessService(persistence, () => now);

    await expect(service.submit(actor, workId, {
      record: { id: "forged-hidden", values: { internalNote: "not in form" } },
      releaseVersion: 1,
      idempotencyKey: "hidden-field-attempt",
    })).rejects.toBeInstanceOf(ApplicationUseAccessError);
    expect(persistence.submitted).toHaveLength(0);

    expect(() => applicationUseSubmitSchema.parse({
      record: { id: "forged-owner", values: { problem: "x" }, createdBy: ownerId },
      releaseVersion: 1,
      idempotencyKey: "forged-owner-attempt",
    })).toThrow();
  });

  it("delegates a permitted record to the native submit seam and keeps the draft retry-safe", async () => {
    const persistence = fakePersistence(context());
    const service = createApplicationAccessService(persistence, () => now);
    const input = {
      record: { id: "new-request", values: { problem: "Broken latch" } },
      releaseVersion: 1,
      idempotencyKey: "request-1",
    } as const;

    const snapshot = await service.submit(actor, workId, input);

    expect(persistence.submitted).toEqual([input]);
    expect(snapshot.records).toContainEqual({ id: "new-request", values: { problem: "Broken latch" } });
  });

  it("returns a client input error before submitting an incomplete required form", async () => {
    const persistence = fakePersistence(context());
    const service = createApplicationAccessService(persistence, () => now);

    await expect(service.submit(actor, workId, {
      record: { id: "missing-problem", values: {} },
      releaseVersion: 1,
      idempotencyKey: "missing-required",
    })).rejects.toBeInstanceOf(ApplicationUseInputError);
    expect(persistence.submitted).toHaveLength(0);
  });

  it("fails closed for expiry, revocation, and a released version change", async () => {
    const expired = fakePersistence(context({ grant: grant({ expiresAt: "2026-09-14T11:59:59.000Z" }) }));
    const expiredService = createApplicationAccessService(expired, () => now);
    await expect(expiredService.inspect(actor, workId)).rejects.toBeInstanceOf(ApplicationUseAccessError);

    const revoked = fakePersistence(context({ grant: grant({ status: "revoked", revokedAt: "2026-09-14T11:30:00.000Z" }) }));
    const revokedService = createApplicationAccessService(revoked, () => now);
    await expect(revokedService.inspect(actor, workId)).rejects.toBeInstanceOf(ApplicationUseAccessError);

    const newer = fakePersistence(context({ releaseVersion: 2 }));
    const newerService = createApplicationAccessService(newer, () => now);
    await expect(newerService.submit(actor, workId, {
      record: { id: "stale", values: { problem: "stale form" } },
      releaseVersion: 1,
      idempotencyKey: "stale-release",
    })).rejects.toBeInstanceOf(ApplicationUseConflictError);
    expect(newer.submitted).toHaveLength(0);
  });
});
