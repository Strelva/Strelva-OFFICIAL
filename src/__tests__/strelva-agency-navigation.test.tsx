// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrelvaSidebar } from "@/experience/app-frame/StrelvaSidebar";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

it("uses the agency's places and caller-owned navigation without changing owner defaults", async () => {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  const onNavigate = vi.fn();
  await act(async () => root.render(createElement(StrelvaSidebar, { look: "paper", accountName: "You", signOut: null, agencyNavigation: { active: "queue", onNavigate, hrefs: { clients: "/preview/strelva/agency-portfolio", queue: "/preview/strelva/agency-portfolio?surface=queue", library: "/preview/strelva/agency-library" } } })));
  const main = node.querySelector('nav[aria-label="Main"]')!;
  const links = [...main.querySelectorAll<HTMLAnchorElement>("a")];
  expect(links.map(link => link.textContent)).toEqual(["Home", "Clients", "Queue", "Library", "Team", "Verification"]);
  expect(links[2]?.getAttribute("aria-current")).toBe("page");
  expect(links[3]?.getAttribute("href")).toBe("/preview/strelva/agency-library");
  await act(async () => { links[3]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
  expect(onNavigate).toHaveBeenCalledExactlyOnceWith("library");
  await act(async () => root.render(createElement(StrelvaSidebar, { look: "paper", accountName: "You", signOut: null, active: "home" })));
  expect([...node.querySelectorAll('nav[aria-label="Main"] a')].map(link => link.textContent)).toEqual(["Home", "Requests", "Running"]);
});

it("gives the XA agency sidebar Today, Queue, Library and Running, with clients and caller-owned navigation", async () => {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  const onNavigate = vi.fn();
  const clients = [{ id: "a", name: "Harbor Dental", href: "/preview/a", detail: "Dr. Lin" }, { id: "b", name: "North Coast Realty", href: "/preview/b", waits: true }];
  await act(async () => root.render(createElement(StrelvaSidebar, { accountName: "Maya", signOut: null, workspaceId: "w1", agencyNavigation: { active: "queue", onNavigate, queueCount: 3, clients, hrefs: { library: "/preview/strelva/agency-library" } } })));
  const links = [...node.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main"] a')];
  expect(links.map(link => link.querySelector("span")?.textContent)).toEqual(["Today", "Queue", "Library", "Running"]);
  expect(links[1]?.getAttribute("aria-current")).toBe("page");
  expect(links[1]?.getAttribute("aria-label")).toBe("Queue, 3 waiting");
  expect(links[2]?.getAttribute("href")).toBe("/preview/strelva/agency-library");
  await act(async () => { links[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
  expect(onNavigate).toHaveBeenCalledExactlyOnceWith("library");
  const clientLinks = [...node.querySelectorAll<HTMLAnchorElement>('section[aria-label="Clients"] a')].filter(link => link.textContent !== "All clients");
  expect(clientLinks.map(link => link.textContent)).toEqual(["HHarbor DentalDr. Lin", "NNorth Coast Realty", "+Add a client"].map(text => text.replace("+", "")));
  expect(clientLinks[1]?.getAttribute("aria-label")).toBe("North Coast Realty, needs you");
  expect(clientLinks[2]?.getAttribute("href")).toBe("/workspace/agency/clients/new?workspaceId=w1");
});
