import { afterEach, describe, expect, it, vi } from "vitest";
import { isSafeFetchUrl } from "@/lib/safe-fetch";

describe("isSafeFetchUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects non-http(s) schemes and garbage", () => {
    expect(isSafeFetchUrl("data:text/html,<script>")).toBe(false);
    expect(isSafeFetchUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeFetchUrl("not a url")).toBe(false);
    expect(isSafeFetchUrl("")).toBe(false);
    expect(isSafeFetchUrl(null)).toBe(false);
  });

  it("in production blocks private/reserved/loopback/metadata + non-https", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isSafeFetchUrl("http://example.com")).toBe(false); // not https
    expect(isSafeFetchUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeFetchUrl("https://127.0.0.1/")).toBe(false);
    expect(isSafeFetchUrl("https://10.0.0.5/")).toBe(false);
    expect(isSafeFetchUrl("https://192.168.1.1/")).toBe(false);
    expect(isSafeFetchUrl("https://172.16.0.1/")).toBe(false);
    expect(isSafeFetchUrl("https://localhost/")).toBe(false);
    expect(isSafeFetchUrl("https://metadata.google.internal/")).toBe(false);
    expect(isSafeFetchUrl("https://gldf.com/api/revalidate")).toBe(true);
  });

  it("in dev allows http + localhost for local client-repo testing", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isSafeFetchUrl("http://localhost:3001/api/revalidate")).toBe(true);
    expect(isSafeFetchUrl("https://gldf.com/api/revalidate")).toBe(true);
    expect(isSafeFetchUrl("data:text/html,x")).toBe(false); // scheme still blocked
  });
});
