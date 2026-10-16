import { describe, expect, it } from "vitest";
import {
  CARE_CHECK_LABEL, CARE_DELIVERY_COPY, careChangeTitle, careDeliveryLine, careHeadline, careMonthLabel, careOutcomeLine,
  careReleaseLabel, careReportTitle, careSiteCheckLines, careTimeLabel, careUsageLine, currentCareMonth, previousCareMonth,
} from "@/platform/care-reports/model";
import { facts } from "./care-reports-fixtures";

describe("Care plan report wording", () => {
  it("labels and steps months in UTC", () => {
    expect(careMonthLabel("2026-10")).toBe("October 2026");
    expect(currentCareMonth(new Date("2026-10-15T12:00:00Z"))).toBe("2026-10");
    expect(previousCareMonth(new Date("2026-10-15T12:00:00Z"))).toBe("2026-09");
    expect(previousCareMonth(new Date("2026-01-02T00:00:00Z"))).toBe("2025-12");
  });

  it("titles a finished month and a partial one", () => {
    expect(careReportTitle(facts())).toBe("October 2026 report");
    expect(careReportTitle(facts({ through: "2026-10-15T14:00:00+00:00" }))).toBe("October 2026 so far · through Oct 15");
  });

  it("names a change by System and Release", () => {
    expect(careChangeTitle({ systemName: "Website", release: 3 })).toBe("Website · Release 3");
    expect(careReleaseLabel(2)).toBe("Release 2");
    expect(CARE_CHECK_LABEL.not_checked).toBe("Not checked on the live site");
  });

  it("writes time as minutes and hours", () => {
    expect([careTimeLabel(45), careTimeLabel(120), careTimeLabel(200), careTimeLabel(60)]).toEqual(["45 min", "2 h", "3 h 20 min", "1 h"]);
  });

  it("counts assistant runs and never prices them", () => {
    expect(careUsageLine({ calls: 0 })).toBe("No Strelva assistant runs");
    expect(careUsageLine({ calls: 1 })).toBe("1 Ask Strelva and drafting run");
    expect(careUsageLine({ calls: 12 })).toBe("12 Ask Strelva and drafting runs");
  });

  it("builds the headline and omits zero parts", () => {
    expect(careHeadline(facts())).toBe("1 checked change · 1 request done · 3 h 20 min recorded");
    const none = facts();
    none.changes.confirmed = 0; none.requests.doneCount = 0; none.time.minutes = 0;
    expect(careHeadline(none)).toBe("No recorded work this month");
    none.requests.doneCount = 3;
    expect(careHeadline(none)).toBe("3 requests done");
  });

  it("reads outcomes when available and says why when not", () => {
    expect(careOutcomeLine({ available: false, reason: "read_failed" })).toBe("Inquiries and bookings couldn't be read for this month.");
    expect(careOutcomeLine({ available: false, reason: "no_member" })).toBe("Inquiries and bookings aren't counted until someone from the business has signed in.");
    const month = {
      workspaceId: "w", month: "2026-10", sites: 1, visits: { kind: "counted", value: 412 }, inquiries: { kind: "counted", value: 9 },
      answered: { kind: "linked", value: 9, withinDay: 8 }, bookings: { kind: "counted", value: 3, native: 3, legacy: null },
      bookingsFromInquiry: { kind: "linked", value: 2, joins: [] }, reviews: { kind: "counted", value: 2 },
    };
    expect(careOutcomeLine({ available: true, month })).toContain("412 visits.");
  });

  it("lists site checks as recorded evidence, never uptime", () => {
    const empty = careSiteCheckLines({ hosted: { checks: 0, healthy: 0, lastCheckedAt: null }, readBacks: { confirmed: 0, notConfirmed: 0, notChecked: 0 }, latest: [] });
    expect(empty).toEqual(["No site checks were recorded this month.", "These are recorded checks, not continuous uptime."]);
    const full = careSiteCheckLines({
      hosted: { checks: 12, healthy: 12, lastCheckedAt: "2026-10-14T00:00:00Z" },
      readBacks: { confirmed: 2, notConfirmed: 1, notChecked: 1 },
      latest: [{ host: "juniper.com", state: "up", checkedAt: "2026-10-14T09:00:00Z" }],
    });
    expect(full).toEqual([
      "12 site checks · 12 found the published page",
      "2 website deploys checked on the live site",
      "1 website deploy not confirmed on the live site",
      "1 website deploy not checked on the live site",
      "juniper.com was up when last checked, Oct 14",
      "These are recorded checks, not continuous uptime.",
    ]);
  });

  it("explains every held delivery in plain words", () => {
    for (const reason of ["email_off", "no_trusted_owner_recipient", "owner_recipient_is_staff", "owner_recipient_check_unavailable", "agency_identity_unavailable"]) {
      expect(careDeliveryLine({ status: "suppressed", reason, recordedAt: "2026-10-15T00:00:00Z" }, true)).toBe(CARE_DELIVERY_COPY[reason]);
    }
    expect(careDeliveryLine({ status: "suppressed", reason: null, recordedAt: "2026-10-15T00:00:00Z" }, true)).toBe("Not sent. Copy the link instead.");
    expect(careDeliveryLine({ status: "accepted", recordedAt: "2026-10-15T09:00:00Z" }, true)).toBe("Emailed Oct 15. Delivery to the inbox isn't confirmed.");
    expect(careDeliveryLine({ status: "unknown", recordedAt: "2026-10-15T09:00:00Z" }, true)).toBe("Email outcome unknown. It won't be sent again.");
    expect(careDeliveryLine({ status: "reserved", recordedAt: "2026-10-15T09:00:00Z" }, true)).toBe("Sending…");
    expect(careDeliveryLine(null, false)).toBe("Not sent: email is off. Copy the link and send it yourself.");
    expect(careDeliveryLine(null, true)).toBe("Not emailed yet.");
  });
});
