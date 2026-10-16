import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { clockWords, googleChangeLines, googleDraftLines, googleDraftTitle, weeklyHoursWords } from "@/experience/connections/owner-words";
import { GoogleDrafts } from "@/experience/places/GoogleDrafts";
import { WorkspaceGoogle } from "@/experience/places/WorkspaceGoogle";

const WS = "11111111-1111-4111-8111-111111111111";
const hours = (opens: number) => ({ regularHours: { periods: [
  ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(day => ({ openDay: day, openTime: { hours: opens }, closeDay: day, closeTime: { hours: 17 } })),
  { openDay: "SATURDAY", openTime: { hours: 9 }, closeDay: "SATURDAY", closeTime: { hours: 13 } },
] } });

describe("owner words for builder formats", () => {
  it("reads clock times and weekly hours the way an owner says them", () => {
    expect(clockWords("08:00")).toBe("8"); expect(clockWords("17:30")).toBe("5:30"); expect(clockWords("00:00")).toBe("12");
    expect(weeklyHoursWords([{ day: 1, opens: "08:00", closes: "17:00" }, { day: 2, opens: "08:00", closes: "17:00" }, { day: 6, opens: "09:00", closes: "13:00" }])).toBe("Mon and Tue 8 to 5, Sat 9 to 1");
    expect(weeklyHoursWords([1, 2, 3, 4, 5].map(day => ({ day, opens: "08:00", closes: "17:00" })))).toBe("Mon to Fri 8 to 5");
    expect(weeklyHoursWords([{ day: 1, opens: "08:00", closes: "17:00" }, { day: 3, opens: "08:00", closes: "17:00" }])).toBe("Mon 8 to 5, Wed 8 to 5");
    expect(weeklyHoursWords([])).toBe("Closed every day");
  });

  it("names Google fields in owner words with what they were, and never prints raw fields", () => {
    expect(googleChangeLines(hours(9), hours(8))).toEqual(["Hours: Mon to Fri 8 to 5, Sat 9 to 1, was Mon to Fri 9 to 5, Sat 9 to 1"]);
    expect(googleChangeLines({ reply: null }, { reply: "Thank you, Tom." })).toEqual(["Reply: Thank you, Tom."]);
    expect(googleChangeLines({ reply: "Thanks so much for the kind words about our team." }, { reply: null })).toEqual(["Reply: removed, was “Thanks so much for the kind words about our team.”"]);
    expect(googleChangeLines(null, { websiteUri: "https://harbordental.com/", storeCode: "X-1", latlng: { latitude: 1 } })).toEqual(["Website: harbordental.com"]);
    expect(googleChangeLines(null, null)).toEqual([]);
  });

  it("reads a prepared draft's Google JSON as lines and its event title as a name", () => {
    expect(googleDraftLines(JSON.stringify({ phoneNumbers: { primaryPhone: "(716) 555-0142" }, websiteUri: "https://harbordental.com" }, null, 2))).toEqual(["Phone: (716) 555-0142", "Website: harbordental.com"]);
    expect(googleDraftLines(JSON.stringify({ regularHours: null, specialHours: null }))).toEqual(["Hours: cleared on Google"]);
    expect(googleDraftLines("Closed Thursday.")).toEqual(["Closed Thursday."]);
    expect(googleDraftTitle("Review your Google hours")).toBe("New hours for Google");
    expect(googleDraftTitle("Thanksgiving hours")).toBe("Thanksgiving hours");
  });
});

describe("the Google listing in XA", () => {
  const action = vi.fn(async () => undefined);
  const listing = (receipts: unknown[], drafts: { id: string; title: string; body: string }[] = []) => ({ kind: "ready" as const, data: [{ tenantId: `workspace:${WS}`, locationId: "loc", name: "Harbor Dental",
    control: { workspaceId: WS, locationId: "loc", paused: false, accessPending: false, updatedAt: null }, canManage: true, connected: true, drafts, receipts }] });

  it("shows what changed on Google with its before value, who approved it and Undo", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceGoogle, { workspaceId: WS, action, state: listing([{ id: "r1", headline: "Strelva updated your hours on Google.", before: hours(9), after: hours(8), authority: { kind: "owner_approval", actor: "owner" }, readback: "matched", status: "posted", undo: true }]) as never }));
    expect(html).toContain("Hours: Mon to Fri 8 to 5, Sat 9 to 1, was Mon to Fri 9 to 5, Sat 9 to 1");
    expect(html).toContain("You approved it"); expect(html).toContain(">Undo<");
    // Whose account is never invented: no row claims the Google account belongs to the business.
    expect(html).not.toContain("Google account"); expect(html).not.toContain("Your business");
  });

  it("states the decision's status once, names who prepared it, and keeps one primary", () => {
    const drafts = [{ id: "d1", title: "Review your Google info", body: JSON.stringify({ phoneNumbers: { primaryPhone: "(716) 555-0142" } }) }];
    const html = renderToStaticMarkup(createElement(GoogleDrafts, { drafts, listingName: "Harbor Dental", canManage: true, action, context: { workspaceId: WS, tenantId: "t", locationId: "loc" } }));
    expect(html.match(/Waits for you/g)).toHaveLength(1);
    expect(html).toContain("from your record"); expect(html).toContain("Phone: (716) 555-0142");
    expect(html).not.toContain("Not sent to Google"); expect(html).not.toContain("Also waiting");
    expect(html.match(/data-xa-primary/g)).toHaveLength(1);
  });
});
