// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingRulesPanel } from "@/experience/bookings/BookingRulesPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";

const WS = "22222222-2222-4222-8222-222222222222";
const policy = { businessServiceId: "33333333-3333-4333-8333-333333333333", mode: "request", bufferMinutes: 25, bookable: true, intake: [{ id: "reason", label: "Reason", type: "textarea", required: true }] };
const context = { paused: false, hours: { timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }] }, services: [{ id: policy.businessServiceId, name: "Consultation", durationMinutes: 30, active: true }], servicePolicies: [policy], settings: { mode: "request", bufferMinutes: 15, minNoticeMinutes: 240, maxAdvanceDays: 60, maxPerDay: null, revision: 7 } };
let root: Root;
let container: HTMLDivElement;
let pending: Array<{ input: string; init?: RequestInit; resolve: (response: Response) => void }>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pending = [];
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  const request = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>(resolve => pending.push({ input: String(input), init, resolve }));
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request as typeof fetch }, createElement(BookingRulesPanel, { workspaceId: WS, tenantId: "fixture" }))));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function click(text: string) { const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text); expect(button).toBeTruthy(); await act(async () => button!.click()); }
async function read(body: unknown = context, status = 200) { await click("How sessions get booked"); expect(pending[0]!.input).toContain(`workspaceId=${WS}&tenantId=fixture`); await act(async () => pending.shift()!.resolve(response(body, status))); }
async function cutoff(value = "24") { const input = [...container.querySelectorAll<HTMLInputElement>("input")].find(item => container.querySelector(`label[for="${item.id}"]`)?.textContent === "Cancellation cutoff (hours before)"); expect(input).toBeTruthy(); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input!.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

describe("owner booking rules", () => {
  it("reads only when opened, with loading and permission states", async () => {
    expect(pending).toHaveLength(0);
    await click("How sessions get booked"); expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    await act(async () => pending.shift()!.resolve(response({ error: "Forbidden" }, 403)));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("owner or an admin");
    expect(container.querySelector("form")).toBeNull();
  });
  it.each([{ body: { error: "Unavailable" }, status: 503 }, { body: { settings: "invalid" }, status: 200 }])("keeps failed and malformed reads out of the editor", async ({ body, status }) => {
    await read(body, status); expect(container.querySelector('[role="alert"]')).toBeTruthy(); expect(container.querySelector("form")).toBeNull(); expect(pending).toHaveLength(0);
  });
  it("shows empty rules and unknown calendar/reminder facts honestly", async () => {
    await read({ ...context, settings: null }); expect(container.textContent).toContain("No booking rules have been prepared"); expect(container.textContent).not.toContain("Change rules");
  });
  it("preserves the exact revision and all service fields; instant stays in Needs you", async () => {
    await read(); expect(container.textContent).toContain("Calendar status unavailable"); expect(container.textContent).toContain("Reminder settings unavailable");
    await click("Change rules"); await submit(); expect(pending).toHaveLength(0); // The unreturned cutoff is never silently defaulted.
    await cutoff(); await click("Book instantly"); await submit();
    expect(pending).toHaveLength(1);
    const command = JSON.parse(String(pending[0]!.init?.body));
    expect(command).toMatchObject({ workspaceId: WS, tenantId: "fixture", expectedRevision: 7, cancellationCutoffHours: 24, services: [{ ...policy, mode: "instant" }] });
    expect(pending[0]!.init?.method).toBe("POST");
    await act(async () => pending.shift()!.resolve(response({ revision: 8, mode: "request", approvalRequired: true })));
    expect(container.textContent).toContain("Instant booking still needs the owner’s approval in Needs you"); expect(container.querySelector("form")).toBeNull();
  });
  it.each([response({ error: "Not confirmed" }, 503), response({ revision: 8 }, 200)])("never retries an unknown write or reuses its stale revision", async outcome => {
    await read(); await click("Change rules"); await cutoff(); await submit();
    const command = String(pending[0]!.init?.body);
    await act(async () => pending.shift()!.resolve(outcome));
    expect(container.textContent).toContain("save could not be confirmed");
    await submit(); expect(pending).toHaveLength(0);
    expect([...container.querySelectorAll("fieldset")].every(field => field.disabled)).toBe(true);
    await click("Read current rules"); expect(pending[0]!.init?.method).toBeUndefined();
    await act(async () => pending.shift()!.resolve(response({ ...context, settings: { ...context.settings, revision: 9 } })));
    await click("Change rules"); await cutoff("48"); await submit();
    expect(JSON.parse(String(pending[0]!.init?.body)).expectedRevision).toBe(9);
    expect(String(pending[0]!.init?.body)).not.toBe(command);
  });
});
