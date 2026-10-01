// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRecord = vi.fn();
const mockVoid = vi.fn();
const mockRefresh = vi.fn();
vi.mock("@/app/admin/work/effort-actions", () => ({
  recordBusinessEffortAction: (...args: unknown[]) => mockRecord(...args),
  voidBusinessEffortAction: (...args: unknown[]) => mockVoid(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { BusinessEffortForSite, BusinessEffortPortfolio } from "@/app/admin/work/BusinessEffort";
import type { BusinessEffortLoad } from "@/app/admin/work/effort-data";
import { readBusinessEffortOverview, type BusinessEffortStore } from "@/platform/business-effort";
import type { BusinessEffortEntry, EffortBusiness } from "@/platform/business-effort/types";

const NOW = new Date("2026-09-28T15:00:00.000Z");
const OPERATOR = "00000000-0000-4000-8000-000000000001";
const MOONEY = "10000000-0000-4000-8000-00000000000a";
const JUNIPER = "10000000-0000-4000-8000-00000000000b";
const businesses: EffortBusiness[] = [
  { id: JUNIPER, name: "Juniper Bakery", tenantIds: [], firstEffortOn: "2026-08-04" },
  { id: MOONEY, name: "The Mooney Firm", tenantIds: ["attymooney"], firstEffortOn: "2026-07-02" },
];
function entry(id: number, businessId: string, occurredOn: string, minutes: number, note: string | null, voided = false): BusinessEffortEntry {
  return {
    id: `20000000-0000-4000-8000-${String(id).padStart(12, "0")}`, businessId, minutes, category: "change", occurredOn, note,
    recordedBy: OPERATOR, recordedAt: `${occurredOn}T12:00:00+00:00`,
    void: voided ? { reason: "Logged twice", voidedBy: OPERATOR, voidedAt: `${occurredOn}T13:00:00+00:00` } : null,
  };
}
const entries = [
  entry(5, MOONEY, "2026-09-03", 15, "Hours update"),
  entry(4, JUNIPER, "2026-08-20", 90, "Menu page rebuild"),
  entry(3, MOONEY, "2026-08-11", 45, "Practice area copy", true),
  entry(2, MOONEY, "2026-08-10", 45, "Practice area copy"),
  entry(1, MOONEY, "2026-07-02", 180, "Launch review"),
];

async function readyLoad(overrides: Partial<{ businesses: EffortBusiness[]; entries: BusinessEffortEntry[] }> = {}): Promise<BusinessEffortLoad> {
  const store: BusinessEffortStore = {
    record: vi.fn(), void: vi.fn(),
    listBusinesses: async () => overrides.businesses ?? businesses,
    listEntries: async () => overrides.entries ?? entries,
  };
  const overview = await readBusinessEffortOverview(store, { userId: OPERATOR, verifiedEmail: "operator@example.test" }, NOW);
  return { state: "ready", overview, today: "2026-09-28" };
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: ReturnType<typeof createElement>) {
  act(() => root.render(node));
}
function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

describe("human minutes on Internal work", () => {
  it("renders the portfolio measure, per-business direction and voided history", async () => {
    render(createElement(BusinessEffortPortfolio, { load: await readyLoad() }));
    const text = container.textContent ?? "";
    expect(text).toContain("Human minutes per business");
    expect(text).toContain("August 2026");
    // August: Mooney 45 (void excluded), Juniper 90 → median 67.5; July median 180.
    expect(text).toContain("67.5");
    expect(text).toContain("July 2026: 180 min");
    expect(text).toContain("Falling");
    expect(text).toContain("The Mooney Firm");
    expect(text).toContain("attymooney");
    expect(text).toContain("Not enough data");
    expect(text).toContain("Voided: Logged twice");
    expect(container.querySelectorAll('button[type="button"]').length).toBeGreaterThan(0);
  });

  it("shows an honest empty state", async () => {
    render(createElement(BusinessEffortPortfolio, { load: await readyLoad({ entries: [], businesses: [] }) }));
    expect(container.textContent).toContain("No human minutes recorded yet");
    expect(container.textContent).toContain("No customer businesses exist yet");
    expect(container.textContent).toContain("No entries recorded yet.");
    expect(container.querySelector("form")).toBeNull();
  });

  it("shows unavailable storage instead of zero", () => {
    render(createElement(BusinessEffortPortfolio, { load: { state: "unavailable" } }));
    expect(container.textContent).toContain("Live counts are paused for human minutes");
    expect(container.textContent).not.toContain("Total minutes");
  });

  it("explains the workspace release gate and a denied session", () => {
    render(createElement(BusinessEffortPortfolio, { load: { state: "disabled" } }));
    expect(container.textContent).toContain("unavailable while the workspace release is off");
    render(createElement(BusinessEffortPortfolio, { load: { state: "denied" } }));
    expect(container.textContent).toContain("could not be verified as an active super admin");
  });

  it("keeps the entry id after a failure so a retry cannot double count, then issues a new one", async () => {
    render(createElement(BusinessEffortPortfolio, { load: await readyLoad() }));
    const form = container.querySelector('form[aria-label="Record human minutes"]') as HTMLFormElement;
    const business = form.querySelector("select") as HTMLSelectElement;
    const minutes = Array.from(form.querySelectorAll("input")).find((input) => input.getAttribute("inputmode") === "numeric") as HTMLInputElement;
    const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    act(() => { setValue(business, MOONEY); setValue(minutes, "0"); });
    expect(form.textContent).toContain("Enter whole minutes from 1 to 1440.");
    expect(submit.disabled).toBe(true);
    act(() => setValue(minutes, "35"));
    expect(submit.disabled).toBe(false);

    mockRecord.mockResolvedValue({ ok: false, message: "Human-minute storage is unavailable. Nothing was saved; try again." });
    await act(async () => { form.requestSubmit(); });
    expect(form.querySelector('[role="alert"]')?.textContent).toContain("Nothing was saved");
    await act(async () => { form.requestSubmit(); });
    expect(mockRecord).toHaveBeenCalledTimes(2);
    const first = mockRecord.mock.calls[0]![0];
    expect(mockRecord.mock.calls[1]![0].entryId).toBe(first.entryId);
    expect(first).toMatchObject({ businessId: MOONEY, minutes: 35, category: "delivery", occurredOn: "2026-09-28" });
    expect(mockRefresh).not.toHaveBeenCalled();

    mockRecord.mockResolvedValueOnce({ ok: true, message: "Recorded 35 minutes." });
    await act(async () => { form.requestSubmit(); });
    expect(form.querySelector('[role="status"]')?.textContent).toBe("Recorded 35 minutes.");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(minutes.value).toBe("");
    act(() => setValue(minutes, "10"));
    await act(async () => { form.requestSubmit(); });
    expect(mockRecord.mock.calls[3]![0].entryId).not.toBe(first.entryId);
  });

  it("voids an entry only with a reason", async () => {
    render(createElement(BusinessEffortPortfolio, { load: await readyLoad() }));
    const voidButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Void") as HTMLButtonElement;
    act(() => voidButton.click());
    const form = container.querySelector('form[aria-label="Void entry"]') as HTMLFormElement;
    const confirm = Array.from(form.querySelectorAll("button")).find((button) => button.textContent?.includes("Void entry")) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    act(() => setValue(form.querySelector("input") as HTMLInputElement, "Wrong business"));
    mockVoid.mockResolvedValueOnce({ ok: false, message: "This entry was already saved differently. Reload before continuing." });
    await act(async () => { form.requestSubmit(); });
    expect(form.textContent).toContain("already saved differently");
    expect(mockVoid).toHaveBeenCalledWith({ entryId: "20000000-0000-4000-8000-000000000005", reason: "Wrong business" });
  });
});

describe("human minutes on a client", () => {
  it("measures the managed site's bound business with a fixed log form", async () => {
    render(createElement(BusinessEffortForSite, { load: await readyLoad(), tenantId: "attymooney" }));
    const text = container.textContent ?? "";
    expect(text).toContain("The Mooney Firm");
    expect(text).toContain("July 2026: 180 min");
    expect(text).toContain("Falling");
    expect(text).toContain("Measured since");
    expect(text).not.toContain("Menu page rebuild");
    expect(container.textContent).not.toContain("Choose a business");
  });

  it("explains an unattached site instead of guessing a business", async () => {
    render(createElement(BusinessEffortForSite, { load: await readyLoad(), tenantId: "gldf" }));
    expect(container.textContent).toContain("not attached to a customer business");
    expect(container.querySelector("form")).toBeNull();
  });

  it("shows unavailable storage on the client page", () => {
    render(createElement(BusinessEffortForSite, { load: { state: "unavailable" }, tenantId: "attymooney" }));
    expect(container.textContent).toContain("Live counts are paused for human minutes");
  });
});
