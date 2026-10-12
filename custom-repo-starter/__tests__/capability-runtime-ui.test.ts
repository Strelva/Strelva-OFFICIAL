// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPublishedCapabilities } from "../website-generation/capability-runtime.mjs";

const config = {
  baseUrl: "https://app.example",
  tenant: "northstar",
  booking: {
    capabilityId: "booking-main",
    version: 4,
    range: { from: "2026-10-01T13:00:00+00:00", to: "2026-10-31T22:00:00+00:00" },
  },
};

const schedule = {
  schemaVersion: 1,
  capabilityId: "booking-main",
  version: 4,
  name: "Consultations",
  provider: "outlook",
  timeZone: "America/New_York",
  slots: [{ id: "slot-12345678", start: "2026-10-01T13:00:00+00:00", end: "2026-10-01T14:00:00+00:00" }],
};

const pending = {
  schemaVersion: 1,
  reservationId: "reservation-12345678",
  managementToken: "management-12345678",
  capabilityId: "booking-main",
  version: 4,
  provider: "outlook",
  status: "pending",
  title: "Consultations",
  start: schedule.slots[0]!.start,
  end: schedule.slots[0]!.end,
  timeZone: schedule.timeZone,
};

const confirmed = { ...pending, status: "confirmed" };

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("generated booking runtime pending state", () => {
  it("offers readback and keeps change/cancel hidden until confirmation", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(schedule))
      .mockResolvedValueOnce(response(pending, 201))
      .mockResolvedValueOnce(response(confirmed));
    vi.stubGlobal("fetch", fetcher);
    const scope = document.createElement("div");
    const root = document.createElement("div");
    root.setAttribute("data-strelva-capability", "booking");
    root.setAttribute("data-strelva-config", JSON.stringify(config));
    scope.append(root);
    document.body.append(scope);
    mountPublishedCapabilities(document);
    await settle();

    const name = root.querySelector<HTMLInputElement>("#strelva-booking-name")!;
    const email = root.querySelector<HTMLInputElement>("#strelva-booking-email")!;
    name.value = "Avery Buyer";
    email.value = "avery@example.test";
    root.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();

    expect(root.textContent).toContain("Check the calendar before trying again.");
    expect([...root.querySelectorAll("button")].map(button => button.textContent)).toEqual(expect.arrayContaining(["Check booking status"]));
    expect(root.textContent).not.toContain("Change time");
    expect(root.textContent).not.toContain("Cancel booking");

    root.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
    await settle();
    expect(fetcher.mock.calls[2]![0]).toContain("/readback");
    expect(root.textContent).toContain("Confirmed");
  });
});


describe("generated booking conflict guidance", () => {
  it("shows fresh choices and retries them with the preserved visitor", async () => {
    const next = { id: "next-slot-12345678", start: "2026-10-02T13:00:00Z", end: "2026-10-02T14:00:00Z" };
    const fetcher = vi.fn().mockResolvedValueOnce(response(schedule))
      .mockResolvedValueOnce(response({ error: "That time was taken.", nextSlots: [next], timeZone: schedule.timeZone }, 409))
      .mockResolvedValueOnce(response({ ...confirmed, start: next.start, end: next.end }, 201));
    vi.stubGlobal("fetch", fetcher);
    const root = document.createElement("div"); root.setAttribute("data-strelva-capability", "booking"); root.setAttribute("data-strelva-config", JSON.stringify(config)); document.body.append(root);
    mountPublishedCapabilities(document); await settle();
    const name = root.querySelector<HTMLInputElement>("#strelva-booking-name")!; const email = root.querySelector<HTMLInputElement>("#strelva-booking-email")!;
    name.value = "Avery Buyer"; email.value = "avery@example.test";
    const form = root.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await settle();
    expect(root.textContent).toContain("The next available times"); expect(root.querySelectorAll("option")).toHaveLength(1); expect(name.value).toBe("Avery Buyer");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await settle();
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toMatchObject({ slotId: next.id, visitor: { name: "Avery Buyer", email: "avery@example.test" } });
  });
});


