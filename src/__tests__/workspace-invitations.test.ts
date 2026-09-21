import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceInvitationRecipientError } from "@/platform/workspaces/invitations";
import { workspaceInvitationReturnTarget } from "@/lib/workspace-location";
import { isPublicRoute } from "@/proxy";
import { analyticsAllowedPath } from "@/lib/analytics-privacy";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  inspect: vi.fn(),
  accept: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/platform/workspaces/http", async importOriginal => {
  const original = await importOriginal<typeof import("@/platform/workspaces/http")>();
  return { ...original, workspaceHttpActor: mocks.actor };
});
vi.mock("@/platform/workspaces/invitations", async importOriginal => {
  const original = await importOriginal<typeof import("@/platform/workspaces/invitations")>();
  return {
    ...original,
    createWorkspaceInvitation: mocks.create,
    listWorkspaceInvitations: mocks.list,
    inspectWorkspaceInvitation: mocks.inspect,
    acceptWorkspaceInvitation: mocks.accept,
    revokeWorkspaceInvitation: mocks.revoke,
  };
});

const token = "a".repeat(43);
const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.test" };
const invitation = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  recipientEmail: "person@example.test",
  role: "member",
  status: "pending",
  expiresAt: "2026-09-25T00:00:00.000Z",
  createdAt: "2026-09-18T00:00:00.000Z",
};

function mutation(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { origin: "https://strelva.com", "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  mocks.actor.mockResolvedValue(actor);
  mocks.list.mockResolvedValue([invitation]);
  mocks.create.mockResolvedValue({ invitation, token });
  mocks.inspect.mockResolvedValue({ ...invitation, workspaceName: "Example Business", recipientEmail: "p•••••@example.test" });
  mocks.accept.mockResolvedValue({ invitationId: invitation.id, workspaceId: invitation.workspaceId, workspaceName: "Example Business", invitedRole: "member", appliedRole: "member", status: "accepted", alreadyAccepted: false });
  mocks.revoke.mockResolvedValue("revoked");
});

describe("workspace invitation HTTP boundary", () => {
  it("lets an owner inspect and create only through verified workspace authority", async () => {
    const route = await import("@/app/api/workspace-invitations/route");
    const listed = await route.GET(new Request(`https://strelva.com/api/workspace-invitations?workspaceId=${invitation.workspaceId}`));
    expect(listed.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(actor, invitation.workspaceId);

    const created = await route.POST(mutation("https://strelva.com/api/workspace-invitations", {
      workspaceId: invitation.workspaceId, recipientEmail: invitation.recipientEmail, role: "member",
    }));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ invitation, token });
  });

  it("rejects signed-out and cross-origin owner mutations", async () => {
    const route = await import("@/app/api/workspace-invitations/route");
    mocks.actor.mockResolvedValueOnce(null);
    expect((await route.POST(mutation("https://strelva.com/api/workspace-invitations", {}))).status).toBe(401);
    expect((await route.POST(new Request("https://strelva.com/api/workspace-invitations", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("exposes only the bounded token preview before authentication", async () => {
    const route = await import("@/app/api/workspace-invitations/accept/[token]/route");
    mocks.actor.mockResolvedValueOnce(null);
    const response = await route.GET(new Request(`https://strelva.com/api/workspace-invitations/accept/${token}`), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invitation).toMatchObject({ workspaceName: "Example Business", recipientEmail: "p•••••@example.test", role: "member" });
    expect(body.invitation).not.toHaveProperty("createdBy");
    expect(body.invitation).not.toHaveProperty("members");
  });

  it("requires the exact verified recipient and names wrong-account recovery", async () => {
    const route = await import("@/app/api/workspace-invitations/accept/[token]/route");
    mocks.accept.mockRejectedValueOnce(new WorkspaceInvitationRecipientError());
    const response = await route.POST(mutation(`https://strelva.com/api/workspace-invitations/accept/${token}`, {}), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Sign in with the exact verified email address named by this invitation.", code: "wrong_account" });
  });

  it("returns terminal revoked and expired states without membership success", async () => {
    const route = await import("@/app/api/workspace-invitations/accept/[token]/route");
    for (const status of ["revoked", "expired"] as const) {
      mocks.accept.mockResolvedValueOnce({ ...(await mocks.accept()), status });
      const response = await route.POST(mutation(`https://strelva.com/api/workspace-invitations/accept/${token}`, {}), { params: Promise.resolve({ token }) });
      expect(response.status).toBe(410);
    }
  });
});

describe("workspace invitation return target", () => {
  it("keeps only the fixed opaque invitation path", () => {
    const target = `/workspace/invitations/accept/${token}`;
    expect(workspaceInvitationReturnTarget(target)).toBe(target);
    expect(workspaceInvitationReturnTarget("/workspace/invitations")).toBeNull();
    expect(workspaceInvitationReturnTarget(`${target}?next=https://evil.example`)).toBeNull();
    expect(workspaceInvitationReturnTarget("//workspace/invitations/accept/" + token)).toBeNull();
  });
  it("keeps the recipient page public so signed-out people can inspect terms before sign-in", () => {
    const request = (pathname: string) => ({ nextUrl: { pathname } }) as unknown as NextRequest;
    expect(isPublicRoute(request(`/workspace/invitations/accept/${token}`))).toBe(true);
    expect(isPublicRoute(request(`/api/workspace-invitations/accept/${token}`))).toBe(true);
    expect(isPublicRoute(request("/api/workspace-invitations"))).toBe(true);
  });
  it("never mounts analytics across the private invitation and auth return journey", () => {
    expect(analyticsAllowedPath(`/workspace/invitations/accept/${token}`)).toBe(false);
    expect(analyticsAllowedPath("/sign-in")).toBe(false);
    expect(analyticsAllowedPath("/sign-up")).toBe(false);
    expect(analyticsAllowedPath("/auth/callback")).toBe(false);
    expect(analyticsAllowedPath("/")).toBe(true);
  });
});
