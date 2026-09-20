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
    expect(root.textContent).not.toContain("Cancel reservation");

    root.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
    await settle();
    expect(fetcher.mock.calls[2]![0]).toContain("/readback");
    expect(root.textContent).toContain("Outlook confirmed this reservation.");
  });
});