describe("native business receipt and phone", () => {
  it("keeps the generated form available with a neutral note when the browser zone cannot be read", async () => {
    const options = new Intl.DateTimeFormat().resolvedOptions();
    const zone = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ ...options, timeZone: "Invalid/Zone" });
    try {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ...schedule, bookingAuthority: "business" })));
      const root = document.createElement("div"); root.setAttribute("data-strelva-capability", "booking"); root.setAttribute("data-strelva-config", JSON.stringify(config)); document.body.append(root);
      mountPublishedCapabilities(document); await settle();
      expect(root.textContent).toContain("Time zone unavailable.");
      expect(root.querySelector('form[aria-label="Reserve a time"]')).not.toBeNull();
      expect(root.textContent).not.toContain(" UTC");
    } finally { zone.mockRestore(); }
  });
  it("keeps phone and shows business confirmation without asserting a provider copy", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ...schedule, bookingAuthority: "business" }))
      .mockResolvedValueOnce(response(pending,201)).mockResolvedValueOnce(response(confirmed));
    vi.stubGlobal("fetch",fetcher);
    const root=document.createElement("div");root.setAttribute("data-strelva-capability","booking");root.setAttribute("data-strelva-config",JSON.stringify(config));document.body.append(root);
    mountPublishedCapabilities(document);await settle();
    expect(root.textContent).toContain(`Times shown in ${(Intl.DateTimeFormat().resolvedOptions().timeZone === "UTC" ? "UTC" : new Intl.DateTimeFormat(undefined, { timeZoneName: "longGeneric" }).formatToParts(new Date()).find(part => part.type === "timeZoneName")!.value)}.`);
    const name=root.querySelector<HTMLInputElement>("#strelva-booking-name")!;const email=root.querySelector<HTMLInputElement>("#strelva-booking-email")!;const phone=root.querySelector<HTMLInputElement>("#strelva-booking-phone")!;
    name.value="Dana";email.value="dana@example.test";phone.value=" 716-555-0123 ";
    root.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));await settle();
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).visitor.phone).toBe("716-555-0123");
    expect(root.textContent).toContain("Your request is waiting for the business to confirm");expect(root.textContent).not.toContain("Check the calendar");
    Array.from(root.querySelectorAll("button")).find(button=>button.textContent==="Check request status")!.click();await settle();
    expect(root.textContent).toContain("Confirmed");expect(root.textContent).not.toContain("Outlook confirmed");
  });
});


