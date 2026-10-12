// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyImportClients } from "@/experience/workspace/agency/AgencyImportClients";
import type { ClientImportPreviewRow, ClientImportRow } from "@/products/agency-clients/import-contract";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const AGENCY = "c5000000-0000-4000-8000-000000000020";
let container: HTMLDivElement;
let root: Root;
let requests: Array<{ action: string; rows: ClientImportRow[] }>;

const limits = { daily: 25, waitingForOwner: 100, raised: false, usedToday: 24, waiting: 3 };

function respond(body: { action: string; rows: ClientImportRow[] }): unknown {
  if (body.action === "preview") {
    const rows: ClientImportPreviewRow[] = body.rows.map((row) => row.name === "Already Here"
      ? { row, state: "duplicate", reason: "Already your client: Already Here." }
      : { row, state: "ready" });
    return { rows, limits, canAddToday: 1 };
  }
  return { rows: body.rows.map((row) => ({ row, state: "added", businessId: "c5000000-0000-4000-8000-000000000010", ownerClaimPath: `/workspace/claim/${"k".repeat(43)}` })) };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    return new Response(JSON.stringify(respond(body)), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const button = (label: string) => [...container.querySelectorAll("button")].find((node) => node.textContent?.includes(label)) as HTMLButtonElement | undefined;
async function click(label: string) {
  const node = button(label);
  if (!node) throw new Error(`No button ${label}: ${container.textContent}`);
  await act(async () => node.click());
}
async function type(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => { setter.call(textarea, value); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("Import clients page", () => {
  it("reads pasted rows, previews every row without adding, adds only the checked rows within the limit, then lists the owner links", async () => {
    await act(async () => root.render(<AgencyImportClients agencyWorkspaceId={AGENCY} />));
    expect(container.textContent).toContain("Import clients");
    await type(container.querySelector("textarea")!, "Business\tWebsite\tOwner email\nNorthside Bakery\tnorthside.example\tpat@northside.example\nCorner Plumbing\t\t\nAlready Here\there.example\t\nBad Email\tbad.example\tnope\n");
    await click("Read the list");
    expect(container.textContent).toContain("Check the columns");
    expect((container.querySelectorAll("select")[0] as HTMLSelectElement).value).toBe("0");
    expect((container.querySelectorAll("select")[1] as HTMLSelectElement).value).toBe("1");
    await click("Check rows");

    expect(requests).toHaveLength(1);
    expect(requests[0]!.action).toBe("preview");
    expect(container.textContent).toContain("Nothing has been added yet");
    expect(container.textContent).toContain("You can add 1 more client now.");
    expect(container.textContent).toContain("Already your client: Already Here.");
    expect(container.textContent).toContain("isn’t an email address");
    // Only as many ready rows as the limit allows start checked.
    const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
    expect(button("Add 1 client")).toBeTruthy();

    await click("Add 1 client");
    expect(requests[1]).toMatchObject({ action: "apply", rows: [{ name: "Northside Bakery" }] });
    expect(container.textContent).toContain("Import finished");
    expect(container.textContent).toContain("Owner claim links");
    expect(container.textContent).toContain("Strelva doesn’t email owners yet");
    expect(button("Copy all")).toBeTruthy();
    expect(button("Download CSV")).toBeTruthy();
  });

  it("keeps a failed batch's rows reported and retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      if (body.action === "apply") return new Response(JSON.stringify({ error: "Importing clients is temporarily unavailable." }), { status: 503 });
      return new Response(JSON.stringify({ rows: body.rows.map((row: ClientImportRow) => ({ row, state: "ready" })), limits: { ...limits, usedToday: 0 }, canAddToday: body.rows.length }), { status: 200 });
    }));
    await act(async () => root.render(<AgencyImportClients agencyWorkspaceId={AGENCY} />));
    await type(container.querySelector("textarea")!, "northside.example\nacme.example\n");
    await click("Read the list");
    await click("Check rows");
    await click("Add 2 clients");
    expect(container.textContent).toContain("Importing clients is temporarily unavailable. Import the list again to finish; nothing is added twice.");
    expect(container.textContent).toContain("2 not added");
  });

  it("offers HighLevel only when its release is on, and lets the agency pick the owner among a sub-account's people", async () => {
    await act(async () => root.render(<AgencyImportClients agencyWorkspaceId={AGENCY} />));
    expect([...container.querySelectorAll('[role="radio"]')].map((node) => node.textContent)).toEqual(["Paste rows", "Upload a file"]);
    await act(async () => root.unmount());
    root = createRoot(container);

    const ghlRows: ClientImportRow[] = [
      { sourceRef: "loc-1", name: "Lake Effect Roofing", ownerEmailCandidates: [
        { email: "front@lakeeffect.example", basis: "business_email" },
        { email: "jo@lakeeffect.example", name: "Jo Park", basis: "account_admin" },
        { email: "al@lakeeffect.example", name: "Al Park", basis: "account_admin" }] },
      { sourceRef: "loc-2", name: "Hertel Dental", ownerEmail: "dr@hertel.example", ownerEmailCandidates: [{ email: "dr@hertel.example", basis: "account_admin" }] },
      { sourceRef: "loc-3", name: "Elmwood PT", ownerEmailCandidates: [{ email: "desk@elmwood.example", basis: "account_user" }] },
    ];
    let connected = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/workspace/agency-clients/gohighlevel")) {
        if (url.includes("rows=1")) return Response.json({ connection: { status: "connected" }, source: "gohighlevel", rows: ghlRows });
        return Response.json({ connection: connected ? { status: "connected", companyId: "co-1" } : null });
      }
      const body = JSON.parse(String(init!.body));
      requests.push(body);
      if (body.action === "preview") return Response.json({ rows: body.rows.map((row: ClientImportRow) => ({ row, state: "ready" })), limits: { ...limits, usedToday: 0 }, canAddToday: body.rows.length });
      return Response.json({ rows: body.rows.map((row: ClientImportRow) => ({ row, state: "added", businessId: "c5000000-0000-4000-8000-000000000010", ...(row.ownerEmail ? { ownerClaimPath: `/workspace/claim/${"k".repeat(43)}` } : {}) })) });
    }));
    await act(async () => root.render(<AgencyImportClients agencyWorkspaceId={AGENCY} highLevel />));
    await click("HighLevel");
    const connect = [...container.querySelectorAll("a")].find((link) => link.textContent === "Connect HighLevel");
    expect(connect?.getAttribute("href")).toBe(`/api/workspace/agency-clients/gohighlevel/oauth?workspaceId=${AGENCY}`);

    await act(async () => root.unmount());
    root = createRoot(container);
    connected = true;
    await act(async () => root.render(<AgencyImportClients agencyWorkspaceId={AGENCY} highLevel />));
    await click("HighLevel");
    await click("Read sub-accounts");
    expect(requests.at(-1)).toMatchObject({ action: "preview", source: "gohighlevel" });

    const selects = [...container.querySelectorAll<HTMLSelectElement>("select")];
    expect(selects).toHaveLength(3);
    // Several admins: nothing preselected, admins listed before the business address.
    expect(selects[0]!.value).toBe("");
    expect([...selects[0]!.options].map((option) => option.textContent)).toEqual([
      "No owner link yet", "Jo Park · jo@lakeeffect.example (Sub-account admin)", "Al Park · al@lakeeffect.example (Sub-account admin)",
      "front@lakeeffect.example (Business email)", "Someone else"]);
    // One admin: preselected, still changeable.
    expect(selects[1]!.value).toBe("dr@hertel.example");
    const choose = async (select: HTMLSelectElement, value: string) => act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await choose(selects[0]!, "al@lakeeffect.example");
    await choose(selects[2]!, "__other");
    await click("Add 3 clients");
    expect(container.textContent).toContain("enter the owner’s email");
    expect(requests.filter((request) => request.action === "apply")).toHaveLength(0);
    const other = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(other, "Owner@Elmwood.example"); other.dispatchEvent(new Event("input", { bubbles: true })); });
    await click("Add 3 clients");
    const apply = requests.find((request) => request.action === "apply")!;
    expect(apply).toMatchObject({ source: "gohighlevel" });
    expect(apply.rows).toEqual([
      { sourceRef: "loc-1", name: "Lake Effect Roofing", ownerEmail: "al@lakeeffect.example" },
      { sourceRef: "loc-2", name: "Hertel Dental", ownerEmail: "dr@hertel.example" },
      { sourceRef: "loc-3", name: "Elmwood PT", ownerEmail: "owner@elmwood.example" },
    ]);
    expect(container.textContent).toContain("3 links");
  });
});
