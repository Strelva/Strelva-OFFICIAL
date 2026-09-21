import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  release: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  edit: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/products/documents/server", () => ({
  readWorkspaceDocument: mocks.read,
  saveWorkspaceDocument: mocks.save,
  editWorkspaceDocument: mocks.edit,
}));

import { POST } from "@/app/api/documents/route";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

const actorUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "Owner@example.com",
  email_confirmed_at: "2026-09-11T00:00:00.000Z",
};
const workspaceId = "22222222-2222-4222-8222-222222222222";
const workId = "33333333-3333-4333-8333-333333333333";

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.strelva.com/api/documents", {
    method: "POST",
    headers: {
      origin: "https://app.strelva.com",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.release.mockReturnValue(true);
  mocks.user.mockResolvedValue(actorUser);
});

describe("workspace document route", () => {
  it("denies an unconfirmed or signed-out actor before reading or writing", async () => {
    mocks.user.mockResolvedValue({ id: actorUser.id, email: actorUser.email });

    const response = await POST(postRequest({
      action: "create",
      workspaceId,
      input: { title: "Procedure", text: "First" },
    }));

    expect(response.status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin write before parsing or calling the document server", async () => {
    const response = await POST(postRequest({
      action: "create",
      workspaceId,
      input: { title: "Procedure", text: "First" },
    }, { origin: "https://attacker.example" }));

    expect(response.status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("maps a compare-and-swap conflict without claiming the edit was saved", async () => {
    mocks.edit.mockRejectedValue(new WorkspaceConflictError("database revision details"));

    const response = await POST(postRequest({
      action: "command",
      workId,
      command: { kind: "edit", expectedRevision: 1, title: "Procedure", text: "Changed" },
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This document changed or cannot accept this change. Reload it before continuing.",
    });
  });

});
