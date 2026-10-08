import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
}));

vi.mock("node:dns", () => ({ promises: { lookup: mocks.lookup } }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));

import { fetchPinnedPublicResponse, fetchPinnedPublicText } from "@/lib/pinned-public-text";
import { fetchRebuildPage } from "@/products/websites/rebuild-crawl";

type RequestCallback = (response: PassThrough & {
  statusCode: number;
  headers: Record<string, string>;
}) => void;

function respond(statusCode: number, headers: Record<string, string>, body: string | Buffer = "") {
  const requestDestroy = vi.fn();
  const stats = { bodyListenersAtCallback: -1, responseDestroyedAtCallback: false };
  mocks.request.mockImplementationOnce((_url: URL, _options: unknown, callback: RequestCallback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    request.end = () => {
      const response = new PassThrough() as PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = statusCode;
      response.headers = headers;
      callback(response);
      stats.bodyListenersAtCallback = response.listenerCount("data");
      stats.responseDestroyedAtCallback = response.destroyed;
      response.end(body);
    };
    request.destroy = requestDestroy;
    return request;
  });
  return { requestDestroy, stats };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => vi.unstubAllEnvs());

describe("pinned public text transport", () => {
  it("pins the request lookup to the address that passed validation", async () => {
    respond(200, { "content-type": "text/html" }, "<p>safe</p>");
    let resolutions = 0;
    mocks.lookup.mockImplementation(async () => {
      resolutions += 1;
      return [{ address: resolutions === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }];
    });

    await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBe("<p>safe</p>");
    expect(resolutions).toBe(1);
    expect(mocks.lookup).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
    const options = mocks.request.mock.calls[0]?.[1] as {
      family: number;
      autoSelectFamily: boolean;
      headers: Record<string, string>;
      lookup: (hostname: string, options: object, callback: (error: Error | null, address: string, family: number) => void) => void;
    };
    expect(options.family).toBe(4);
    expect(options.autoSelectFamily).toBe(false);
    expect(options.headers["accept-encoding"]).toBe("identity");
    const callback = vi.fn();
    options.lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    const allCallback = vi.fn();
    options.lookup("example.com", { all: true }, allCallback);
    expect(allCallback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("validates a redirect before opening its socket", async () => {
    mocks.lookup.mockImplementation(async (hostname: string) => [{
      address: hostname === "127.0.0.1" ? "127.0.0.1" : "93.184.216.34",
      family: 4,
    }]);
    const abandoned = respond(302, { location: "http://127.0.0.1/internal" }, "must not be read");

    await expect(fetchPinnedPublicText("https://example.com/start")).resolves.toBeNull();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(abandoned.requestDestroy).toHaveBeenCalledOnce();
    expect(abandoned.stats).toEqual({ bodyListenersAtCallback: 0, responseDestroyedAtCallback: true });
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "metadata"],
    ["192.168.1.7", "private network"],
  ])("rejects a redirect to %s (%s) before requesting the target", async (address) => {
    mocks.lookup.mockImplementation(async (hostname: string) => [{
      address: hostname === address ? address : "93.184.216.34",
      family: 4,
    }]);
    const redirect = respond(302, { location: `http://${address}/secret` }, "redirect body must not be read");

    await expect(fetchPinnedPublicResponse("https://example.com/start")).rejects.toThrow("Blocked: resolved to private IP");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(redirect.stats).toEqual({ bodyListenersAtCallback: 0, responseDestroyedAtCallback: true });
  });

  it("follows ordinary public redirects and pins the final host independently", async () => {
    respond(302, { location: "https://www.example.com/final" }, "redirect body");
    respond(200, { "content-type": "text/html" }, "<p>final page</p>");

    const response = await fetchPinnedPublicResponse("https://example.com/start");
    expect(response).toMatchObject({ url: "https://www.example.com/final", status: 200 });
    expect(response?.body.toString("utf8")).toBe("<p>final page</p>");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.lookup).toHaveBeenNthCalledWith(1, "example.com", { all: true, verbatim: true });
    expect(mocks.lookup).toHaveBeenNthCalledWith(2, "www.example.com", { all: true, verbatim: true });
  });

  it("stops at the configured redirect limit", async () => {
    respond(302, { location: "/second" });
    respond(302, { location: "/third" });
    respond(302, { location: "/fourth" });

    await expect(fetchPinnedPublicResponse("https://example.com/first", { maxRedirects: 2 })).resolves.toBeNull();
    expect(mocks.request).toHaveBeenCalledTimes(3);
    expect(mocks.lookup).toHaveBeenCalledTimes(3);
  });

  it("rejects mixed public and private DNS answers before opening a socket", async () => {
    mocks.lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.4", family: 4 },
    ]);

    await expect(fetchPinnedPublicResponse("https://example.com/")).rejects.toThrow("Blocked: resolved to private IP");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects private AAAA answers when a public A answer is also present", async () => {
    mocks.lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "fd00::5", family: 6 },
    ]);
    await expect(fetchPinnedPublicResponse("https://example.com/")).rejects.toThrow("fd00::5");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects IPv6-only DNS results instead of opening an IPv6 socket", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "2606:4700:4700::1111", family: 6 }]);
    await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBeNull();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each(["http://127.0.0.1/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/"])(
    "rejects a private literal target before DNS or socket access (%s)",
    async (url) => {
      await expect(fetchPinnedPublicResponse(url)).rejects.toThrow("Blocked: resolved to private IP");
      expect(mocks.lookup).not.toHaveBeenCalled();
      expect(mocks.request).not.toHaveBeenCalled();
    },
  );

  it("times out a pending allowUrl callback before DNS or socket access", async () => {
    vi.useFakeTimers();
    try {
      const pending = fetchPinnedPublicResponse("https://example.com/", {
        timeoutMs: 25,
        allowUrl: () => new Promise<boolean>(() => {}),
      });
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).resolves.toBeNull();
      expect(mocks.lookup).not.toHaveBeenCalled();
      expect(mocks.request).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("decodes bounded gzip responses and rejects decoded overflows and unknown encodings", async () => {
    respond(200, { "content-type": "text/plain", "content-encoding": "gzip" }, gzipSync(Buffer.from("compressed public text")));
    await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBe("compressed public text");

    respond(200, { "content-type": "text/plain", "content-encoding": "gzip" }, gzipSync(Buffer.from("x".repeat(2_000))));
    await expect(fetchPinnedPublicText("https://example.com/", { maxBytes: 100 })).resolves.toBeNull();

    respond(200, { "content-type": "text/plain", "content-encoding": "zstd" }, "opaque");
    await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBeNull();
  });

  it("rejects declared and streamed bodies over the configured limit", async () => {
    respond(200, { "content-type": "text/html", "content-length": "1001" }, "small");
    await expect(fetchPinnedPublicText("https://example.com", { maxBytes: 1_000 })).resolves.toBeNull();

    respond(200, { "content-type": "text/plain" }, "12345");
    await expect(fetchPinnedPublicText("https://example.com", { maxBytes: 4 })).resolves.toBeNull();
  });

  it("includes DNS resolution in one overall deadline", async () => {
    vi.useFakeTimers();
    mocks.lookup.mockReturnValue(new Promise(() => {}));
    const pending = fetchPinnedPublicText("https://example.com", { timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toBeNull();
    expect(mocks.request).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("bounds a pending HTTP response by the same overall deadline", async () => {
    vi.useFakeTimers();
    mocks.request.mockImplementationOnce(() => {
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
      request.end = () => {};
      request.destroy = vi.fn();
      return request;
    });
    try {
      const pending = fetchPinnedPublicResponse("https://example.com", { timeoutMs: 25 });
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).resolves.toBeNull();
      expect(mocks.request).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps rebuild redirect port and production scheme policy on every hop", async () => {
    respond(302, { location: "https://example.com:8443/private" }, "redirect body");
    await expect(fetchRebuildPage("https://example.com/", { maxBytes: 1000, timeoutMs: 1000 })).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);

    vi.stubEnv("NODE_ENV", "production");
    vi.clearAllMocks();
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    respond(302, { location: "http://example.com/insecure" }, "redirect body");
    await expect(fetchRebuildPage("https://example.com/", { maxBytes: 1000, timeoutMs: 1000 })).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });
});
