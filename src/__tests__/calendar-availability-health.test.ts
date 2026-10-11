import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(() => ({ connection:vi.fn(),mark:vi.fn(),availability:vi.fn() }));
vi.mock("@/products/scheduling/calendar/repository", () => ({ getWorkspaceCalendarConnection:mocks.connection,markWorkspaceCalendarConnectionError:mocks.mark,readCalendarEventReceipt:vi.fn(),saveCalendarEventReceipt:vi.fn() }));
vi.mock("@/products/scheduling/calendar/adapters", async importOriginal => ({ ...await importOriginal<typeof import("@/products/scheduling/calendar/adapters")>(), createCalendarAdapter: () => ({availability:mocks.availability}) }));
import { CalendarProviderError } from "@/products/scheduling/calendar/adapters";
import { readWorkspaceProviderAvailability } from "@/products/scheduling/calendar/service";
const actor={ userId:"11111111-1111-4111-8111-111111111111",verifiedEmail:"owner@example.test" };
const WS="22222222-2222-4222-8222-222222222222";
const query={start:"2026-10-07T13:00:00Z",end:"2026-10-07T14:00:00Z"};
beforeEach(() => { vi.stubEnv("STRELVA_CALENDAR_FIXTURE","0"); mocks.connection.mockReset().mockResolvedValue({calendarId:"safe-calendar",timeZone:"UTC",status:"connected",accessToken:"PRIVATE-TOKEN",updatedAt:"2026-10-07T00:00:00Z"}); mocks.mark.mockReset().mockResolvedValue(undefined); mocks.availability.mockReset().mockResolvedValue({busy:[],observedAt:"2026-10-07T12:00:00Z"}); });
afterEach(() => vi.unstubAllEnvs());
describe("busy evidence records rejected authorization", () => {
  it.each([401,403])("%s marks the precise read connection errored for reconnect",async status => { const error=new CalendarProviderError({provider:"google",status,code:"unauthorized",message:"PRIVATE PROVIDER ERROR"}); mocks.availability.mockRejectedValue(error); await expect(readWorkspaceProviderAvailability(actor,WS,"google",query)).rejects.toBe(error); expect(mocks.mark).toHaveBeenCalledWith(actor,WS,"google","Calendar authorization was rejected. Reconnect the calendar.","2026-10-07T00:00:00Z"); });
  it("transient provider failure does not falsely revoke a healthy connection",async () => { const error=new CalendarProviderError({provider:"google",status:503,code:"provider",message:"temporary outage"}); mocks.availability.mockRejectedValue(error); await expect(readWorkspaceProviderAvailability(actor,WS,"google",query)).rejects.toBe(error); expect(mocks.mark).not.toHaveBeenCalled(); });
  it("failed health persistence preserves the provider failure, never fake availability",async () => { const error=new CalendarProviderError({provider:"google",status:401,code:"unauthorized",message:"unauthorized"}); mocks.availability.mockRejectedValue(error); mocks.mark.mockRejectedValue(new Error("database down")); await expect(readWorkspaceProviderAvailability(actor,WS,"google",query)).rejects.toBe(error); });
  it("healthy provider read adds no health write",async () => { expect(await readWorkspaceProviderAvailability(actor,WS,"google",query)).toMatchObject({busy:[]}); expect(mocks.mark).not.toHaveBeenCalled(); });
});
