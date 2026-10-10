// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackerImportFixture } from "@/experience/workspace/preview/TrackerImportFixture";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Fixture must not call a server"); }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const mount = (state: string) => act(async () => root.render(createElement(TrackerImportFixture, { state })));
const submit = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "Bring in 48 matters")!;

describe("fictional spreadsheet import", () => {
  it("requires every date correction, then saves mapped records only in memory", async () => {
    await mount("ready");
    expect(submit().disabled).toBe(true);
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type="date"]')];
    expect(inputs).toHaveLength(3);
    for (const input of inputs) await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-10-20");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(submit().disabled).toBe(false);
    await act(async () => submit().click());
    expect(container.textContent).toContain("48 records");
    expect(container.textContent).toContain("The records are kept in this preview only");
    expect(container.textContent).toContain("No email was sent");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not enable import or correction for read-only people", async () => {
    await mount("read-only");
    expect(submit().disabled).toBe(true);
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="date"]')].every(input => input.disabled)).toBe(true);
    expect([...container.querySelectorAll<HTMLSelectElement>("select")].every(input => input.disabled)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects duplicate mapped fields and permits skipping the invalid date column", async () => {
    await mount("ready");
    const dates = container.querySelector<HTMLSelectElement>('select[aria-label="Opened becomes"]')!;
    await act(async () => { dates.value = "Skip"; dates.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(submit().disabled).toBe(false);
    const parties = container.querySelector<HTMLSelectElement>('select[aria-label="Parties becomes"]')!;
    await act(async () => { parties.value = "Matter name"; parties.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(submit().disabled).toBe(true);
    expect(container.textContent).toContain("Choose a different field for each column");
  });
});
