// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordPublishingFields } from "@/experience/publishing/RecordPublishingFields";
import type { BusinessRecord } from "@/platform/business-record/contracts";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const WS = "7f000000-0000-4000-8000-000000000010";
const FIRST = "7f000000-0000-4000-8000-000000000011";
const SECOND = "7f000000-0000-4000-8000-000000000012";
const record = (): BusinessRecord => ({
  workspaceId: WS, access: "owner", revision: 4, lastSequence: 4, updatedAt: null, people: [], contactCount: 0,
  facts: {
    hours: { value: { timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }], overrides: [{ date: "2026-12-25", closed: true, label: "Christmas" }] }, source: "owner", verified: true, updatedAt: "2026-10-08T00:00:00Z", updatedBy: WS },
    links: { value: [{ kind: "website", url: "https://example.test", label: "Our website" }, { kind: "booking", url: "https://example.test/book", label: "Book now" }], source: "owner", verified: true, updatedAt: "2026-10-08T00:00:00Z", updatedBy: WS },
  },
  // Deliberately unlike UUID and position order: edits must use record identity.
  services: [
    { id: SECOND, name: "Consultation", description: "A private consultation", durationMinutes: 30, priceText: "$50", active: false, position: 9, externalRef: "external-consult", source: "owner", verified: true, updatedAt: "2026-10-08T00:00:00Z" },
    { id: FIRST, name: "Follow-up", description: null, durationMinutes: 15, priceText: "$25", active: true, position: 2, externalRef: "external-follow-up", source: "owner", verified: false, updatedAt: "2026-10-08T00:00:00Z" },
  ],
});
const response = (extra = {}) => Response.json({ result: { record: { revision: 5, changeCount: 1 }, google: [], ...extra } });
let root: Root | undefined;
let container: HTMLDivElement;
async function mount(props: Partial<Parameters<typeof RecordPublishingFields>[0]> = {}) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(RecordPublishingFields, { record: record(), ...props })));
}
function field(label: string) {
  const element = Array.from(container.querySelectorAll("label")).find(item => item.textContent === label)!;
  return container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[id="${element.htmlFor}"]`)!;
}
async function input(label: string, value: string) {
  const element = field(label);
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes(label))!;
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
function body(request: ReturnType<typeof vi.fn>, index = 0) { return JSON.parse(String(request.mock.calls[index]![1].body)); }
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; document.body.innerHTML = ""; vi.clearAllMocks(); });

describe("business record hours and service controls", () => {
  it("edits services by UUID while preserving external identity, ordering and inactive state", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response());
    await mount({ request });
    await input("Service name 1", "Initial consultation");
    await input("Service description 1", "A longer private consultation");
    await input("Service price 1", "$75");
    await input("Service duration in minutes 1", "45");
    await submit();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toBe("/api/workspace/publishing/record");
    expect(body(request)).toMatchObject({ workspaceId: WS, revision: 4, googleApprovalDisclosed: false, patch: { services: [{ op: "upsert", id: SECOND, name: "Initial consultation", description: "A longer private consultation", priceText: "$75", durationMinutes: 45, active: false, position: 9, externalRef: "external-consult", verified: true }] } });
    expect(body(request).patch.facts).toBeUndefined();
    expect(body(request).patch.services).toHaveLength(1);
    expect(container.textContent).toContain("Saved to your business record.");
  });

  it("uses the business-details endpoint without Google and distinguishes draft review from live publication", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response({ native: { ready: ["lakeshore"], needsReview: [{ tenantId: "harbor", reason: "draft_held", reported: false }] }, nativePropagationError: "One draft could not be prepared." }));
    await mount({ request, endpoint: "/api/workspace/business-details/record", googleEnabled: false, approvalCopy: "Google disclosure" });
    await input("Service price 2", "$30");
    await submit();
    expect(request.mock.calls[0]![0]).toBe("/api/workspace/business-details/record");
    expect(body(request).googleApprovalDisclosed).toBe(false);
    expect(body(request).patch.services[0].id).toBe(FIRST);
    expect(container.textContent).toContain("Website details matched or prepared for review: lakeshore");
    expect(container.textContent).toContain("Website review is still needed for harbor");
    expect(container.textContent).toContain("An existing website draft needs review first");
    expect(container.textContent).not.toContain("draft_held");
    expect(container.textContent).toContain("The review request could not be confirmed");
    expect(container.textContent).toContain("Your live website is unchanged");
    expect(container.textContent).toContain("Website draft preparation could not be confirmed");
    expect(container.textContent).not.toContain("Google disclosure");
    expect(container.textContent).not.toContain("Review Google drafts and receipts");
  });

  it("advances the accepted baseline and revision so another save does not repeat accepted edits", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response());
    await mount({ request });
    await input("Website address", "https://new.example.test");
    await input("Service name 1", "New consultation");
    await submit();
    expect(body(request).patch.facts.links.value).toEqual([{ kind: "website", url: "https://new.example.test", label: "Our website" }, { kind: "booking", url: "https://example.test/book", label: "Book now" }]);
    await submit();
    expect(request).toHaveBeenCalledTimes(1);
    await input("Service price 2", "$30");
    await submit();
    expect(request).toHaveBeenCalledTimes(2);
    expect(body(request, 1).revision).toBe(5);
    expect(body(request, 1).patch.facts).toBeUndefined();
    expect(body(request, 1).patch.services).toHaveLength(1);
    expect(body(request, 1).patch.services[0].id).toBe(FIRST);
    expect(body(request, 1).commandId).not.toBe(body(request).commandId);
  });

  it("retains the exact command identity through an uncertain response retry", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("Connection lost; the save may have been accepted.")).mockResolvedValueOnce(response());
    await mount({ request });
    await input("Service name 1", "Retained consultation");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Connection lost");
    expect(field("Service name 1").value).toBe("Retained consultation");
    expect(refresh).not.toHaveBeenCalled();
    await submit();
    expect(body(request, 1)).toEqual(body(request));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not discard edits or allocate a new command after an incomplete acknowledgment", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ result: { record: { revision: 5, changeCount: 1 } } })).mockResolvedValueOnce(response());
    await mount({ request }); await input("Service price 1", "$80"); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed");
    expect(field("Service price 1").value).toBe("$80");
    await submit(); expect(body(request, 1)).toEqual(body(request));
  });

  it("keeps a saved record separate from Google and native preparation failures", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response({
      google: [{ tenantId: "lakeshore", locationId: "Buffalo", kind: "hours", status: "failed", reason: "Google could not accept this change." }],
      propagationError: "Google preparation could not finish.", nativePropagationError: "Website preparation is temporarily unavailable.",
    }));
    await mount({ request }); await input("Closes 1", "18:00"); await submit();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Saved to your business record");
    expect(container.textContent).toContain("Unapplied on Google");
    expect(container.textContent).toContain("Website draft preparation could not be confirmed");
    await submit(); expect(request).toHaveBeenCalledOnce();
  });

  it("adopts a newer ordinary-details save while pristine but preserves unsaved input and its conflict revision", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response({ record: { revision: 8, changeCount: 1 } }));
    await mount({ request });
    await act(async () => root!.render(createElement(RecordPublishingFields, { record: { ...record(), revision: 6 }, request })));
    await input("Service price 1", "$60");
    await act(async () => root!.render(createElement(RecordPublishingFields, { record: { ...record(), revision: 7 }, request })));
    expect(field("Service price 1").value).toBe("$60");
    await submit();
    expect(body(request).revision).toBe(6);
  });

  it("blocks duplicate in-flight submission and disables editing until the response arrives", async () => {
    let finish!: (value: Response) => void;
    const request = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    await mount({ request });
    await input("Service price 1", "$100");
    await act(async () => {
      const form = container.querySelector("form")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(request).toHaveBeenCalledOnce();
    expect(field("Service price 1").disabled).toBe(true);
    expect(button("Save hours").disabled).toBe(true);
    await act(async () => finish(response()));
    expect(field("Service price 1").disabled).toBe(false);
  });

  it.each([409, 422, 503])("keeps the entered service and hours after a %s failure", async status => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ error: status === 409 ? "Someone changed this record. Reload to review the latest." : "This change could not be saved." }, { status }));
    await mount({ request });
    await input("Service description 2", "Keep my description");
    await input("Opens 1", "10:00");
    await submit();
    expect(field("Service description 2").value).toBe("Keep my description");
    expect(field("Opens 1").value).toBe("10:00");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    expect(body(request).revision).toBe(4);
  });

  it("validates service limits, website, timezone and dated exceptions before a request", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response());
    await mount({ request });
    await input("Service name 1", " "); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("a name is required");
    await input("Service name 1", "Consultation");
    await input("Service duration in minutes 1", "1441"); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("1,440 whole minutes");
    await input("Service duration in minutes 1", "30");
    await input("Website address", "javascript:alert(1)"); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("full website address");
    await input("Website address", "https://example.test");
    await input("Time zone", "Invalid/Timezone"); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("valid time zone");
    await input("Time zone", "America/New_York");
    await act(async () => button("Add holiday").click()); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("valid date for each exception");
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves timezone and labeled dated exceptions when saving weekly hours; add and remove controls do not submit", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response());
    await mount({ request });
    expect(button("Add opening").type).toBe("button");
    expect(button("Remove special").type).toBe("button");
    await act(async () => button("Add opening").click());
    expect(request).not.toHaveBeenCalled();
    await input("Hours on date 1", "open");
    await submit();
    expect(body(request).patch.facts.hours.value).toEqual({ timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }, { day: 1, opens: "09:00", closes: "17:00" }], overrides: [{ date: "2026-12-25", closed: false, label: "Christmas", opens: "09:00", closes: "17:00" }] });
    await submit(); expect(request).toHaveBeenCalledOnce();
  });

  it("shows empty state and prevents all writes for read-only or non-owner records", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response());
    await mount({ request, record: { ...record(), access: "member", facts: {}, services: [] } });
    expect(container.textContent).toContain("Hours have not been recorded yet");
    expect(container.textContent).toContain("No services have been recorded yet");
    expect(container.textContent).toContain("Only the owner can change these facts");
    expect(button("Save hours")).toBeUndefined();
    expect(field("Time zone").disabled).toBe(true);
    await submit(); expect(request).not.toHaveBeenCalled();
    await act(async () => root!.render(createElement(RecordPublishingFields, { key: "readonly", record: record(), readOnly: true, request })));
    expect(field("Service name 1").disabled).toBe(true);
    await submit(); expect(request).not.toHaveBeenCalled();
  });
});
