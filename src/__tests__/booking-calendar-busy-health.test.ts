import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ status: "revoked", included: [] as string[] }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ from: () => {
  const query = { select: () => query, eq: () => query, in: (_key: string, values: string[]) => { db.included=values; return query; }, order: () => query, limit: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({data:db.included.includes(db.status) ? [{provider:"google",status:db.status}] : [],error:null}).then(resolve) };
  return query;
} }) }));
vi.mock("@/platform/infra/redis", () => ({getRedis: () => null}));
import { defaultBusyPorts, readCalendarBusy } from "@/platform/bookings/calendar-busy";
import type { BookingContext } from "@/platform/bookings/store";
const context: BookingContext = { tenantStableId:"fixture",workspaceId:"22222222-2222-4222-8222-222222222222",systemId:null,paused:false,phone:null,hours:null,services:[],settings:null };
beforeEach(() => { vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY","1"); db.status="revoked"; db.included=[]; });
afterEach(() => vi.unstubAllEnvs());
describe("revoked booking calendars remain unchecked evidence", () => {
  it("real connection selection retains revoked state, preventing instant fallback as if disconnected",async () => {
    const ports=defaultBusyPorts()!; const busy=vi.fn(async () => []);
    expect(await readCalendarBusy(context,"2026-10-07","UTC",{...ports,busy})).toEqual({connected:true,checked:false,reason:"calendar_revoked"});
    expect(busy).not.toHaveBeenCalled();
  });
  it("flags off performs no connection query",async () => {vi.stubEnv("STRELVA_BOOKING_CALENDAR_BUSY","0"); expect(await readCalendarBusy(context,"2026-10-07","UTC")).toEqual({connected:false}); expect(db.included).toEqual([]);});
});
