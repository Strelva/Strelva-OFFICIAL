// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientMinutes, clientStanding, firstNameFromEmail, minutesHeadline, notesLine, peopleMinutesLine, queueActionLabel, queueHeadline, splitQueue, todaySentence } from "@/experience/workspace/agency/xa/agency-xa-model";
import { lineChanges } from "@/experience/agency-website/AgencyWebsiteDocumentDraftExperience";
import { AgencyQueueXa } from "@/experience/workspace/agency/xa/AgencyQueueXa";
import { AgencyMinutes } from "@/experience/workspace/agency/xa/AgencyMinutes";
import { AgencyClientXa } from "@/experience/workspace/agency/xa/AgencyClientXa";
import { AgencySendPanel } from "@/experience/workspace/agency/xa/AgencySendPanel";
import { XA_CLIENT, XA_MINUTES, xaAgencyClients, xaHarborSystems } from "@/experience/workspace/preview/xa-agency-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

const NOW = Date.parse("2026-10-15T13:00:00.000Z");
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

async function mount(element: ReturnType<typeof createElement>) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element));
  return node;
}

describe("XA-6 words", () => {
  const page = xaAgencyClients("ready", NOW);

  it("splits the Queue into the agency's work (broken first) and what waits on owners", () => {
    const { you, owners } = splitQueue(page.queue);
    expect(you.map(item => item.kind)).toEqual(["health", "request", "improvement"]);
    expect(owners.map(item => item.clientName)).toEqual(["Harbor Dental", "Fieldwork Studio"]);
    expect(queueHeadline(you.length, owners.length)).toEqual({ line: "Three things wait on you.", quiet: "Two more wait on owners." });
    expect(queueHeadline(0, 1)).toEqual({ line: "Nothing waits on you.", quiet: "One waits on owners." });
  });

  it("says where every client stands in one paragraph, naming who waits on whom", () => {
    expect(todaySentence(page.clients, page.queue)).toBe("North Coast Realty and Lakeview Mediation need you. Harbor Dental and Fieldwork Studio wait on their owners.");
    expect(clientStanding(page.clients[0]!, page.queue)).toEqual({ standing: "owner", line: "Waiting on Harbor Dental · New cleaning prices on the Services page" });
    const done = xaAgencyClients("done", NOW);
    expect(todaySentence(done.clients, done.queue)).toBe("Harbor Dental and Fieldwork Studio wait on their owners. North Coast Realty and Lakeview Mediation are quiet.");
    expect(todaySentence([], [])).toContain("No clients yet");
  });

  it("adds up minutes per client from live entries only and names the people", () => {
    const harbor = clientMinutes(XA_CLIENT.harbor, "Harbor Dental", [...XA_MINUTES[XA_CLIENT.harbor]!, { ...XA_MINUTES[XA_CLIENT.harbor]![0]!, id: "c9999999-0000-4000-8000-000000000001", minutes: 500, voided: true }]);
    expect(harbor.minutes).toBe(96);
    expect(harbor.notes).toEqual(["Cleaning prices", "Thanksgiving hours", "Two inquiry follow-ups"]);
    const rows = Object.entries(XA_MINUTES).map(([id, entries]) => clientMinutes(id, id, entries));
    expect(rows.map(row => row.minutes).sort((a, b) => b - a)).toEqual([96, 74, 39, 22]);
    expect(minutesHeadline(rows, new Date(2026, 9, 14))).toEqual({ line: "231 minutes across 4 clients.", quiet: "October 1 to 14, by Maya and Jonah." });
  });

  it("names each Queue action for what clicking does", () => {
    const [health, request] = splitQueue(page.queue).you;
    expect(queueActionLabel(health!)).toBe("Reconnect Google Calendar");
    expect(queueActionLabel(request!)).toBe("Open request");
    expect(queueActionLabel({ ...health!, title: "Website stopped answering", label: undefined })).toBe("Open the System");
  });

  it("says who logged the minutes and joins notes without capitals mid-sentence", () => {
    const harbor = clientMinutes(XA_CLIENT.harbor, "Harbor Dental", XA_MINUTES[XA_CLIENT.harbor]!);
    expect(peopleMinutesLine(harbor)).toBe("Logged by Maya 58 min · Jonah 38 min");
    expect(notesLine(harbor.notes)).toBe("Cleaning prices · Thanksgiving hours · Two inquiry follow-ups");
  });

  it("diffs a long text line by line so now and after line up", () => {
    expect(lineChanges("Mon to Fri 8 to 5. Sat 9 to 1. 1180 Elmwood Ave, Buffalo.", "Wed, Nov 25: 8 to 1. Thu, Nov 26 and Fri, Nov 27: closed. Sat 9 to 1. 1180 Elmwood Ave, Buffalo.")).toEqual([
      { before: "Mon to Fri 8 to 5.", after: "Wed, Nov 25: 8 to 1." },
      { before: "", after: "Thu, Nov 26 and Fri, Nov 27: closed." },
    ]);
    expect(lineChanges("Hours", "Thanksgiving week hours")).toEqual([{ before: "Hours", after: "Thanksgiving week hours" }]);
  });

  it("never greets a role address by name", () => {
    expect(firstNameFromEmail("maya.okafor@northstudio.example")).toBe("Maya");
    expect(firstNameFromEmail("ops@example.com")).toBeNull();
    expect(firstNameFromEmail("j3@x.test")).toBeNull();
  });
});

