import { beforeEach, expect, it, vi } from "vitest";
const capture = vi.hoisted(() => ({ request: vi.fn(), exception: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureRequestError: capture.request, captureException: capture.exception }));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(), useEffect: (effect: () => void) => effect() }));
vi.mock("next/error", () => ({ default: () => <p>Unexpected error</p> }));
import { renderToStaticMarkup } from "react-dom/server";
import { onRequestError } from "../../instrumentation";
import GlobalError from "@/app/global-error";
import RouteError from "@/app/error";
beforeEach(() => vi.clearAllMocks());
it("forwards Next request context through the SDK hook", () => {
  const error = new Error("fictional request failure");
  const request = { path: "/fictional", method: "GET", headers: {} };
  const context = { routerKind: "App Router", routePath: "/fictional", routeType: "render" };
  onRequestError(error, request, context);
  expect(capture.request).toHaveBeenCalledWith(error, request, context);
});
it("captures root layout failures while supplying a generic complete document", () => {
  const error = new Error("fictional sensitive detail");
  const html = renderToStaticMarkup(GlobalError({ error }));
  expect(capture.exception).toHaveBeenCalledWith(error);
  expect(html).toContain("<html><head></head><body>");
  expect(html).not.toContain(error.message);
});
it("captures the root route boundary failure while retaining reset UI", () => {
  const error = new Error("fictional sensitive detail");
  const html = renderToStaticMarkup(RouteError({ error, reset: vi.fn() }));
  expect(capture.exception).toHaveBeenCalledWith(error);
  expect(html).toContain("Try again");
  expect(html).not.toContain(error.message);
});
