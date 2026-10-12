// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { AiVisibilityPage } from "@/products/ai-visibility";
import { AiVisibilityResultView } from "@/products/ai-visibility/AiVisibilityResultView";
import { AnswerCheckPreview } from "@/experience/workspace/preview/AnswerCheckPreview";
import { answerCheckFixture } from "@/experience/workspace/preview/answer-check-fixture";
import { StTextField } from "@/components/ui/strelva/Kit";
const routerPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }));
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); vi.unstubAllGlobals(); });
async function mount(node: React.ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(node); });
}
async function fill(label: string, value: string) {
  const labelNode = Array.from(container.querySelectorAll("label")).find(node => node.textContent === label)!;
  const input = container.querySelector<HTMLInputElement>(`[id="${labelNode.htmlFor}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
it("does not invent an answer or wrong-claim count from a saved citation boolean", () => {
  const html = renderToStaticMarkup(createElement(AiVisibilityResultView, { result: { ...answerCheckFixture, verdict: "Gemini named this business in one answer." }, scanId: "scan_ab123", shareUrl: null, workspaceEnabled: true, onReset() {} }));
  expect(html).toContain("Its full answer and claim-by-claim accuracy were not saved.");
  expect(html).not.toContain("things wrong");
  expect(html).toContain("/workspace/business/new?check=scan_ab123");
});
it("keeps unavailable measurement separate from grades and missing signals", () => {
  const html = renderToStaticMarkup(createElement(AiVisibilityResultView, { result: { ...answerCheckFixture, measurementStatus: "unavailable", readinessMeasured: false, signals: [] }, scanId: null, shareUrl: null, onReset() {} }));
  expect(html).toContain("Website readability was not measured");
  expect(html).not.toContain("48/100");
});
it("keeps workspace continuation gated", () => {
  const html = renderToStaticMarkup(createElement(AiVisibilityResultView, { result: answerCheckFixture, scanId: "scan_ab123", shareUrl: null, workspaceEnabled: false, onReset() {} }));
  expect(html).not.toContain("/workspace?save=");
});
it("preserves the exact public check input and its failure state", async () => {
  const request = vi.fn(async () => new Response(JSON.stringify({ error: "Check unavailable." }), { status: 503 }));
  vi.stubGlobal("fetch", request);
  await mount(createElement(AiVisibilityPage));
  await fill("Business name", "Example business"); await fill("Website", "example.test");
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(request).toHaveBeenCalledWith("/api/ai-visibility", expect.objectContaining({ method: "POST", body: JSON.stringify({ business: "Example business", url: "example.test" }) }));
  expect(container.textContent).toContain("Check unavailable.");
  expect(container.querySelector<HTMLInputElement>("#website")?.value).toBe("example.test");
});
it("rejects malformed URL without making a request", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await mount(createElement(AiVisibilityPage)); await fill("Business name", "Example business"); await fill("Website", "http://[");
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(request).not.toHaveBeenCalled(); expect(container.querySelector("#website")?.getAttribute("aria-invalid")).toBe("true");
});
it("the fixture continuation keeps its result and makes no sign-up request", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await mount(createElement(AnswerCheckPreview, { state: "continue" })); await fill("Your email", "owner@example.test");
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(container.textContent).toContain("No real account was created"); expect(container.textContent).toContain(answerCheckFixture.topFix); expect(request).not.toHaveBeenCalled();
});
it("fixture failure and permission states never show sampled successes", () => {
  for (const state of ["loading", "empty", "error", "permission"]) {
    const html = renderToStaticMarkup(createElement(AnswerCheckPreview, { state }));
    expect(html).toContain("Fictional preview"); expect(html).not.toContain("They also handle divorce");
  }
});
it("native kit fields connect both caller context and errors", () => {
  const html = renderToStaticMarkup(createElement(StTextField, { id: "email", label: "Your email", error: "Email is required", "aria-describedby": "context" }));
  expect(html).toContain('for="email"'); expect(html).toContain('aria-describedby="context email-message"'); expect(html).toContain('aria-invalid="true"'); expect(html).toContain('role="alert"');
});

it("the entry fixture suppresses the real check request before opening its sample", async () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  await mount(createElement(AnswerCheckPreview, { state: "entry" }));
  await fill("Business name", "Example business"); await fill("Website", "example.test");
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(request).not.toHaveBeenCalled(); expect(routerPush).toHaveBeenCalledWith("/preview/strelva/answer-check?state=result");
});
