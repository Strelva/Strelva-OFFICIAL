import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safe = vi.hoisted(() => ({ allow: true }));
vi.mock("../lib/safe-fetch", () => ({
  isSafeFetchUrl: () => safe.allow,
}));

import { postCustomChangeRequest } from "../lib/custom-request-client";

const fetchMock = vi.fn();

beforeEach(() => {
  safe.allow = true;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const input = { url: "https://client.example.com/api/custom", secret: "s", feature: "cart", summary: "add cart" };

describe("postCustomChangeRequest", () => {
  it("refuses an unsafe URL without ever calling fetch (SSRF guard baked in)", async () => {
    safe.allow = false;
    const res = await postCustomChangeRequest(input);
    expect(res).toEqual({ ok: false, reason: "unsafe_url" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts with the bearer secret and reports success", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const res = await postCustomChangeRequest(input);
    expect(res).toEqual({ ok: true, status: 200 });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(input.url);
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer s");
    expect(JSON.parse(opts.body)).toMatchObject({ feature: "cart", summary: "add cart", requestedBy: "Strelva AI agent" });
  });

  it("maps a non-2xx response to an http_error result", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const res = await postCustomChangeRequest(input);
    expect(res).toEqual({ ok: false, reason: "http_error", status: 503 });
  });

  it("maps a thrown fetch to a network_error result (no throw)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await postCustomChangeRequest(input);
    expect(res).toEqual({ ok: false, reason: "network_error", error: "ECONNREFUSED" });
  });
});
