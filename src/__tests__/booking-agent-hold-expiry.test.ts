import { describe, expect, it } from "vitest";
import { blocksTime } from "@/platform/bookings/availability";
import type { StoreBooking } from "@/platform/bookings/store";

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const hold = (origin: string, minutesAgo: number) => ({ status: "held", origin, createdAt: at(minutesAgo) }) as unknown as StoreBooking;

describe("anonymous holds release their time on read (#547 review)", () => {
  it("frees an expired agent hold like an expired website or inquiry hold", () => {
    for (const origin of ["site", "inquiry", "agent"]) {
      expect(blocksTime(hold(origin, 5))).toBe(true);
      expect(blocksTime(hold(origin, 16))).toBe(false);
    }
  });

  it("keeps owner-recorded holds and placed bookings blocking", () => {
    expect(blocksTime(hold("owner", 60))).toBe(true);
    expect(blocksTime({ ...hold("agent", 60), status: "requested" } as StoreBooking)).toBe(true);
  });
});
