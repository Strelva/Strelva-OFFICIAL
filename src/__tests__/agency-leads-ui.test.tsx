// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyLeads } from "@/experience/workspace/leads/AgencyLeads";
import LeadsPage from "@/app/workspace/leads/page";

const pageMocks = vi.hoisted(() => ({ actor: vi.fn(), agency: vi.fn(), brand: vi.fn(), enabled: vi.fn() }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: pageMocks.actor }));
vi.mock("@/experience/workspace/leads/leads-server", () => ({ leadAgency: pageMocks.agency }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: pageMocks.brand }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: pageMocks.enabled }));
vi.mock("@/experience/places/place-chrome-server", () => ({ readAgencyClients: async () => [{ id: "c1", name: "Juniper Bakery", href: "/workspace?workspaceId=c1", color: "#2f5236" }] }));
vi.mock("@/experience/app-frame/StrelvaShell", () => ({ StrelvaShell: ({ children, agencyNavigation }: { children: React.ReactNode; agencyNavigation?: unknown }) => <main data-agency-navigation={JSON.stringify(agencyNavigation)}>{children}</main> }));

const agency = "11111111-1111-4111-8111-111111111111";
const actor = "44444444-4444-4444-8444-444444444444";
const token = "a".repeat(36);
const row = { lead: { businessName: "Buffalo Coffee", email: "coffee@example.test", phone: "716-555-0100", location: "Buffalo", description: "A clear website for our coffee shop.", currentWebsite: "https://coffee.example.test", statusToken: token, deliveryStatus: "received", submittedAt: "2026-10-12T12:00:00Z", statusUpdatedAt: "2026-10-12T12:00:00Z" }, workflow: { token, status: "new", updatedAt: null, note: "Original conversation" }, legacyOwnership: true };
const snapshot = (extra: Record<string, unknown> = {}) => ({ agency: { id: agency, name: "Strelva Agency", role: "owner" }, currentActorId: actor, leads: [row], conversionAvailable: true, ...extra });
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("FormData", window.FormData);
  pageMocks.actor.mockResolvedValue({ userId: actor }); pageMocks.agency.mockResolvedValue({ id: agency, name: "Strelva Agency", role: "owner" });
  pageMocks.enabled.mockReturnValue(true); pageMocks.brand.mockResolvedValue({ agencyId: agency, name: "Strelva Agency" });
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function render(request: typeof fetch) {
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(<AgencyLeads agencyWorkspaceId={agency} request={request} />));
  return node;
}
const button = (node: HTMLElement, label: string) => [...node.querySelectorAll("button")].find(item => item.textContent === label)!;
const href = (path: string) => `${path}?workspaceId=${agency}&leadToken=${token}`;
function receipt(body: Record<string, unknown>) {
  const status = body.action === "convert" ? "converting" : body.action === "status" ? body.status : "new";
  const deliveryStatus = status === "converting" ? "drafting" : status === "contacted" ? "reviewing" : status === "dismissed" ? "paused" : "received";
  return { ...row, lead: { ...row.lead, deliveryStatus }, workflow: { ...row.workflow, status,
    ...(body.action === "note" ? { note: `${row.workflow.note}\n${body.note}`, notes: [{ id: body.idempotencyKey, text: body.note, createdBy: actor, createdAt: "2026-10-12T13:00:00Z" }] } : {}) },
    idempotencyKey: body.idempotencyKey, ...(body.action === "convert" ? { href: href("/workspace/agency/clients/new") } : {}) };
}
async function submitNote(node: HTMLElement, value = "  Called the owner  ") {
  const input = node.querySelector('textarea[name="note"]') as HTMLTextAreaElement; input.value = value;
  await act(async () => input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

it("renders owned lead work in agency chrome with honest legacy attribution and opaque prefill links", async () => {
  const node = await render(vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot())));
  expect(node.textContent).toContain("Buffalo Coffee"); expect(node.textContent).toContain("coffee@example.test");
  expect(node.textContent).toContain("Before Strelva Agency's requests were kept separately"); expect(node.textContent).toContain("Original conversation");
  // Strelva says what the request needs right above the one ink pill; no dead "coming soon" stub, no manual sync control.
  expect(node.textContent).toContain("Buffalo Coffee asked on Oct 12 and hasn't heard back yet. Add them as a client to start the scope.");
  expect(node.querySelectorAll('[data-xa-primary="true"]')).toHaveLength(1);
  expect(node.querySelector('a[href*="payment-links"]')).toBeNull(); expect(node.textContent).not.toMatch(/Coming soon|Refresh leads|Converting/);
  expect(node.querySelector('a[href*="/admin"]')).toBeNull();
  expect([...node.querySelectorAll("a")].every(link => !link.href.includes("example.test") && !link.href.includes("Buffalo"))).toBe(true);
  const page = renderToStaticMarkup(await LeadsPage({ searchParams: Promise.resolve({ workspaceId: agency }) }));
  expect(page).toContain('&quot;leadsCurrent&quot;:true'); expect(page).toContain('&quot;leadsAvailable&quot;:true'); expect(page).toContain("Juniper Bakery");
});

