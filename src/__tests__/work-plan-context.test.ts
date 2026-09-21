import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWork: vi.fn(),
}));

vi.mock("@/platform/workspaces", () => ({
  getWork: mocks.getWork,
}));

import { WorkspaceAccessError } from "@/platform/workspaces/types";
import {
  prepareWorkPlanContext,
} from "@/products/work-plans/context";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  verifiedEmail: "owner@example.com",
};
const workspaceId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const trackerId = "44444444-4444-4444-8444-444444444444";

const documentWork = {
  id: documentId,
  workspaceId,
  productId: "documents",
  resourceKind: "document",
  title: "Customer procedure",
  payload: {
    title: "Customer procedure",
    text: "Review the request, then confirm the owner before replying.",
    version: 1,
    revision: 3,
    createdBy: actor.userId,
    createdAt: "2026-09-11T00:00:00.000Z",
    history: [],
  },
  createdBy: actor.userId,
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:03:00.000Z",
};

const trackerWork = {
  id: trackerId,
  workspaceId,
  productId: "tracker",
  resourceKind: "tracker",
  title: "Customer requests",
  payload: {
    tracker: {
      id: "tracker-1",
      title: "Customer requests",
      source: {
        sourceId: "source-1",
        originalFileName: "requests.csv",
        format: "csv",
        mediaType: "text/csv",
        sizeBytes: 100,
      },
      originalSource: "Name,API Key\nJane,super-secret-value",
      columns: [
        {
          id: "name",
          sourceColumn: 1,
          sourceColumnIndex: 0,
          sourceHeader: "Name",
          fieldKey: "name",
          label: "Name",
          kind: "text",
        },
        {
          id: "api-key",
          sourceColumn: 2,
          sourceColumnIndex: 1,
          sourceHeader: "API Key",
          fieldKey: "api_key",
          label: "API Key",
          kind: "text",
        },
      ],
      rows: [{
        id: "row-1",
        cells: {
          name: { value: "Jane", originalValue: "Jane", lineage: null },
          "api-key": { value: "super-secret-value", originalValue: "super-secret-value", lineage: null },
        },
        lineage: null,
        state: "active",
        createdAt: "2026-09-11T00:00:00.000Z",
        updatedAt: "2026-09-11T00:00:00.000Z",
      }],
      history: [],
      revision: 2,
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:02:00.000Z",
    },
  },
  createdBy: actor.userId,
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:02:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("prepareWorkPlanContext", () => {
  it("returns bounded document and tracker evidence with source versions", async () => {
    mocks.getWork.mockImplementation(async (_actor: unknown, id: string) => ({
      [documentId]: documentWork,
      [trackerId]: trackerWork,
    }[id] ?? null));

    const context = await prepareWorkPlanContext({
      actor,
      workspaceId,
      sourceWorkIds: [documentId, trackerId],
    });

    expect(context).toMatchObject({
      version: 1,
      sources: [
        { workId: documentId, kind: "document", version: 1, revision: 3 },
        { workId: trackerId, kind: "tracker", version: 1, revision: 2 },
      ],
    });
    expect(context.evidence).toHaveLength(2);
    expect(context.evidence[0]?.value).toContain("Review the request");
    expect(context.evidence[1]?.value).toContain("Customer requests");
    expect(context.evidence[1]?.value).toContain("[redacted]");
    expect(JSON.stringify(context)).not.toContain("originalSource");
    expect(JSON.stringify(context)).not.toContain("API Key");
    expect(JSON.stringify(context)).not.toContain("super-secret-value");
  });

  it("fails immediately when a selected source is inaccessible", async () => {
    mocks.getWork.mockRejectedValue(new WorkspaceAccessError());

    await expect(prepareWorkPlanContext({
      actor,
      workspaceId,
      sourceWorkIds: [documentId],
    })).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("does not silently skip a source from another workspace", async () => {
    mocks.getWork.mockResolvedValue({
      ...documentWork,
      workspaceId: "55555555-5555-4555-8555-555555555555",
      payload: { malformed: "must not be inspected first" },
    });

    await expect(prepareWorkPlanContext({
      actor,
      workspaceId,
      sourceWorkIds: [documentId],
    })).rejects.toMatchObject({ code: "wrong_workspace", sourceWorkId: documentId });
  });

  it("caps document plaintext at the planner evidence limit", async () => {
    mocks.getWork.mockResolvedValue({
      ...documentWork,
      payload: { ...documentWork.payload, text: "x".repeat(50_000) },
    });

    const context = await prepareWorkPlanContext({
      actor,
      workspaceId,
      sourceWorkIds: [documentId],
    });

    expect(context.evidence[0]?.value.length).toBeLessThanOrEqual(2_000);
  });

  it("scrubs likely secrets from document evidence without dropping useful context", async () => {
    mocks.getWork.mockResolvedValue({
      ...documentWork,
      payload: {
        ...documentWork.payload,
        text: "Escalate failed requests to the owner. Password: river-stone-42. Authorization: Bearer abcdefghijklmnop.",
      },
    });

    const context = await prepareWorkPlanContext({
      actor,
      workspaceId,
      sourceWorkIds: [documentId],
    });

    expect(context.evidence[0]?.value).toContain("Escalate failed requests to the owner.");
    expect(context.evidence[0]?.value).toContain("[redacted]");
    expect(context.evidence[0]?.value).not.toContain("river-stone-42");
    expect(context.evidence[0]?.value).not.toContain("abcdefghijklmnop");
  });
});
