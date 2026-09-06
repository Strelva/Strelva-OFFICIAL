import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
}));

vi.mock("node:dns", () => ({ promises: { lookup: mocks.lookup } }));
vi.mock("node:https", () => ({ request: mocks.request }));

import { fetchPinnedPublicText } from "@/lib/pinned-public-text";

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
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });
});

describe("pinned public text transport", () => {
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
