import { describe, expect, it, vi } from "vitest";
import { executionAvailability, livePlanChannelsAvailable } from "@/platform/make-real/execution-availability";

describe("exact plan execution availability",()=>{
 it("requires every exact effect channel, even when another channel is live",async()=>{
  const enabled=vi.fn(async(channel:string)=>channel==="hosted_website");
  expect(await livePlanChannelsAvailable(["booking_page"],enabled)).toBe(false);
  expect(await livePlanChannelsAvailable(["hosted_website","booking_page"],enabled)).toBe(false);
  expect(await livePlanChannelsAvailable(["hosted_website"],enabled)).toBe(true);
 });
 it("unreadable and missing channels cannot advertise live execution",async()=>{
  expect(await livePlanChannelsAvailable(["hosted_website"],async()=>{throw new Error("down");})).toBe(false);
  const enabled=vi.fn(async()=>true);
  expect(await livePlanChannelsAvailable([],enabled)).toBe(false);
  expect(await livePlanChannelsAvailable(["hosted_website",undefined],enabled)).toBe(false);
  expect(enabled).not.toHaveBeenCalled();
 });
 it("offers rehearsal only for a real isolated rebuild and otherwise withholds execution",()=>{
  expect(executionAvailability(false,"website-rebuild:w",true)).toBe("rehearsal");
  expect(executionAvailability(true,"website-rebuild:w",false)).toBe("rehearsal");
  expect(executionAvailability(true,null,false)).toBe("unavailable");
  expect(executionAvailability(true,"ask-native:w",true)).toBe("live");
 });
});
