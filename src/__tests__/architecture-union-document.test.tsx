// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";
import type { DocumentSaved } from "@/experience/workspace/DocumentExperience";
import { createDocument, documentSchema } from "@/products/documents/contracts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/workspace",
  useSearchParams: () => new URLSearchParams(),
}));

const BUSINESS = "33333333-3333-4333-8333-333333333333";
const DEPARTED_WORK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPLACEMENT_WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let root: ReturnType<typeof createRoot> | undefined;

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.scrollTo = () => undefined;
  Element.prototype.scrollTo = () => undefined;
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}
function titleInput(node: HTMLElement) {
  const input = node.querySelector<HTMLInputElement>('section[aria-label="Workspace document"] input');
  if (!input) throw new Error("The real document title input did not open.");
  return input;
}
async function fillTitle(node: HTMLElement, title: string) {
  const input = titleInput(node);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, title);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function saveDocument(node: HTMLElement) {
  const button = [...node.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "Save document");
  expect(button).toBeDefined();
  expect(button!.disabled).toBe(false);
  await act(async () => button!.click());
  await settle();
}

it("a departed real document POST cannot navigate a replacement at the same creation URL, whose own save still acknowledges", async () => {
  const creationUrl = `/workspace?workspaceId=${BUSINESS}&view=document`;
  window.history.replaceState({ source: "new-document" }, "", creationUrl);
  const base = createPreviewRequest("business");
  const savedDocuments = new Map<string, DocumentSaved>();
  const commands: unknown[] = [];
  let releaseDeparted!: (response: Response) => void;
  const pendingDeparted = new Promise<Response>(resolve => { releaseDeparted = resolve; });
  let departedResult: DocumentSaved | undefined;

  // Both App and the actual document's server transport stay inside this fixture.
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    if (url.origin !== "http://preview.invalid") throw new Error("Foreign network is outside this fictional proof.");
    if (url.pathname === "/api/documents" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      commands.push(body);
      expect(body).toMatchObject({ action: "create", workspaceId: BUSINESS });
      const workId = commands.length === 1 ? DEPARTED_WORK : REPLACEMENT_WORK;
      const result = { workspaceId: BUSINESS, workId, document: createDocument(body.input, "fictional-owner") };
      documentSchema.parse(result.document);
      savedDocuments.set(workId, result);
      if (commands.length === 1) { departedResult = result; return pendingDeparted; }
      return Response.json(result);
    }
    if (url.pathname === "/api/documents" && !init?.method) {
      const result = savedDocuments.get(url.searchParams.get("workId") || "");
      return result ? Response.json(result) : Response.json({ error: "Fictional document not found." }, { status: 404 });
    }
    const response = await base(input, init);
    if (url.pathname !== "/api/workspace" || !response.ok) return response;
    const data = await response.json();
    data.actor.localPreview = false;
    data.work.push(...[...savedDocuments.values()].map(saved => ({
      ...data.work[0], id: saved.workId, workspaceId: BUSINESS, productId: "documents", resourceKind: "document",
      title: saved.document.title, assessment: undefined, payload: saved.document,
    })));
    return Response.json(data);
  }) as typeof fetch;
  vi.stubGlobal("fetch", request);
  const node = document.createElement("div");
  document.body.appendChild(node);
  root = createRoot(node);
  await act(async () => root!.render(<WorkspaceApp request={request} />));
  await settle();
  const departedTool = node.querySelector('section[aria-label="Workspace document"]');
  expect(departedTool).not.toBeNull();
  await fillTitle(node, "Departed fictional document");
  await saveDocument(node);
  expect(commands).toHaveLength(1);
  expect(departedTool!.getAttribute("aria-busy")).toBe("true");

  const home = [...node.querySelectorAll<HTMLAnchorElement>("a")].find(link => link.textContent?.trim() === "Home");
  expect(home).toBeDefined();
  await act(async () => home!.click());
  await settle();
  expect(node.contains(departedTool)).toBe(false);
  await act(async () => window.history.back());
  await settle();
  expect(`/workspace${window.location.search}`).toBe(creationUrl);
  const replacementTool = node.querySelector('section[aria-label="Workspace document"]');
  expect(replacementTool).not.toBeNull();
  expect(replacementTool).not.toBe(departedTool);
  expect(titleInput(node).value).toBe("");
  await fillTitle(node, "Replacement fictional document");
  const historyLength = window.history.length;

  await act(async () => releaseDeparted(Response.json(departedResult)));
  await settle();
  expect(`/workspace${window.location.search}`).toBe(creationUrl);
  expect(window.history.length).toBe(historyLength);
  expect(node.querySelector('section[aria-label="Workspace document"]')).toBe(replacementTool);
  expect(titleInput(node).value).toBe("Replacement fictional document");
  expect(replacementTool!.getAttribute("aria-busy")).toBe("false");
  expect(replacementTool!.textContent).not.toContain("Document saved privately in your workspace.");

  await saveDocument(node);
  expect(commands).toEqual([
    { action: "create", workspaceId: BUSINESS, input: { title: "Departed fictional document", text: "" } },
    { action: "create", workspaceId: BUSINESS, input: { title: "Replacement fictional document", text: "" } },
  ]);
  expect(new URLSearchParams(window.location.search).get("work")).toBe(REPLACEMENT_WORK);
  expect(new URLSearchParams(window.location.search).get("view")).toBe("document");
  expect(window.history.length).toBe(historyLength);
  expect(node.querySelector('section[aria-label="Workspace document"] h1')?.textContent).toBe("Replacement fictional document");
  expect(titleInput(node).value).toBe("Replacement fictional document");
});
