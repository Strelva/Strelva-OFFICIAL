// @vitest-environment jsdom
/**
 * Owner lane, October 16 critic pass: R2 hours Undo and the one yes, Google
 * drafts withdrawn on Undo, the photo soft delete with Undo, bringing an
 * agency back after removing it, and a blocked Home Finder yes that says the
 * real reason with the action that gets it confirmed.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordPublishingFields, dayFields, usualDay } from "@/experience/publishing/RecordPublishingFields";
import { PeopleAndAccess } from "@/experience/record/PeopleAndAccess";
import { PhotoLibrary } from "@/components/dashboard/PhotoLibrary";
import { confirmationNote, readinessWho } from "@/experience/enterprise/HomeFinder";
import { photoCaption } from "@/lib/media";
import type { BusinessRecord } from "@/platform/business-record/contracts";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img", { src: String(props.src), alt: String(props.alt) }) }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const weekly = [1, 2, 3, 4, 5].map(day => ({ day, opens: "08:00", closes: "17:00" })).concat([{ day: 6, opens: "09:00", closes: "13:00" }]);
const record = (overrides: { date: string; closed: boolean; opens?: string; closes?: string }[] = []): BusinessRecord => ({
  workspaceId, access: "owner", revision: 14, lastSequence: 14, updatedAt: null, services: [], people: [], contactCount: 0,
  facts: { display_name: { value: "Harbor Dental", source: "owner", verified: true, updatedAt: null, updatedBy: null }, hours: { value: { timezone: "America/New_York", weekly, overrides }, source: "owner", verified: true, updatedAt: null, updatedBy: null } },
} as unknown as BusinessRecord);
const NOW = new Date("2026-11-23T08:14:00");

let root: Root;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(() => { act(() => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

const buttons = () => [...document.querySelectorAll("button")];
const button = (text: string) => buttons().find(item => item.textContent?.trim() === text);
const radio = (text: string) => [...node.querySelectorAll<HTMLLabelElement>("label")].find(item => item.textContent?.includes(text))?.querySelector<HTMLInputElement>("input[type='radio']") ?? undefined;
async function expireUndo() {
  const bar = document.querySelector<HTMLElement>("[class*='undoBar']");
  expect(bar).not.toBeNull();
  await act(async () => { for (const name of ["animationend", "webkitAnimationEnd"]) bar!.dispatchEvent(new Event(name, { bubbles: true })); });
}

describe("R2 · one day's hours", () => {
  it("reads a day without its own hours from the usual week", () => {
    const hours = record().facts.hours!.value as Parameters<typeof usualDay>[0];
    expect(usualDay(hours, "2026-11-26")).toEqual({ date: "2026-11-26", closed: false, opens: "08:00", closes: "17:00" });
    expect(usualDay(hours, "2026-11-29")).toEqual({ date: "2026-11-29", closed: true });
    expect(dayFields(hours, "2026-11-26")).toMatchObject({ open: "open", opens: "08:00", closes: "17:00" });
    expect(dayFields(hours, "2026-11-26", "closed")).toMatchObject({ open: "closed" });
  });

  it("saves through the one yes, undoes a day that had no override back to the usual week, and withdraws its Google draft", async () => {
    const posts: Record<string, unknown>[] = [];
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown> & { revision: number; withdrawGoogleEventIds?: string[] };
      posts.push(body);
      return Response.json({ result: { record: { revision: body.revision + 1, changeCount: 1 }, google: body.withdrawGoogleEventIds
        ? body.withdrawGoogleEventIds.map(eventId => ({ tenantId: "t", locationId: "l", kind: "hours", status: "withdrawn", eventId }))
        : [{ tenantId: "t", locationId: "l", kind: "hours", status: "needs_approval", eventId: "closed-draft" }] } });
    }) as unknown as typeof fetch;
    await act(async () => root.render(createElement(RecordPublishingFields, { record: record(), approvalCopy: "Saving also approves it on Google.", request, initialDate: "2026-11-26", now: NOW, backHref: "/workspace/business-details" })));
    // Thanksgiving has no override: a holiday starts at Closed all day, the change people come here to make.
    expect(radio("Closed all day")?.checked).toBe(true);
    const yes = node.querySelector<HTMLButtonElement>("button[data-xa-primary]");
    expect(yes?.textContent).toContain("Make it live");
    await act(async () => yes!.click());
    expect(posts).toHaveLength(1);
    // After the save: the Undo pill is up, and the way back to the record is a text link, never the ink pill.
    expect(button("Undo")).toBeTruthy();
    expect(node.querySelector("button[data-xa-primary]")).toBeNull();
    expect([...node.querySelectorAll("a")].find(link => link.textContent === "Back to your record")?.getAttribute("href")).toBe("/workspace/business-details");
    await act(async () => button("Undo")!.click());
    expect(posts[1]).toMatchObject({ withdrawGoogleEventIds: ["closed-draft"], patch: { facts: { hours: { value: { weekly, overrides: [] } } } } });
    // The form agrees with the sentence: the day is back to its usual hours, not "Closed all day".
    expect(radio("Open different hours")?.checked).toBe(true);
    expect(radio("Closed all day")?.checked).toBe(false);
    expect(node.textContent).toContain("is back to open 8 to 5, as in your usual week.");
    expect(node.textContent).toContain("Google never got the change, so Strelva withdrew it there too.");
    expect(node.textContent).not.toContain("Waits for your yes on Google");
  });

  it("says why when nothing differs yet, with the one link that changes it", async () => {
    await act(async () => root.render(createElement(RecordPublishingFields, { record: record(), request: vi.fn() as unknown as typeof fetch, initialDate: "2026-11-29", now: NOW, listingConnected: false })));
    // Sunday is closed in the usual week, so Closed all day changes nothing: no pill, the reason, and what changes it.
    expect(node.querySelector("button[data-xa-primary]")).toBeNull();
    expect(node.textContent).toContain("Sunday, November 29 already reads closed all day. Choose what's different first.");
    await act(async () => button("Open different hours")!.click());
    expect(node.querySelector<HTMLButtonElement>("button[data-xa-primary]")?.textContent).toContain("Save this day");
  });

  it("arms the yes again when the form changes after a save", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { revision: number };
      return Response.json({ result: { record: { revision: body.revision + 1, changeCount: 1 }, google: [] } });
    }) as unknown as typeof fetch;
    await act(async () => root.render(createElement(RecordPublishingFields, { record: record(), request, initialDate: "2026-11-26", now: NOW, listingConnected: false })));
    await act(async () => node.querySelector<HTMLButtonElement>("button[data-xa-primary]")!.click());
    expect(node.querySelector("button[data-xa-primary]")).toBeNull();
    await act(async () => radio("Open different hours")!.click());
    expect(node.querySelector<HTMLButtonElement>("button[data-xa-primary]")?.textContent).toContain("Save this day");
  });
});

describe("Photos · delete with Undo", () => {
  const assets = [
    { id: "m1", url: "/xa/photo-dentist.webp", filename: "dr-lin-at-work.webp", width: 1200, height: 1680, size: 182_000, createdAt: "2026-11-20T15:00:00.000Z" },
    { id: "m2", url: "/images/front.webp", filename: "Our front windows on Elmwood.webp", width: 1600, height: 1100, size: 240_000, createdAt: "2026-11-01T15:00:00.000Z" },
  ];
  it("titles slugged captions and keeps typed ones", () => {
    expect(photoCaption("dr-lin-at-work.webp")).toBe("Dr Lin at Work");
    expect(photoCaption("Dr. Lin at work.jpg")).toBe("Dr. Lin at work");
    expect(photoCaption("IMG_2034.jpg")).toBe("Photo");
  });

  it("takes the photo out at once, brings it back on Undo, and deletes on the server only when the window ends", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { calls.push(`${init?.method ?? "GET"} ${String(input)}`); return Response.json(init?.method === "DELETE" ? { ok: true } : { assets }); }));
    await act(async () => root.render(createElement(PhotoLibrary, { initialSelectedId: "m1", initialConfirming: true })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => button("Delete the photo")!.click());
    expect(node.querySelector("[aria-label='Open Dr Lin at Work']")).toBeNull();
    expect(calls.filter(call => call.startsWith("DELETE"))).toHaveLength(0);
    await act(async () => button("Undo")!.click());
    expect(node.querySelector("[aria-label='Open Dr Lin at Work']")).not.toBeNull();
    expect(calls.filter(call => call.startsWith("DELETE"))).toHaveLength(0);
    await act(async () => node.querySelector<HTMLButtonElement>("[aria-label='Open Dr Lin at Work']")!.click());
    await act(async () => buttons().find(item => item.textContent === "Delete photo")!.click());
    await act(async () => button("Delete the photo")!.click());
    await expireUndo();
    expect(calls.filter(call => call.startsWith("DELETE"))).toEqual(["DELETE /api/media?id=m1"]);
  });
});

describe("R5 · remove the agency, then bring them back", () => {
  const providerId = "22222222-2222-4222-8222-222222222222";
  const snapshot = { actor: { email: "dr.lin@harbordental.com", localPreview: false }, workspaceId, workspaces: [{ id: workspaceId, kind: "customer", name: "Harbor Dental", role: "owner" }], work: [], handoffs: [], products: [], delegations: [] } as unknown as WorkspaceSnapshot;
  const review = { workspaceId, actorUserId: providerId, organization: false, inaccessibleUnits: 0, units: [{ workspaceId, name: "Harbor Dental", role: "owner", entries: [
    { id: providerId, kind: "provider", label: "North Studio", status: "active", lastUsedAt: null, canRevoke: true },
  ] }] };
  it("offers Bring North Studio back as the Undo, asking them back with the same access", async () => {
    const posts: { url: string; body: unknown }[] = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") { posts.push({ url, body: JSON.parse(String(init.body)) }); return Response.json(url.startsWith("/api/workspace/access-review") ? { ok: true, changed: true } : { agencies: [] }); }
      if (url.startsWith("/api/workspace/access-review")) return Response.json(review);
      if (url.startsWith("/api/workspace/agencies")) return Response.json({ directory: [], agencies: [{ agencyWorkspaceId: "b1000000-1111-4111-8111-111111111111", name: "North Studio", seat: true, ofRecord: true, scopes: [{ scope: "website", level: "prepare", status: "active" }, { scope: "google", level: "prepare", status: "active" }] }] });
      return Response.json({ invitations: [] });
    }) as unknown as typeof fetch;
    await act(async () => root.render(createElement(PeopleAndAccess, { snapshot, currentRole: "owner", request, postAction: vi.fn(), initialAgency: providerId, initialRemoving: true })));
    await act(async () => node.querySelector<HTMLButtonElement>("button[data-xa-primary]")!.click());
    expect(posts.map(post => post.url)).toEqual(["/api/workspace/access-review"]);
    await act(async () => button("Bring North Studio back")!.click());
    expect(posts[1]).toEqual({ url: "/api/workspace/agencies", body: { workspaceId, agencyWorkspaceId: "b1000000-1111-4111-8111-111111111111", scopes: [{ scope: "website", level: "prepare" }, { scope: "google", level: "prepare" }] } });
    expect(node.textContent).toContain("North Studio is asked back with the same access. Nothing changes until they accept.");
  });
});

describe("Home Finder · blocked yes", () => {
  const item = { requirement: "verified brokerage inquiry destination", state: "unverified" as const, source: "Lakeshore Homes", responsibleParty: "Brokerage" };
  it("names who has to confirm and drafts the note the agency sends itself", () => {
    expect(readinessWho(item, "Lakeshore Homes")).toBe("Lakeshore Homes");
    const note = confirmationNote(item, { brokerageName: "Lakeshore Homes", sourceName: "NYS MLS", approvedOrigin: "https://lakeshorehomes.example" });
    expect(note).toContain("Lakeshore Homes needs to confirm where inquiries go.");
    expect(note).toContain("lakeshorehomes.example");
  });
});