it.each(["no membership", "ordinary member", "super-admin without membership"])("denied page for %s exposes no lead feed or tool", async () => {
  pageMocks.agency.mockRejectedValueOnce(new Error("Not authorized"));
  const page = renderToStaticMarkup(await LeadsPage({ searchParams: Promise.resolve({ workspaceId: agency }) }));
  expect(page).toContain("Only a verified owner or admin of this agency");
  expect(page).not.toContain("Reading service requests"); expect(page).not.toContain("Try again"); expect(page).not.toContain("Add as client");
  expect(pageMocks.brand).not.toHaveBeenCalled();
});

it("shows initial loading, empty and failed permission reads with GET-only recovery", async () => {
  let resolve!: (response: Response) => void;
  const request = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }))
    .mockResolvedValueOnce(Response.json(snapshot({ leads: [] })));
  const node = await render(request); expect(node.querySelector('[role="status"][aria-label="Reading service requests"]')).toBeTruthy(); expect(node.querySelector("form")).toBeNull();
  await act(async () => resolve(Response.json({ error: "Access denied" }, { status: 403 })));
  expect(node.textContent).toContain("Access denied"); expect(node.querySelector("form")).toBeNull();
  await act(async () => button(node, "Try again").click());
  expect(node.textContent).toContain("No service requests yet"); expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});

it("updates status and dismisses through actor-bound ordinary agency commands", async () => {
  const bodies: Record<string, unknown>[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot());
    const body = JSON.parse(String(init.body)); bodies.push(body); return Response.json(receipt(body));
  });
  const node = await render(request);
  await act(async () => button(node, "Mark contacted").click());
  expect(bodies[0]).toMatchObject({ action: "status", status: "contacted", token, agencyWorkspaceId: agency, expectedActorId: actor });
  await act(async () => button(node, "Dismiss").click()); expect(bodies[1]).toMatchObject({ action: "status", status: "dismissed" });
  expect(bodies[1]?.idempotencyKey).not.toBe(bodies[0]?.idempotencyKey);
});

it("appends trimmed notes and preserves the earlier conversation", async () => {
  const bodies: Record<string, unknown>[] = [];
  let current = row;
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot({ leads: [current] }));
    const body = JSON.parse(String(init.body)); bodies.push(body); const saved = receipt(body); current = saved as typeof row; return Response.json(saved);
  });
  const node = await render(request); await submitNote(node);
  expect(bodies[0]).toMatchObject({ action: "note", note: "Called the owner" });
  expect(node.textContent).toContain("Original conversation\nCalled the owner"); expect(node.textContent).toContain("Note added.");
  expect((node.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
});

