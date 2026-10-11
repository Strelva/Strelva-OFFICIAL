// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleCalendarControls } from "@/experience/scheduling/ScheduleCalendarControls";
import { CalendarConnectionPanel } from "@/experience/scheduling/CalendarConnectionPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { CalendarConnection } from "@/products/scheduling/contracts";
import { outlookCalendarConsentAction } from "@/products/scheduling/contracts";

const connection: CalendarConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  provider: "outlook",
  calendarId: "calendar-1",
  calendarName: "Operations",
  timeZone: "America/New_York",
  status: "connected",
  scopes: ["Calendars.ReadWrite"],
  reminderPolicy: { mode: "provider_default" },
  tokenExpiresAt: null,
  lastCheckedAt: null,
  lastError: null,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const baseReservation = {
  requestId: "request-1",
  title: "Roof inspection",
  start: "2026-09-20T09:00:00Z",
  end: "2026-09-20T10:00:00Z",
  provider: "outlook" as const,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let root: Root;
let container: HTMLDivElement;
let pending: Array<{ url: string; init?: RequestInit; resolve: (value: Response) => void }>;
let transport: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pending = [];
  transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
    pending.push({ url: String(input), init, resolve });
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mount(
  reservations: Array<typeof baseReservation & { status: "reserved" | "unknown" | "accepted"; providerId?: string; verification?: "pending" | "verified" | "failed" }>,
  onChanged = vi.fn(),
  options: { disabled?: boolean; recoveryAllowed?: boolean } = {},
) {
  await act(async () => root.render(createElement(
    WorkspaceRequestContext.Provider,
    { value: transport as typeof fetch },
    createElement(ScheduleCalendarControls, {
      workspaceId: connection.workspaceId,
      workId: "33333333-3333-4333-8333-333333333333",
      revision: 2,
      reservations,
      disabled: options.disabled,
      recoveryAllowed: options.recoveryAllowed,
      onChanged,
    }),
  )));
  expect(pending[0]?.url).toContain("/api/workspace/calendar-connections?");
  await act(async () => pending.shift()!.resolve(response({ connections: [connection] })));
  return onChanged;
}

async function mountConnectionPanel(initialConnections: CalendarConnection[]) {
  await act(async () => root.render(createElement(
    WorkspaceRequestContext.Provider,
    { value: transport as typeof fetch },
    createElement(CalendarConnectionPanel, { workspaceId: connection.workspaceId }),
  )));
  expect(pending[0]?.url).toContain("/api/workspace/calendar-connections?");
  await act(async () => pending.shift()!.resolve(response({ connections: initialConnections })));
}

describe("calendar sync controls", () => {
  it("explains that a failed Google revoke still removed local credentials", async () => {
    const googleConnection: CalendarConnection = { ...connection, provider: "google" };
    await mountConnectionPanel([googleConnection]);
    const disconnect = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Disconnect");
    expect(disconnect).toBeTruthy();
    await act(async () => disconnect!.click());
    expect(pending[0]?.init?.method).toBe("POST");
    await act(async () => pending.shift()!.resolve(response({ disconnected: true, revocationOutcome: "failed", revocationErrorCode: "http_503" })));
    expect(pending[0]?.url).toContain("/api/workspace/calendar-connections?");
    await act(async () => pending.shift()!.resolve(response({ connections: [{ ...googleConnection, status: "revoked" }] })));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("The calendar is disconnected here and its stored credentials were removed.");
    expect(container.textContent).toContain("Disconnected");
  });

  it("announces local Outlook disconnection and the remaining Microsoft consent step", async () => {
    const onChanged = await mount([]);
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Disconnect")!.click());
    await act(async () => pending.shift()!.resolve(response({ disconnected: true, providerConsentAction: outlookCalendarConsentAction })));
    await act(async () => pending.shift()!.resolve(response({ connections: [{ ...connection, status: "revoked" }] })));
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain("Strelva is disconnected.");
    expect(status?.textContent).toContain("Microsoft calendar consent has not been removed.");
    const link = status?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://myapps.microsoft.com");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.textContent).toContain("opens in a new tab");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, { ...outlookCalendarConsentAction, href: "javascript:alert(1)" }])("preserves the original disconnect UI when no valid consent action is returned", async providerConsentAction => {
    await mount([]);
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Disconnect")!.click());
    await act(async () => pending.shift()!.resolve(response({ disconnected: true, ...(providerConsentAction ? { providerConsentAction } : {}) })));
    await act(async () => pending.shift()!.resolve(response({ connections: [{ ...connection, status: "revoked" }] })));
    expect(container.textContent).not.toContain("Microsoft calendar consent");
    expect(container.querySelector('a[href="https://myapps.microsoft.com"]')).toBeNull();
  });

  it("keeps a failed disconnect connected and exposes no success follow-up", async () => {
    const onChanged = await mount([]);
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Disconnect")!.click());
    await act(async () => pending.shift()!.resolve(response({ error: "Provider consent could not be revoked." }, 503)));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Provider consent could not be revoked.");
    expect(container.textContent).toContain("Operations");
    expect(container.querySelector('a[href="https://myapps.microsoft.com"]')).toBeNull();
    expect(pending).toHaveLength(0); expect(onChanged).not.toHaveBeenCalled();
  });
  it("shows a provider conflict without offering a blind duplicate retry", async () => {
    await mount([{ ...baseReservation, status: "reserved" }]);
    const sync = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Sync reservation");
    expect(sync).toBeTruthy();
    await act(async () => sync!.click());
    expect(JSON.parse(String(pending[0]?.init?.body))).toMatchObject({ action: "create", workId: "33333333-3333-4333-8333-333333333333", requestId: "request-1", provider: "outlook" });
    await act(async () => pending.shift()!.resolve(response({ error: "The selected provider calendar is busy during this time." }, 409)));
    expect(container.textContent).toContain("The selected provider calendar is busy during this time.");
    expect(container.textContent).toContain("The selected provider calendar is busy during this time.");
    expect(container.textContent).not.toContain("provider write");
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some(button => button.textContent === "Retry sync")).toBe(false);
  });

  it("keeps an uncertain reservation visible and sends an explicit recovery command", async () => {
    const onChanged = await mount([{ ...baseReservation, status: "unknown", providerId: "event-1" }]);
    const recover = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Check the calendar");
    expect(recover).toBeTruthy();
    await act(async () => recover!.click());
    expect(JSON.parse(String(pending[0]?.init?.body))).toMatchObject({ action: "recover", workId: "33333333-3333-4333-8333-333333333333", requestId: "request-1", provider: "outlook" });
    await act(async () => pending.shift()!.resolve(response({ payload: { reservations: [{ ...baseReservation, status: "accepted", providerId: "event-1", verification: "verified" }] } })));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Check the calendar");
  });

  it("keeps recovery available for a stopped owner while blocking new calendar changes", async () => {
    const onChanged = await mount([{ ...baseReservation, status: "accepted", providerId: "event-1", verification: "verified" }], vi.fn(), { disabled: true, recoveryAllowed: true });
    const cancel = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Cancel synced reservation");
    const change = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Change synced time");
    const availability = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Check Outlook availability");
    expect(cancel).toBeTruthy();
    expect(cancel?.disabled).toBe(false);
    expect(change?.disabled).toBe(true);
    expect(availability?.disabled).toBe(false);
    await act(async () => cancel!.click());
    expect(JSON.parse(String(pending[0]?.init?.body))).toMatchObject({ action: "cancel", workId: "33333333-3333-4333-8333-333333333333", requestId: "request-1", provider: "outlook" });
    await act(async () => pending.shift()!.resolve(response({ payload: { reservations: [{ ...baseReservation, status: "cancelled", providerId: "event-1", verification: "verified" }] } })));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("keeps an unknown outcome recoverable for a stopped owner", async () => {
    await mount([{ ...baseReservation, status: "unknown", providerId: "event-1" }], vi.fn(), { disabled: true, recoveryAllowed: true });
    const recover = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Check the calendar");
    expect(recover?.disabled).toBe(false);
  });
});
