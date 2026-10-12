import { describe, expect, it, vi } from "vitest";
import { captureStorefront, compareCaptures, parseParityArgs, STOREFRONT_READS, type Fetcher } from "../../scripts/storefront-parity";

const body = (text: string) => new TextEncoder().encode(text);

describe("storefront parity", () => {
  it("refuses a production base without Jacob's yes and makes no request", async () => {
    const fetcher = vi.fn<Fetcher>();
    await expect(captureStorefront({ base: "https://app.strelva.com", tenants: ["gldf"], jacobsYes: false }, fetcher)).rejects.toThrow(/Jacob's yes/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("captures five reads per tenant as hashes, never bodies, and sends the bypass header", async () => {
    const fetcher = vi.fn<Fetcher>(async (url) => ({ status: 200, body: body(`{"url":"${url}"}`) }));
    const capture = await captureStorefront(
      { base: "http://localhost:3000", tenants: ["gldf", "rohlax"], jacobsYes: false, bypassSecret: "bypass" },
      fetcher,
      () => new Date("2026-10-06T00:00:00Z"),
    );
    expect(capture.reads).toHaveLength(2 * STOREFRONT_READS.length);
    expect(capture.reads[0]).toMatchObject({ path: "/api/v1/site-capabilities/gldf", status: 200 });
    expect(capture.reads[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(capture)).not.toContain('"url"');
    expect(fetcher.mock.calls[0]![1].headers["x-vercel-protection-bypass"]).toBe("bypass");
  });

  it("compare counts identical reads and lists every difference, including missing ones", async () => {
    const make = (variant: string) => captureStorefront(
      { base: "http://localhost:3000", tenants: ["gldf"], jacobsYes: false },
      async (url) => ({ status: url.endsWith("/hero") && variant === "b" ? 500 : 200, body: body(url.endsWith("/navigation") && variant === "b" ? "changed" : url) }),
    );
    const a = await make("a");
    const b = await make("b");
    expect(compareCaptures(a, a)).toMatchObject({ identical: 5, total: 5, differences: [] });
    const result = compareCaptures(a, { ...b, reads: b.reads.slice(0, 4) });
    // hero changed status; navigation is missing from the second capture.
    expect(result.identical).toBe(3);
    expect(result.differences.map((d) => d.path)).toEqual(["/api/v1/content/gldf/hero", "/api/v1/content/gldf/navigation"]);
    expect(result.differences[1]!.after).toBeNull();
    // a changed body with the same status is a difference too
    expect(compareCaptures(a, b).differences.map((d) => d.path)).toEqual(["/api/v1/content/gldf/hero", "/api/v1/content/gldf/navigation"]);
  });

  it("parses arguments strictly", () => {
    expect(parseParityArgs(["capture", "--base=https://x.test/", "--tenants=gldf,rohlax", "--out=/tmp/a.json", "--i-have-jacobs-yes"]))
      .toEqual({ mode: "capture", base: "https://x.test", tenants: ["gldf", "rohlax"], out: "/tmp/a.json", jacobsYes: true });
    expect(parseParityArgs(["compare", "a.json", "b.json"])).toEqual({ mode: "compare", before: "a.json", after: "b.json" });
    expect(() => parseParityArgs(["capture", "--base=x", "--tenants=../etc", "--out=o"])).toThrow(/slug/);
    expect(() => parseParityArgs(["capture", "--base=x", "--tenants=a", "--out=o", "--apply"])).toThrow(/Unknown/);
    expect(() => parseParityArgs(["push"])).toThrow(/Usage/);
  });
});
