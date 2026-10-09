import type { Page, Request, Response } from "@playwright/test";

/** Watches only real requests dispatched after this observer is armed. Older
 * in-flight responses cannot qualify. Strict Mode aborts are not receipts. */
export function observeBrowserRead(page: Page, matches: (request: Request) => boolean, limits: { arrivalMs: number; responseMs: number }) {
  const started = Date.now();
  let settled = false;
  let responseTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveRead: (value: { request: Request; response: Response; arrivalMs: number; responseMs: number }) => void;
  let rejectRead: (error: Error) => void;
  const promise = new Promise<{ request: Request; response: Response; arrivalMs: number; responseMs: number }>((resolve, reject) => { resolveRead = resolve; rejectRead = reject; });
  const cleanup = () => {
    if (arrivalTimer) clearTimeout(arrivalTimer);
    if (responseTimer) clearTimeout(responseTimer);
    page.off("request", onRequest);
  };
  const fail = (error: Error) => {
    if (settled) return; settled = true; cleanup(); rejectRead(error);
  };
  const onRequest = (request: Request) => {
    if (settled || !matches(request)) return;
    const arrived = Date.now();
    if (!responseTimer) {
      if (arrivalTimer) clearTimeout(arrivalTimer);
      // One deadline from the first physical dispatch, never reset by replays.
      responseTimer = setTimeout(() => fail(new Error("Exact browser read did not return within its response bound.")), limits.responseMs);
    }
    // Armed at dispatch: a fast response cannot precede a later event watcher.
    // Retain the very same Request object with its Response.
    void request.response().then(response => {
      if (settled || !response) return;
      if (response.request() !== request) { fail(new Error("Browser response did not belong to its exact dispatched request.")); return; }
      settled = true; cleanup(); resolveRead({ request, response, arrivalMs: arrived - started, responseMs: Date.now() - arrived });
    }).catch(error => fail(error instanceof Error ? error : new Error("Exact browser read failed.")));
  };
  page.on("request", onRequest);
  const arrivalTimer = setTimeout(() => fail(new Error("Exact browser read was not dispatched within its arrival bound.")), limits.arrivalMs);
  return { promise, cancel: () => fail(new Error("Browser read observation cancelled.")) };
}
