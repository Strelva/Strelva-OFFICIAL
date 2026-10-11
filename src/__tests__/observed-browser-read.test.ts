import { EventEmitter } from "node:events";
import type { Page, Request, Response } from "@playwright/test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { observeBrowserRead } from "../../tests/support/observed-browser-read";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fixture() {
  const events = new EventEmitter();
  const page = events as unknown as Page;
  const matches = (request: Request) => request.url() === "http://localhost/api/exact";
  return { events, arm: () => observeBrowserRead(page, matches, { arrivalMs: 10_000, responseMs: 10_000 }) };
}
function request(url = "http://localhost/api/exact") {
  let finish!: (response: Response | null) => void;
  const nativeResponse = new Promise<Response | null>(resolve => { finish = resolve; });
  const actual = { url: () => url, response: vi.fn(() => nativeResponse) } as unknown as Request;
  return { actual, finish, response: { request: () => actual, status: () => 200 } as unknown as Response };
}
it("requires a fresh dispatched Request, ignoring an older pending response", async () => {
  const f = fixture(); const old = request(); const pending = f.arm();
  f.events.emit("response", old.response); old.finish(old.response);
  expect(old.actual.response).not.toHaveBeenCalled();
  const fresh = request(); f.events.emit("request", fresh.actual); fresh.finish(fresh.response);
  const receipt = await pending.promise;
  expect(receipt.request).toBe(fresh.actual); expect(receipt.response.request()).toBe(fresh.actual);
  expect(f.events.listenerCount("request")).toBe(0);
});
it("captures an immediate response because Request.response is armed at dispatch", async () => {
  const f = fixture(); const r = request(); r.finish(r.response); const pending = f.arm();
  f.events.emit("request", r.actual);
  expect((await pending.promise).response).toBe(r.response);
});
it("a Strict Mode abort is no receipt; a real replay keeps its own request identity", async () => {
  const f = fixture(); const pending = f.arm(); const aborted = request();
  f.events.emit("request", aborted.actual); aborted.finish(null); await Promise.resolve();
  const replay = request(); f.events.emit("request", replay.actual); replay.finish(replay.response);
  expect((await pending.promise).request).toBe(replay.actual);
});
it("refuses a mismatched response identity", async () => {
  const f = fixture(); const pending = f.arm(); const r = request(); const foreign = request();
  const refused = expect(pending.promise).rejects.toThrow("exact dispatched request");
  f.events.emit("request", r.actual); r.finish(foreign.response); await refused;
});
it("bounds arrival independently and removes its listener", async () => {
  const f = fixture(); const pending = f.arm(); const refused = expect(pending.promise).rejects.toThrow("arrival bound");
  await vi.advanceTimersByTimeAsync(10_000); await refused; expect(f.events.listenerCount("request")).toBe(0);
});
it("browser replays never reset the first actual response deadline", async () => {
  const f = fixture(); const pending = f.arm(); const first = request(); f.events.emit("request", first.actual); first.finish(null);
  const refused = expect(pending.promise).rejects.toThrow("response bound");
  await vi.advanceTimersByTimeAsync(9_999); f.events.emit("request", request().actual);
  await vi.advanceTimersByTimeAsync(1); await refused;
});
