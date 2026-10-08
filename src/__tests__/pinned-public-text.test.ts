import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
}));

vi.mock("node:dns", () => ({ promises: { lookup: mocks.lookup } }));
vi.mock("node:https", () => ({ request: mocks.request }));

import { fetchPinnedPublicText } from "@/platform/infra/pinned-public-text";
import { fetchPinnedPublicText as legacyFetchPinnedPublicText } from "@/lib/pinned-public-text";

type RequestCallback = (response: PassThrough & {
  statusCode: number;
  headers: Record<string, string>;
}) => void;

function respond(statusCode: number, headers: Record<string, string>, body = "") {
  const requestDestroy = vi.fn();
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
      response.end(body);
    };
    request.destroy = requestDestroy;
    return request;
  });
  return { requestDestroy };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pinned public text transport", () => {
  it("keeps the tenant compatibility path on the same shared transport", () => {
    expect(legacyFetchPinnedPublicText).toBe(fetchPinnedPublicText);
  });

  it.each([
    "https://user:password@example.com/",
    "https://user@example.com/",
    "file:///etc/passwd",
    "ftp://example.com/",
    "not a URL",
  ])("refuses unsafe input before DNS or a socket: %s", async (url) => {
    await expect(fetchPinnedPublicText(url)).resolves.toBeNull();
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each(["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "198.18.0.1"])(
    "refuses a public hostname resolving to restricted address %s", async (address) => {
      mocks.lookup.mockResolvedValueOnce({ address, family: 4 });
      await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBeNull();
      expect(mocks.lookup).toHaveBeenCalledWith("example.com", { family: 4 });
      expect(mocks.request).not.toHaveBeenCalled();
    },
  );

  it("fails closed when DNS is unavailable", async () => {
    mocks.lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBeNull();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("pins the request lookup to the address that passed validation", async () => {
    respond(200, { "content-type": "text/html" }, "<p>safe</p>");

    await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBe("<p>safe</p>");
    const options = mocks.request.mock.calls[0]?.[1] as {
      family: number;
      autoSelectFamily: boolean;
      lookup: (hostname: string, options: object, callback: (error: Error | null, address: string, family: number) => void) => void;
    };
    expect(options.family).toBe(4);
    expect(options.autoSelectFamily).toBe(false);
    const callback = vi.fn();
    options.lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    const allCallback = vi.fn();
    options.lookup("example.com", { all: true }, allCallback);
    expect(allCallback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("validates a redirect before opening its socket", async () => {
    mocks.lookup.mockImplementation(async (hostname: string) => ({
      address: hostname === "127.0.0.1" ? "127.0.0.1" : "93.184.216.34",
      family: 4,
    }));
    const abandoned = respond(302, { location: "http://127.0.0.1/internal" });

    await expect(fetchPinnedPublicText("https://example.com/start")).resolves.toBeNull();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(abandoned.requestDestroy).toHaveBeenCalledOnce();
  });

  it("rejects declared and streamed bodies over the configured limit", async () => {
    respond(200, { "content-type": "text/html", "content-length": "1001" }, "small");
    await expect(fetchPinnedPublicText("https://example.com", { maxBytes: 1_000 })).resolves.toBeNull();

    respond(200, { "content-type": "text/plain" }, "12345");
    await expect(fetchPinnedPublicText("https://example.com", { maxBytes: 4 })).resolves.toBeNull();
  });

  it("rejects non-text responses and unsuccessful HTTP responses", async () => {
    respond(200, { "content-type": "application/octet-stream" }, "binary");
    await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBeNull();
    respond(503, { "content-type": "text/html" }, "unavailable");
    await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBeNull();
  });

  it("validates each relative redirect and stops at the redirect limit", async () => {
    respond(302, { location: "/second" });
    respond(302, { location: "/third" });
    await expect(fetchPinnedPublicText("https://example.com/first", { maxRedirects: 1 })).resolves.toBeNull();
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect((mocks.request.mock.calls[1]?.[0] as URL).pathname).toBe("/second");
  });

  it("refuses credentials on a redirect without opening its socket", async () => {
    respond(302, { location: "https://user:password@example.com/private" });
    await expect(fetchPinnedPublicText("https://example.com/")).resolves.toBeNull();
    expect(mocks.lookup).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledOnce();
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
});
