import { describe, expect, it, vi } from "vitest";
import { publicBookingRangeSchema } from "@/products/scheduling/public-booking";
import { cachedPublicCalendarRead } from "@/platform/bookings/public-read";
function fixture() {
  const values = new Map<string, unknown>();
  const cache = { get: vi.fn(async <T>(key: string) => (values.get(key) ?? null) as T | null), set: vi.fn(async (key: string, value: unknown, options: { ex: number; nx?: boolean }) => {
    if (options.nx && values.has(key)) return null; values.set(key, value); return "OK";
  }) };
  const read = vi.fn(async () => ({ busy: [{ start: "2099-11-01T10:00:00Z", end: "2099-11-01T11:00:00Z" }] }));
  const limited = vi.fn(async () => false); return { values, cache, read, limited };
}
describe("public availability provider protection", () => {
  it("accepts at most 60 days", () => {
    expect(publicBookingRangeSchema.safeParse({ from: "2099-01-01T00:00:00Z", to: "2099-03-02T00:00:00Z" }).success).toBe(true);
    expect(publicBookingRangeSchema.safeParse({ from: "2099-01-01T00:00:00Z", to: "2099-03-02T00:00:01Z" }).success).toBe(false);
  });
  it("caches provider busy times for 60 seconds and avoids a second provider/limiter call on hits", async () => {
    const f = fixture(); const first = await cachedPublicCalendarRead(["business", "range"], f.read, f);
    expect(await cachedPublicCalendarRead(["business", "range"], f.read, f)).toEqual(first);
    expect(f.read).toHaveBeenCalledOnce(); expect(f.limited).toHaveBeenCalledOnce();
    expect(f.cache.set).toHaveBeenLastCalledWith(expect.any(String), first, { ex: 60 });
  });
  it("varying ranges still share the business provider budget", async () => {
    const f = fixture(); f.limited.mockResolvedValue(true);
    await expect(cachedPublicCalendarRead(["business", "new-range"], f.read, f)).rejects.toMatchObject({ status: 429 });
    expect(f.limited).toHaveBeenCalledWith("public-booking-provider:business", 10); expect(f.read).not.toHaveBeenCalled();
  });
  it.each(["limiter", "cache"])("fails closed on %s errors without hammering the provider", async kind => {
    const f = fixture(); if (kind === "limiter") f.limited.mockRejectedValue(new Error("Redis down")); else f.cache.get.mockRejectedValue(new Error("Redis down"));
    await expect(cachedPublicCalendarRead(["business"], f.read, f)).rejects.toThrow("Redis down"); expect(f.read).not.toHaveBeenCalled();
  });
  it("coalesces concurrent misses across instances with an NX fill lock", async () => {
    const f = fixture(); let resolve!: () => void;
    f.read.mockImplementation(async () => { await new Promise<void>(r => { resolve = r; }); return { busy: [] }; });
    const first = cachedPublicCalendarRead(["business"], f.read, f); await vi.waitFor(() => expect(f.read).toHaveBeenCalledOnce());
    await expect(cachedPublicCalendarRead(["business"], f.read, f)).rejects.toMatchObject({ status: 503 }); resolve(); await first;
    expect(f.read).toHaveBeenCalledOnce();
  });
});
