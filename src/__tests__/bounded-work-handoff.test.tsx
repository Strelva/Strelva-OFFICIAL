// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoundedWorkExperience } from "@/experience/operations/BoundedWorkExperience";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { createApplicationService } from "@/products/applications/server";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";

let root: ReturnType<typeof createRoot> | undefined;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });

it("does not expose app lifecycle controls until the workspace accepts the saved identity", async () => {
  const service = createApplicationService(memoryBoundedStore());
  let savedId = "";
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      expect(body.action).toBe("create");
      const saved = await service.create(owner, "workspace-a", { ...body.input, maintenanceOwner: owner.userId });
      savedId = saved.id;
      return new Response(JSON.stringify(saved), { status: 201 });
    }
    if (String(url).includes("/access")) return new Response(JSON.stringify({ grants: [] }), { status: 200 });
    return new Response(JSON.stringify(await service.read(owner, savedId)), { status: 200 });
  });
  const onSaved = vi.fn();
  const node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node);
  const render = (workId?: string) => createElement(WorkspaceRequestContext.Provider, { value: transport as typeof fetch }, createElement(BoundedWorkExperience, {
    workspaceId: "workspace-a", productId: "applications", workId, sources: [], onSaved,
  }));
  await act(async () => root!.render(render()));
  const form = node.querySelector<HTMLFormElement>('form[aria-label="Application setup"]')!;
  const title = form.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Team requests");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(onSaved).toHaveBeenCalledExactlyOnceWith(savedId);
  expect(node.textContent).toContain("Saved. Opening your work before the next change.");
  expect(node.textContent).not.toContain("Review and publish");
  expect(node.textContent).not.toContain("Check proposed change");
  expect(node.querySelector("a")?.getAttribute("href")).toContain(`work=${savedId}`);
  expect(transport).toHaveBeenCalledTimes(1);

  // A delayed workspace refresh acknowledges the saved row. Only this stable
  // resource-bound instance exposes checking and publication controls.
  await act(async () => root!.render(render(savedId)));
  const review = [...node.querySelectorAll("button")].find(button => button.textContent === "Review and publish");
  expect(review).toBeDefined();
  expect(review?.disabled).toBe(false);
  await act(async () => { review!.click(); });
  expect(node.textContent).toContain("Check proposed change");
  expect(onSaved).toHaveBeenCalledTimes(1);
});