describe("XA-6 screens", () => {
  it("Queue gives the oldest broken item the one ink pill and owner items only a text link", async () => {
    const open = vi.fn();
    const page = xaAgencyClients("ready", NOW);
    const node = await mount(createElement(AgencyQueueXa, { status: "ready", items: page.queue, complete: true, now: NOW, onOpen: open, onRetry: () => undefined }));
    expect(node.querySelector("h1")?.textContent).toBe("Three things wait on you. Two more wait on owners.");
    const primaries = node.querySelectorAll("[data-xa-primary]");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.textContent).toBe("Reconnect Google Calendar");
    const owners = node.querySelector('[aria-label="Waiting on owners, oldest first"]')!;
    expect(owners.querySelectorAll("button")).toHaveLength(2);
    expect([...owners.querySelectorAll("button")].every(item => item.textContent === "See it")).toBe(true);
    await act(async () => (primaries[0] as HTMLButtonElement).click());
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ kind: "health", clientName: "North Coast Realty" }));
  });

  it("an empty Queue says what Pebble checked, once, and hides an empty fold", async () => {
    const node = await mount(createElement(AgencyQueueXa, { status: "ready", items: [], complete: true, now: NOW, onOpen: () => undefined, onRetry: () => undefined,
      checks: { systems: 9, at: "2026-10-15T13:40:00.000Z" }, more: { count: 0, content: createElement("p", null, "Nothing here") } }));
    expect(node.querySelector("h1")?.textContent).toBe("Nothing waits on you.");
    expect(node.textContent).toMatch(/Pebble checked 9 Systems at \d{1,2}:40 [ap]m\./);
    expect(node.textContent).not.toContain("Nothing waits across your clients");
    expect(node.querySelector("details")?.hidden).toBe(true);
    const full = await mount(createElement(AgencyQueueXa, { status: "ready", items: [], complete: true, now: NOW, onOpen: () => undefined, onRetry: () => undefined, more: { count: 3, content: createElement("p", null, "Three") } }));
    const fold = full.querySelector("details")!;
    expect(fold.hidden).toBe(false);
    expect(fold.querySelector("summary")?.textContent).toBe("3 more requests and drafts");
    expect(fold.querySelector("summary svg")).not.toBeNull();
  });

  it("Queue names an incomplete read instead of claiming nothing waits", async () => {
    const node = await mount(createElement(AgencyQueueXa, { status: "ready", items: [], complete: false, gaps: ["Owner approvals: unavailable"], loaded: { clients: 50, total: 80 }, now: NOW, onOpen: () => undefined, onRetry: () => undefined }));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("It holds 50 of 80 clients. Owner approvals: unavailable.");
  });

  it("Minutes says when time logging is off rather than showing zeros, and names a client it couldn't read", async () => {
    const off = await mount(createElement(AgencyMinutes, { agencyName: "North Studio", state: { status: "off" }, onOpenClient: () => undefined, onRetry: () => undefined }));
    expect(off.textContent).toContain("Minutes aren't on for your agency yet.");
    expect(off.textContent).not.toContain("0 min");
    const rows = [clientMinutes(XA_CLIENT.harbor, "Harbor Dental", XA_MINUTES[XA_CLIENT.harbor]!)];
    const ready = await mount(createElement(AgencyMinutes, { agencyName: "North Studio", state: { status: "ready", rows, failed: ["Lakeview Mediation"], partial: false }, now: new Date(2026, 9, 14), onOpenClient: () => undefined, onRetry: () => undefined }));
    expect(ready.querySelector("h1")?.textContent).toBe("96 minutes across 1 client. October 1 to 14, by Maya and Jonah.");
    expect(ready.querySelector('[role="alert"]')?.textContent).toContain("Time for Lakeview Mediation could not be read");
    expect(ready.textContent).toContain("Logged by Maya 58 min · Jonah 38 min");
    // One Pebble, doing a job, on every width: no felt scene beside a second avatar.
    expect(ready.querySelectorAll('img[src*="pebble"]')).toHaveLength(1);
    expect(ready.querySelectorAll('img[src*="scene"], img[src*="pose"]')).toHaveLength(0);
  });

  it("inside a client, shows the owner's level per area only when it could be read", async () => {
    const shared = { status: "ready" as const, data: { workspaceId: XA_CLIENT.harbor, decisions: [{ id: "f0000000-0000-4000-8000-000000000001", title: "New cleaning prices", systemId: null, since: "2026-10-13T14:42:00.000Z", state: "open" as const }], changes: [], deliveryChecks: [], deliveries: [] } };
    const props = { clientName: "Harbor Dental", workspaceId: XA_CLIENT.harbor, agencyName: "North Studio", agencyHref: "/workspace", ownerName: "Dr. Lin", systems: xaHarborSystems(), shared, systemHref: (id: string) => `/s/${id}`, onRetryShared: () => undefined };
    const read = await mount(createElement(AgencyClientXa, { ...props, grants: { status: "ready", levels: { website: { level: "prepare", proposed: false }, inquiries: { level: "full_control", proposed: false } } } }));
    // One column, no cards: what waits first, then the levels labelled in place, then one sentence for what only the owner can do.
    expect([...read.querySelectorAll("h2")].map(item => item.textContent)).toEqual(["Waiting on Harbor Dental", "Who makes each change live"]);
    const levels = [...read.querySelectorAll("dl > div")].map(item => ({ level: item.getAttribute("data-level"), title: item.querySelector("dt")?.textContent, systems: [...item.querySelectorAll("dd li")].map(li => li.textContent) }));
    expect(levels).toEqual([
      { level: "full_control", title: "Full control", systems: ["Inquiries"] },
      { level: "prepare", title: "Prepare", systems: ["Website"] },
      { level: "kept", title: "Dr. Lin keeps", systems: ["Bookings", "Google listing", "Patient recall tracker"] },
    ]);
    expect(read.textContent).toContain("You build and stage changes. Dr. Lin makes them live.");
    expect(read.textContent).toContain("Only Dr. Lin can pay for Strelva, add or end an agency, or take the business and its data elsewhere.");
    // No legend for labels that aren't on screen, no lock list, no second card.
    expect(read.textContent).not.toContain("Prepare means");
    expect(read.querySelector("aside")).toBeNull();
    expect(read.querySelector('a[href="/s/' + xaHarborSystems()[0]!.id + '"]')?.textContent).toBe("Website");
    const seeIt = [...read.querySelectorAll("a")].find(link => link.textContent === "See it")!;
    expect(seeIt.getAttribute("href")).toContain("f0000000-0000-4000-8000-000000000001");
    const ask = vi.fn();
    const withAsk = await mount(createElement(AgencyClientXa, { ...props, onAsk: ask, grants: { status: "unreadable" } }));
    const askButton = [...withAsk.querySelectorAll("button")].find(item => item.textContent === "Ask about Harbor Dental")!;
    await act(async () => askButton.click());
    expect(ask).toHaveBeenCalledTimes(1);
    const unread = await mount(createElement(AgencyClientXa, { ...props, ownerName: null, grants: { status: "unreadable" } }));
    expect([...unread.querySelectorAll("[data-level]")].map(item => item.getAttribute("data-level"))).toEqual(["shared"]);
    expect(unread.textContent).toContain("isn't shared with agencies on this page yet");
    // Without a shared owner name, the page names the business's owner rather than "the owner".
    expect(unread.textContent).toContain("Only Harbor Dental’s owner can");
  });

  it("the send panel holds the one ink pill and only sends with a change in it", async () => {
    const send = vi.fn();
    const empty = await mount(createElement(AgencySendPanel, { clientName: "Harbor Dental", address: "/hours", changes: [], sending: false, onSend: send, onKeepEditing: () => undefined }));
    // Nothing to send: no grey pill, a sentence that says what unblocks it.
    expect(empty.querySelector("[data-xa-primary]")).toBeNull();
    expect(empty.textContent).toContain("Edit a section on the left.");
    const blocked = await mount(createElement(AgencySendPanel, { clientName: "Harbor Dental", address: "/hours", changes: [{ id: "a", label: "Text", before: "a", after: "b" }], blocked: "One part's fields don't read right. Fix them before sending.", sending: false, onSend: send, onKeepEditing: () => undefined }));
    expect(blocked.querySelector("[data-xa-primary]")).toBeNull();
    expect(blocked.textContent).toContain("Fix them before sending.");
    const filled = await mount(createElement(AgencySendPanel, { clientName: "Harbor Dental", address: "/hours", changes: [{ id: "a", label: "Hours · body", before: "Mon to Fri 8 to 5", after: "Thu and Fri closed" }], sending: false, onSend: send, onKeepEditing: () => undefined }));
    const pill = filled.querySelector("[data-xa-primary]") as HTMLButtonElement;
    expect(pill.textContent).toBe("Send to Harbor Dental");
    expect(filled.textContent).toContain("Nothing changes until Harbor Dental says yes.");
    await act(async () => pill.click());
    expect(send).toHaveBeenCalledTimes(1);
  });
});
