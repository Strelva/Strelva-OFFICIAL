// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
let root: Root, node: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear(); window.history.replaceState(null, "", "/workspace?workspaceId=33333333-3333-4333-8333-333333333333");
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

it.each([403, 404])("%s has workspace/account destinations and access guidance instead of Retry", async status => {
  const request = vi.fn(async () => Response.json({ error: "Workspace unavailable" }, { status }));
  await act(async () => root.render(<WorkspaceApp request={request as typeof fetch} />));
  expect(node.textContent).toContain("Choose another workspace");
  // XA: one way forward (the pill); the guidance sits in the sentence above it.
  expect(node.querySelector('a[href="/workspace/account"]')).not.toBeNull();
  expect(node.textContent).not.toContain("Try again");
  expect(node.textContent).not.toContain("Sign in");
  expect(node.textContent).toContain(status === 403 ? "invite the email you sign in with" : "Ask its owner for a current one");
  expect(request).toHaveBeenCalledTimes(1);
});

it("401 preserves sign-in recovery, and a transient outage still offers Retry", async () => {
  const unauthorized = vi.fn(async () => Response.json({ error: "Please sign in" }, { status: 401 }));
  await act(async () => root.render(<WorkspaceApp request={unauthorized as typeof fetch} />));
  expect(node.textContent).toContain("Sign in to open your workspace.");
  expect(node.querySelector('a[href^="/sign-in"]')).not.toBeNull();
  const offline = vi.fn(async () => { throw new Error("Network unavailable"); });
  await act(async () => root.render(<WorkspaceApp request={offline as typeof fetch} />));
  expect(node.textContent).toContain("Try again");
  expect(node.textContent).not.toContain("Choose another workspace");
});
