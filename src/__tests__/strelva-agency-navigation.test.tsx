// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrelvaSidebar } from "@/experience/app-frame/StrelvaSidebar";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

it("uses the agency's three places and caller-owned navigation without changing owner defaults", async () => {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  const onNavigate = vi.fn();
  await act(async () => root.render(createElement(StrelvaSidebar, { accountName: "You", signOut: null, agencyNavigation: { active: "queue", onNavigate, hrefs: { clients: "/preview/strelva/agency-portfolio", queue: "/preview/strelva/agency-portfolio?surface=queue", library: "/preview/strelva/agency-library" } } })));
  const main = node.querySelector('nav[aria-label="Main"]')!;
  const links = [...main.querySelectorAll<HTMLAnchorElement>("a")];
  expect(links.map(link => link.textContent)).toEqual(["Clients", "Queue", "Library", "Team"]);
  expect(links[1]?.getAttribute("aria-current")).toBe("page");
  expect(links[2]?.getAttribute("href")).toBe("/preview/strelva/agency-library");
  await act(async () => { links[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
  expect(onNavigate).toHaveBeenCalledExactlyOnceWith("library");
  await act(async () => root.render(createElement(StrelvaSidebar, { accountName: "You", signOut: null, active: "home" })));
  expect([...node.querySelectorAll('nav[aria-label="Main"] a')].map(link => link.textContent)).toEqual(["Home", "Requests", "Running"]);
});
