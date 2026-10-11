import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOOKING_CONFIG as legacyDefault } from "@/lib/booking";
import { DEFAULT_BOOKING_CONFIG as sharedDefault } from "@/platform/infra/booking-config";
import * as legacyContinuation from "@/lib/public-continuation";
import * as sharedContinuation from "@/platform/infra/public-continuation";
import { setStoreBookingConfig, setStoreDateOverrides } from "@/platform/bookings/tenant";

const store = vi.hoisted(() => ({ writeSettingsFields: vi.fn().mockResolvedValue({}) }));
vi.mock("@/platform/bookings/store", async (original) => ({
  ...await original<typeof import("@/platform/bookings/store")>(),
  writeBookingSettingsFields: store.writeSettingsFields,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("shared infrastructure compatibility", () => {
  it("keeps legacy and native booking defaults as the same mutable object", () => {
    expect(legacyDefault).toBe(sharedDefault);
    expect(legacyDefault.weeklySchedule).toBe(sharedDefault.weeklySchedule);
  });

  it("keeps defaults in both actual native settings writers without a companion read", async () => {
    await setStoreBookingConfig("fixture", { ...legacyDefault, slotDuration: 45 });
    await setStoreDateOverrides("fixture", [{ date: "2026-12-25", available: false }]);
    const defaults = {
      bufferMinutes: 15, minNoticeMinutes: 1440, maxAdvanceDays: 60,
      defaultLengthMinutes: 60, timezone: "America/New_York",
      bookableHours: [
        { day: 2, opens: "12:00", closes: "18:00" },
        { day: 3, opens: "10:00", closes: "16:00" },
        { day: 4, opens: "12:00", closes: "18:00" },
        { day: 5, opens: "10:00", closes: "16:00" },
      ], legacyRequiresPayment: false,
    };
    expect(store.writeSettingsFields).toHaveBeenCalledTimes(2);
    expect(store.writeSettingsFields.mock.calls[0]?.[0]).toBe("fixture");
    expect(store.writeSettingsFields.mock.calls[0]?.[1]).toBe("config");
    expect(store.writeSettingsFields.mock.calls[0]?.[2].defaultLengthMinutes).toBe(45);
    expect(store.writeSettingsFields.mock.calls[0]?.[3]).toEqual(defaults);
    expect(store.writeSettingsFields.mock.calls[1]?.[1]).toBe("overrides");
    expect(store.writeSettingsFields.mock.calls[1]?.[3]).toEqual(defaults);
  });

  it("keeps every legacy continuation export on its single shared implementation", () => {
    expect(Object.keys(legacyContinuation).sort()).toEqual(Object.keys(sharedContinuation).sort());
    expect(legacyContinuation.parsePublicContinuation).toBe(sharedContinuation.parsePublicContinuation);
    expect(legacyContinuation.sealPublicContinuation).toBe(sharedContinuation.sealPublicContinuation);
    expect(legacyContinuation.openPublicContinuation).toBe(sharedContinuation.openPublicContinuation);
    expect(legacyContinuation.publicContinuationText).toBe(sharedContinuation.publicContinuationText);
    expect(legacyContinuation.PUBLIC_CONTINUATION_COOKIE).toBe(sharedContinuation.PUBLIC_CONTINUATION_COOKIE);
    expect(legacyContinuation.PUBLIC_CONTINUATION_NEXT).toBe(sharedContinuation.PUBLIC_CONTINUATION_NEXT);
  });

  it("opens legacy-sealed briefs through the shared owner and preserves refusal", () => {
    vi.stubEnv("PUBLIC_CONTINUATION_SECRET", "fictional-shared-boundary-secret");
    const brief: legacyContinuation.PublicContinuation = {
      version: 1, id: "11111111-1111-4111-8111-111111111111",
      businessName: "Fictional Firm", request: "Prepare a page", result: "A clear contact path",
      resultTitle: "Contact page", scope: "Owner review", review: true, fileNames: [],
    };
    const sealed = legacyContinuation.sealPublicContinuation(brief);
    expect(sealed).toBeTruthy();
    expect(sharedContinuation.openPublicContinuation(sealed ?? undefined)).toEqual(brief);
    expect(sharedContinuation.openPublicContinuation(`${sealed}x`)).toBeNull();
  });
});
