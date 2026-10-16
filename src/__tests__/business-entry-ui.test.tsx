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
    const node = await render(createElement(SupabaseSignIn, { emailReady: true, next: "/workspace?workspaceId=business", prefillEmail: "owner@example.test", heading: createElement(StHead, { title: "Sign in" }) }));
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.querySelectorAll("h1")).toHaveLength(1);
    expect(node.querySelector("h1")?.textContent).toBe("Check your email. We sent a sign-in link to owner@example.test.");
    expect(node.textContent).toContain("owner@example.test");
    expect(mocks.otp).toHaveBeenCalledWith({ email: "owner@example.test", options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fworkspace%3FworkspaceId%3Dbusiness` } });
    await click(node, "send a new link");
    expect(mocks.otp).toHaveBeenCalledTimes(2);
    expect(node.textContent).toContain("Sent again. Use the newest email.");
  });
  it("takes the emailed code when the email carries one, and keeps a refused code inline", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, reason: "expired" }), { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    const node = await render(createElement(SupabaseSignIn, { emailReady: true, codeReady: true, next: "/workspace?save=scan_public123", prefillEmail: "owner@example.test" }));
    expect(node.querySelector('button[type="submit"]')?.textContent).toBe("Email me a code");
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const code = node.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!;
    expect(code).not.toBeNull();
    expect(document.activeElement).toBe(code);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(code, "48 29 13");
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(fetch).toHaveBeenCalledWith("/auth/code", expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "owner@example.test", code: "482913", next: "/workspace?save=scan_public123" }) }));
    expect(node.querySelector('[role="alert"]')?.textContent).toBe("That code has expired. Send a new one and use the newest email.");
    expect(code.getAttribute("aria-invalid")).toBe("true");
  });
  it("says a link is on its way when the email carries no code", async () => {
    const node = await render(createElement(SupabaseSignIn, { emailReady: true, codeReady: false, prefillEmail: "owner@example.test", resume: "your saved check" }));
    expect(node.textContent).toContain("After you sign in, you go straight to your saved check.");
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.querySelector('input[autocomplete="one-time-code"]')).toBeNull();
    expect(node.textContent).toContain("Open the link in that email on this device. It signs you in and takes you to your saved check.");
  });
  it("turns a thrown auth failure into a retryable form instead of a stuck spinner", async () => {
    mocks.otp.mockRejectedValue(new Error("provider unreachable"));
    const node = await render(createElement(SupabaseSignIn, { emailReady: true, prefillEmail: "owner@example.test" }));
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be sent");
    expect(node.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(false);
    expect(node.textContent).not.toContain("Check your email");
  });
  it("hides email by default and keeps Google available", async () => {
    const node = await render(createElement(SupabaseSignIn));
    expect(node.querySelector("form")).toBeNull();
    expect(node.textContent).not.toContain("Email me a sign-in link");
    await click(node, "Continue with Google");
    expect(mocks.otp).not.toHaveBeenCalled();
    expect(mocks.oauth).toHaveBeenCalledOnce();
  });
  it("never exposes provider errors", async () => {
    mocks.otp.mockResolvedValue({ error: { code: "email_address_not_authorized", message: "SMTP private provider details" } });
    const node = await render(createElement(SupabaseSignIn, { emailReady: true, prefillEmail: "owner@example.test" }));
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(node.textContent).toContain("Try again or continue with Google");
    expect(node.textContent).not.toContain("SMTP");
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
