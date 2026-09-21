import { expect, it, vi } from "vitest";
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
import { getEvents } from "@/lib/events";

it("keeps missing storage distinct from empty request history when required", async () => {
  await expect(getEvents("gldf", { requireStore: true })).rejects.toThrow();
  await expect(getEvents("gldf")).resolves.toEqual([]);
});
