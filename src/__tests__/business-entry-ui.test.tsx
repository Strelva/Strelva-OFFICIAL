// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseSignIn } from "@/components/auth/SupabaseSignIn";
import { StHead } from "@/components/ui/strelva/Kit";
import { WorkspaceInvitationAcceptance } from "@/experience/workspace/WorkspaceInvitationAcceptance";

const mocks = vi.hoisted(() => ({ otp: vi.fn(), oauth: vi.fn(), push: vi.fn() }));
vi.mock("@/platform/infra/db/browser-client", () => ({ createBrowserSupabase: () => ({ auth: { signInWithOtp: mocks.otp, signInWithOAuth: mocks.oauth } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.otp.mockResolvedValue({ error: null });
  mocks.oauth.mockResolvedValue({ error: null });
});
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
async function render(element: ReturnType<typeof createElement>) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element)); return node;
}
async function click(node: HTMLElement, text: string) {
  const button = Array.from(node.querySelectorAll("button")).find(button => button.textContent?.includes(text));
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

describe("business entry preserves auth and acceptance boundaries", () => {
  it("shows a single email receipt and resends through the same bounded callback", async () => {
    const node = await render(createElement(SupabaseSignIn, { next: "/workspace?workspaceId=business", prefillEmail: "owner@example.test", heading: createElement(StHead, { title: "Sign in" }) }));
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.querySelectorAll("h1")).toHaveLength(1);
    expect(node.querySelector("h1")?.textContent).toBe("Check your email");
    expect(node.textContent).toContain("owner@example.test");
    expect(mocks.otp).toHaveBeenCalledWith({ email: "owner@example.test", options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fworkspace%3FworkspaceId%3Dbusiness` } });
    await click(node, "Send again");
    expect(mocks.otp).toHaveBeenCalledTimes(2);
  });
  it("turns a thrown auth failure into a retryable form instead of a stuck spinner", async () => {
    mocks.otp.mockRejectedValue(new Error("provider unreachable"));
    const node = await render(createElement(SupabaseSignIn, { prefillEmail: "owner@example.test" }));
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be sent");
    expect(node.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(false);
    expect(node.textContent).not.toContain("Check your email");
  });
  it("keeps Google OAuth as an explicit alternate with its return destination", async () => {
    const node = await render(createElement(SupabaseSignIn, { next: "/workspace/account" }));
    await click(node, "Continue with Google");
    expect(mocks.oauth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=%2Fworkspace%2Faccount` } });
  });
  it("routes an unsigned invitation acceptance to sign-in without granting access", async () => {
    const token = "a".repeat(43);
    const request = vi.fn(async (_url: string, options?: RequestInit) => options?.method === "POST" ? Response.json({ error: "Sign in required" }, { status: 401 }) : Response.json({ invitation: { workspaceId: "business", workspaceName: "Example business", recipientEmail: "owner@example.test", role: "member", status: "pending", expiresAt: "2026-10-15T12:00:00Z" } }));
    vi.stubGlobal("fetch", request);
    const node = await render(createElement(WorkspaceInvitationAcceptance, { token }));
    await click(node, "Continue as");
    expect(mocks.push).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent(`/workspace/invitations/accept/${token}`)}`);
    expect(node.textContent).not.toContain("Access confirmed");
  });
  it("makes a revoked invitation visible without an acceptance control", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ invitation: { workspaceId: "business", workspaceName: "Example business", recipientEmail: "owner@example.test", role: "member", status: "revoked", expiresAt: "2026-10-15T12:00:00Z" } })));
    const node = await render(createElement(WorkspaceInvitationAcceptance, { token: "b".repeat(43) }));
    expect(node.textContent).toContain("owner revoked this invitation");
    expect(node.querySelectorAll("button")).toHaveLength(0);
  });
});