describe("generated booking receipt next action", () => {
  it("shows email confirmation, deadline, waiting business and confirmed management in order", async () => {
    const metadata = { businessName: "Northstar", confirmationExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ...schedule, bookingAuthority: "business" }))
      .mockResolvedValueOnce(response({ ...pending, ...metadata, confirmationRequired: true }, 201))
      .mockResolvedValueOnce(response({ ...pending, ...metadata, confirmationRequired: false }))
      .mockResolvedValueOnce(response({ ...confirmed, ...metadata, confirmationRequired: false }));
    vi.stubGlobal("fetch", fetcher);
    const root = document.createElement("div");
    root.setAttribute("data-strelva-capability", "booking");
    root.setAttribute("data-strelva-config", JSON.stringify(config));
    document.body.append(root);
    mountPublishedCapabilities(document);
    await settle();
    root.querySelector<HTMLInputElement>("#strelva-booking-name")!.value = "Dana";
    root.querySelector<HTMLInputElement>("#strelva-booking-email")!.value = "dana@example.test";
    root.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    const section = root.querySelector('section[aria-label="Booking receipt"]')!;
    expect(section.querySelector("h3")?.textContent).toBe("Check your email to confirm");
    expect(section.textContent).toContain("Confirm by");
    expect(section.textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone === "UTC" ? "UTC" : new Intl.DateTimeFormat(undefined, { timeZoneName: "longGeneric" }).formatToParts(new Date(metadata.confirmationExpiresAt)).find(part => part.type === "timeZoneName")!.value);
    expect(section.textContent).not.toContain("Cancel booking");
    section.querySelector<HTMLButtonElement>("button")!.click();
    await settle();
    expect(section.querySelector("h3")?.textContent).toBe("Waiting on Northstar");
    expect(section.textContent).not.toContain("Confirm by");
    section.querySelector<HTMLButtonElement>("button")!.click();
    await settle();
    expect(section.querySelector("h3")?.textContent).toBe("Confirmed");
    expect(section.textContent).toContain("Cancel booking");
    expect(section.textContent).not.toMatch(/reservation/i);
  });
  it("calls generic provider pending an unconfirmed outcome", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(schedule)).mockResolvedValueOnce(response(pending, 201));
    vi.stubGlobal("fetch", fetcher);
    const root = document.createElement("div");
    root.setAttribute("data-strelva-capability", "booking");
    root.setAttribute("data-strelva-config", JSON.stringify(config));
    document.body.append(root);
    mountPublishedCapabilities(document);
    await settle();
    root.querySelector<HTMLInputElement>("#strelva-booking-name")!.value = "Dana";
    root.querySelector<HTMLInputElement>("#strelva-booking-email")!.value = "dana@example.test";
    root.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    expect(root.querySelector('section[aria-label="Booking receipt"] h3')?.textContent).toBe("Outcome not confirmed");
    expect(root.querySelector("option")?.textContent).toContain("Eastern Time");
    expect(root.querySelector("option")?.textContent?.match(/Eastern Time/g)).toHaveLength(1);
    expect(root.textContent).not.toContain("Waiting on");
    expect(root.textContent).not.toContain("confirmation email");
  });
});


it("does not invite expired email confirmation in the generated runtime", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ ...schedule, bookingAuthority: "business" })).mockResolvedValueOnce(response({ ...pending, confirmationRequired: true, confirmationExpiresAt: new Date(Date.now() - 1_000).toISOString(), businessName: "Northstar" }, 201));
  vi.stubGlobal("fetch", fetcher);
  const root = document.createElement("div");
  root.setAttribute("data-strelva-capability", "booking");
  root.setAttribute("data-strelva-config", JSON.stringify(config));
  document.body.append(root);
  mountPublishedCapabilities(document);
  await settle();
  root.querySelector<HTMLInputElement>("#strelva-booking-name")!.value = "Dana";
  root.querySelector<HTMLInputElement>("#strelva-booking-email")!.value = "dana@example.test";
  root.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await settle();
  const section = root.querySelector('section[aria-label="Booking receipt"]')!;
  expect(section.querySelector("h3")?.textContent).toBe("Confirmation time expired");
  expect(section.textContent).toContain("Contact Northstar to request a new time.");
  expect(section.textContent).not.toContain("use its link");
});


it("updates an open generated receipt when its confirmation deadline passes", async () => {
  vi.useFakeTimers();
  const deadline = new Date(Date.now() + 1_000).toISOString();
  const fetcher = vi.fn().mockResolvedValueOnce(response({ ...schedule, bookingAuthority: "business" })).mockResolvedValueOnce(response({ ...pending, confirmationRequired: true, confirmationExpiresAt: deadline }, 201));
  vi.stubGlobal("fetch", fetcher);
  const root = document.createElement("div");
  root.setAttribute("data-strelva-capability", "booking");
  root.setAttribute("data-strelva-config", JSON.stringify(config));
  document.body.append(root);
  mountPublishedCapabilities(document);
  await settle();
  root.querySelector<HTMLInputElement>("#strelva-booking-name")!.value = "Dana";
  root.querySelector<HTMLInputElement>("#strelva-booking-email")!.value = "dana@example.test";
  root.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await settle();
  const section = root.querySelector('section[aria-label="Booking receipt"]')!;
  expect(section.querySelector("h3")?.textContent).toBe("Check your email to confirm");
  vi.advanceTimersByTime(1_001);
  expect(section.querySelector("h3")?.textContent).toBe("Confirmation time expired");
  expect(section.textContent).not.toContain("use its link");
});
