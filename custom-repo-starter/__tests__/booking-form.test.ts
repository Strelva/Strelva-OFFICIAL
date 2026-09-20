// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrelvaBookingForm, StrelvaConnectedBookingForm } from "../StrelvaBookingForm";
import { bookingRequestStorageKey, clearBookingRequestDraft, createBookingRequestId } from "../booking-client";
import type { PublicBookingReceipt, PublicBookingSchedule } from "../booking-client";

const schedule: PublicBookingSchedule = {
  schemaVersion: 1,
  capabilityId: "native-booking",
  version: 3,
  name: "Consultation times",
  provider: "outlook",
  timeZone: "America/New_York",
  slots: [
    { id: "slot-1-abcdefgh", start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z" },
    { id: "slot-2-abcdefgh", start: "2026-10-01T14:00:00Z", end: "2026-10-01T15:00:00Z" },
  ],
};

const receipt: PublicBookingReceipt = {
  schemaVersion: 1,
  reservationId: "reservation-abcdefgh",
  managementToken: "manage-token-abcdefgh",
  capabilityId: schedule.capabilityId,
  version: schedule.version,
  provider: "outlook",
  status: "confirmed",
  title: "Consultation",
  start: schedule.slots[0]!.start,
  end: schedule.slots[0]!.end,
  timeZone: schedule.timeZone,
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function renderForm(props: Partial<Parameters<typeof StrelvaBookingForm>[0]> = {}): Promise<void> {
  await act(async () => root.render(createElement(StrelvaBookingForm, { schedule, ...props })));
}

describe("native booking form", () => {
  it("renders a provider-backed schedule without an iframe or provider identifier", async () => {
    await renderForm();
    expect(container.textContent).toContain("Consultation times");
    expect(container.textContent).toContain("Outlook will confirm the reservation");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).not.toContain("fixture-");
  });

  it("preserves visitor fields after a failed reserve so the visitor can retry", async () => {
    const onReserve = vi.fn().mockRejectedValue(new Error("That time could not be reserved. Please choose another time."));
    await renderForm({ onReserve });
    const name = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    const email = container.querySelector<HTMLInputElement>('input[name="email"]')!;
    const message = container.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!;
    await act(async () => {
      setValue(name, "Avery Buyer");
      setValue(email, "avery@example.test");
      setValue(message, "Please call me.");
    });
    await act(async () => container.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onReserve).toHaveBeenCalledWith(schedule.slots[0], { name: "Avery Buyer", email: "avery@example.test", message: "Please call me." });
    expect(name.value).toBe("Avery Buyer");
    expect(email.value).toBe("avery@example.test");
    expect(message.value).toBe("Please call me.");
    expect(container.textContent).toContain("That time could not be reserved");
  });

  it("shows the safe receipt and carries the same reservation through change and cancel", async () => {
    const changed = { ...receipt, start: schedule.slots[1]!.start, end: schedule.slots[1]!.end };
    const cancelled = { ...changed, status: "cancelled" as const };
    const onReserve = vi.fn().mockResolvedValue(receipt);
    const onChange = vi.fn().mockResolvedValue(changed);
    const onCancel = vi.fn().mockResolvedValue(cancelled);
    await renderForm({ onReserve, onChange, onCancel });
    await act(async () => {
      setValue(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Avery Buyer");
      setValue(container.querySelector<HTMLInputElement>('input[name="email"]')!, "avery@example.test");
    });
    await act(async () => container.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("Outlook confirmed this reservation.");
    expect(onReserve).toHaveBeenCalledTimes(1);

    await act(async () => container.querySelector<HTMLFormElement>('form[aria-label="Change reservation"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onChange).toHaveBeenCalledWith(receipt, schedule.slots[0]);
    expect(container.textContent).toContain("Your reservation was changed.");

    await act(async () => (container.querySelector('button[type="button"]') as HTMLButtonElement).click());
    expect(onCancel).toHaveBeenCalledWith(changed);
    expect(container.textContent).toContain("This reservation is cancelled.");
  });

  it("connects the generated-site renderer to the public schedule and receipt lifecycle", async () => {
    const changed = { ...receipt, start: schedule.slots[1]!.start, end: schedule.slots[1]!.end };
    const cancelled = { ...changed, status: "cancelled" as const };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(schedule))
      .mockResolvedValueOnce(Response.json({ receipt }))
      .mockResolvedValueOnce(Response.json({ receipt: changed }))
      .mockResolvedValueOnce(Response.json({ receipt: cancelled }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(StrelvaConnectedBookingForm, {
      baseUrl: "https://app.example",
      tenant: "example",
      capabilityId: schedule.capabilityId,
      range: { from: "2026-10-01T00:00:00Z", to: "2026-10-08T00:00:00Z" },
    })));
    expect(container.textContent).toContain("Consultation times");
    await act(async () => {
      setValue(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Avery Buyer");
      setValue(container.querySelector<HTMLInputElement>('input[name="email"]')!, "avery@example.test");
      container.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body))).toMatchObject({ capabilityId: schedule.capabilityId, capabilityVersion: schedule.version, slotId: schedule.slots[0]!.id, requestId: expect.stringMatching(/^request-/) });
    expect(container.textContent).toContain("Outlook confirmed this reservation.");
    await act(async () => container.querySelector<HTMLFormElement>('form[aria-label="Change reservation"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => (container.querySelector('button[type="button"]') as HTMLButtonElement).click());
    expect(fetcher.mock.calls[2]?.[0]).toContain("/reservations/reservation-abcdefgh");
    expect(fetcher.mock.calls[3]?.[0]).toContain("/reservations/reservation-abcdefgh");
    expect(container.textContent).toContain("This reservation is cancelled.");
  });

  it("reuses the same request id when the first reserve response is lost", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(schedule))
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockResolvedValueOnce(Response.json({ receipt }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(StrelvaConnectedBookingForm, {
      baseUrl: "https://app.example",
      tenant: "example",
      capabilityId: schedule.capabilityId,
      range: { from: "2026-10-01T00:00:00Z", to: "2026-10-08T00:00:00Z" },
    })));
    await act(async () => {
      setValue(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Avery Buyer");
      setValue(container.querySelector<HTMLInputElement>('input[name="email"]')!, "avery@example.test");
      container.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const firstBody = JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body));
    expect(container.textContent).toContain("network interrupted");
    await act(async () => container.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const secondBody = JSON.parse(String((fetcher.mock.calls[2]?.[1] as RequestInit).body));
    expect(secondBody.requestId).toBe(firstBody.requestId);
    expect(container.textContent).toContain("Outlook confirmed this reservation.");
  });

  it("restores the same pending request and visitor details after a remount", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(schedule))
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockResolvedValueOnce(Response.json(schedule))
      .mockResolvedValueOnce(Response.json({ receipt }));
    vi.stubGlobal("fetch", fetcher);
    const props = {
      baseUrl: "https://app.example",
      tenant: "example",
      capabilityId: schedule.capabilityId,
      range: { from: "2026-10-01T00:00:00Z", to: "2026-10-08T00:00:00Z" },
    };
    await act(async () => root.render(createElement(StrelvaConnectedBookingForm, props)));
    await act(async () => {
      setValue(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Avery Buyer");
      setValue(container.querySelector<HTMLInputElement>('input[name="email"]')!, "avery@example.test");
      container.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const firstBody = JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body));
    await act(async () => root.unmount());
    container.replaceChildren();
    root = createRoot(container);
    await act(async () => root.render(createElement(StrelvaConnectedBookingForm, props)));
    expect(container.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("Avery Buyer");
    expect(container.querySelector<HTMLInputElement>('input[name="email"]')?.value).toBe("avery@example.test");
    await act(async () => container.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const secondBody = JSON.parse(String((fetcher.mock.calls[3]?.[1] as RequestInit).body));
    expect(secondBody.requestId).toBe(firstBody.requestId);
    expect(container.textContent).toContain("Outlook confirmed this reservation.");
  });

  it("offers refresh without exposing repeat writes for a pending receipt", async () => {
    const pending = { ...receipt, status: "pending" as const };
    const onReconcile = vi.fn().mockResolvedValue({ ...pending, status: "confirmed" as const });
    await renderForm({ receipt: pending, onReserve: vi.fn(), onChange: vi.fn(), onCancel: vi.fn(), onReconcile });
    expect(container.textContent).toContain("Check the calendar before trying again.");
    expect(container.querySelector('form[aria-label="Change reservation"]')).toBeNull();
    expect(container.querySelector('button[type="button"]')?.textContent).toContain("Check booking status");
    await act(async () => (container.querySelector('button[type="button"]') as HTMLButtonElement).click());
    expect(onReconcile).toHaveBeenCalledWith(pending);
    expect(onReconcile).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("The reservation is confirmed.");
  });

  it("fails safely when no secure random source is available", async () => {
    vi.stubGlobal("crypto", {});
    Object.defineProperty(window, "crypto", { configurable: true, value: {} });
    clearBookingRequestDraft(bookingRequestStorageKey("https://secure.example", "secure-example", schedule.capabilityId));
    expect(() => createBookingRequestId()).toThrow(/secure/);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(schedule));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(StrelvaConnectedBookingForm, {
      baseUrl: "https://secure.example",
      tenant: "secure-example",
      capabilityId: schedule.capabilityId,
      range: { from: "2026-10-01T00:00:00Z", to: "2026-10-08T00:00:00Z" },
    })));
    await act(async () => {
      setValue(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Avery Buyer");
      setValue(container.querySelector<HTMLInputElement>('input[name="email"]')!, "avery@example.test");
      container.querySelector<HTMLFormElement>('form[aria-label="Reserve a time"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain("secure");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