it("hands conversion to the ordinary client flow and keeps conversion distinct from creation", async () => {
  let current = row;
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot({ leads: [current] }));
    const body = JSON.parse(String(init.body)); const saved = receipt(body); current = saved as typeof row; return Response.json(saved);
  });
  const node = await render(request); await act(async () => button(node, "Add as client").click());
  expect(node.textContent).toContain("Adding Buffalo Coffee as a client. Finish their details to start the scope.");
  expect(node.textContent).not.toContain("Converting");
  expect([...node.querySelectorAll("a")].map(link => link.getAttribute("href"))).toContain(href("/workspace/agency/clients/new"));
  expect(node.textContent).not.toContain("Converted"); expect(node.querySelector('a[href*="/admin"]')).toBeNull();
});

it("holds conversion when client creation is unavailable and after actual conversion", async () => {
  const node = await render(vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot({ conversionAvailable: false }))));
  expect(button(node, "Add as client").disabled).toBe(true); expect(node.textContent).toContain("Adding clients from here isn't open yet");
  const converted = await render(vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot({ leads: [{ ...row, workflow: { ...row.workflow, status: "converted" }, lead: { ...row.lead, deliveryStatus: "launched" } }] }))));
  // A converted lead is Done: it leaves the open list, and its own page keeps conversion held.
  expect(converted.textContent).toContain("Nothing open"); await act(async () => button(converted, "Done 1").click());
  expect(button(converted, "Add as client").disabled).toBe(true); expect(button(converted, "Dismiss")).toBeUndefined();
});

it("holds exact lost-response terms across GET refresh and refused retry", async () => {
  const bodies: Record<string, unknown>[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot());
    const body = JSON.parse(String(init.body)); bodies.push(body);
    if (bodies.length === 1) throw new Error("Response lost");
    if (bodies.length === 2) return Response.json({ error: "Access denied" }, { status: 403 });
    return Response.json(receipt(body));
  });
  const node = await render(request); await submitNote(node);
  expect(button(node, "Add note").disabled).toBe(true); expect((node.querySelector("textarea") as HTMLTextAreaElement).value).toContain("Called the owner");
  await act(async () => button(node, "Try again").click()); expect(bodies).toHaveLength(1);
  await act(async () => button(node, "Check again").click());
  expect(node.textContent).toContain("waiting to be confirmed"); expect(button(node, "Add note").disabled).toBe(true);
  await act(async () => button(node, "Check again").click());
  expect(bodies[1]).toEqual(bodies[0]); expect(bodies[2]).toEqual(bodies[0]); expect(node.textContent).toContain("Note added.");
});

it.each(["missing key", "wrong token", "wrong status", "wrong href", "incomplete"])("does not confirm a %s conversion receipt", async fault => {
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot());
    const body = JSON.parse(String(init.body)); const saved = receipt(body);
    if (fault === "incomplete") return Response.json({});
    return Response.json({ ...saved, ...(fault === "missing key" ? { idempotencyKey: null } : {}),
      ...(fault === "wrong token" ? { lead: { ...saved.lead, statusToken: "b".repeat(36) } } : {}),
      ...(fault === "wrong status" ? { workflow: { ...saved.workflow, status: "converted" } } : {}),
      ...(fault === "wrong href" ? { href: "/admin/onboard?email=coffee@example.test" } : {}) });
  });
  const node = await render(request); await act(async () => button(node, "Add as client").click());
  expect(node.textContent).toContain("waiting to be confirmed"); expect(button(node, "Add as client").disabled).toBe(true);
  expect(node.querySelector('a[href*="/clients/new"]')).toBeNull(); expect(node.textContent).not.toContain("Ready to add this client");
});

it("disables stale writes and handoffs after a failed reload while retaining the prior request", async () => {
  let gets = 0;
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "POST") return Response.json(receipt(JSON.parse(String(init.body))));
    gets += 1; if (gets > 1) throw new Error("Read unavailable");
    return Response.json(snapshot());
  });
  const node = await render(request); await act(async () => button(node, "Mark contacted").click());
  expect(node.textContent).toContain("Buffalo Coffee"); expect(node.textContent).toContain("may be out of date");
  expect(button(node, "Try again")).toBeTruthy();
  expect(button(node, "Add as client").disabled).toBe(true); expect(button(node, "Add note").disabled).toBe(true);
  expect(node.querySelector('a[href*="payment-links"]')).toBeNull();
});
