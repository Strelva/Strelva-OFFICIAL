// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebsiteExperience, type WebsiteExperienceTransport } from "@/experience/websites/WebsiteExperience";
import { serverWebsiteTransport } from "@/experience/websites/contracts";
import type { Website, WebsiteArtifact, WebsiteBrief, WebsiteRecord } from "@/products/websites/contracts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const brief: WebsiteBrief = {
  businessName: "Harbor Dental",
  description: "A family dental practice with clear appointment information.",
  audience: "Families in the neighborhood.",
  primaryGoal: "Help visitors request an appointment.",
  primaryCallToAction: "Request an appointment",
  contactEmail: "hello@harbordental.example",
  notes: "Keep the tone calm and welcoming.",
};

function artifact(revision: number, suffix = "a"): WebsiteArtifact {
  const contentHash = suffix.repeat(64);
  return {
    kind: "website_candidate",
    revision,
    spec: {
      version: 1,
      siteName: brief.businessName,
      content: { hero: { headline: "Care that fits your family" } },
      pages: { home: { sections: [{ type: "hero", visible: true, order: 0, props: { headline: "Care that fits your family" } }] } },
      theme: { fontDisplay: "Instrument_Serif", fontBody: "Inter" },
    },
    contentHash,
    rendererDigest: "b".repeat(64),
    artifactDigest: "c".repeat(64),
    preview: { href: `/preview/websites/${revision}`, revision, contentHash },
    generatedAt: "2026-09-20T15:00:00.000Z",
  };
}

function website(overrides: Partial<Website> = {}): Website {
  return {
    version: 1,
    revision: 4,
    title: brief.businessName,
    brief,
    status: "preview_ready",
    candidate: artifact(4),
    approvedCandidateRevision: null,
    launch: { status: "not_requested", candidateRevision: null, receipt: null, failure: null },
    lastError: null,
    createdBy: "owner-1",
    createdAt: "2026-09-20T14:00:00.000Z",
    history: [{ revision: 4, kind: "candidate_generated", actorId: "owner-1", at: "2026-09-20T15:00:00.000Z", candidateRevision: 4, note: null }],
    ...overrides,
  };
}

function record(overrides: Partial<Website> = {}): WebsiteRecord {
  return {
    workId,
    workspaceId,
    website: website(overrides),
    createdAt: "2026-09-20T14:00:00.000Z",
    updatedAt: "2026-09-20T15:00:00.000Z",
  };
}

function transport(overrides: Partial<WebsiteExperienceTransport> = {}): WebsiteExperienceTransport {
  return {
    read: vi.fn(async () => record()),
    create: vi.fn(async ({ brief: nextBrief }) => record({ brief: nextBrief, title: nextBrief.businessName, revision: 1, candidate: artifact(1), history: [] })),
    revise: vi.fn(async ({ expectedRevision, brief: nextBrief }) => record({ brief: nextBrief, title: nextBrief.businessName, revision: expectedRevision + 1, candidate: artifact(expectedRevision + 1), history: [] })),
    approve: vi.fn(async ({ expectedRevision }) => record({ revision: expectedRevision + 1, status: "approved", approvedCandidateRevision: 4 })),
    publish: vi.fn(async ({ expectedRevision }) => record({ revision: expectedRevision + 1, status: "published", approvedCandidateRevision: 4, launch: { status: "published", candidateRevision: 4, receipt: { status: "published", receiptId: "receipt-4", provider: "strelva_hosted", providerUrl: "https://harbor-dental.strelva.site", evidence: "Preview version 4 is live.", artifactHash: "a".repeat(64), candidateRevision: 4, publishedAt: "2026-09-20T15:01:00.000Z" }, failure: null }, publication: { status: "live", url: "https://harbor-dental.strelva.site", candidateRevision: 4, publishedAt: "2026-09-20T15:01:00.000Z", changedAt: "2026-09-20T15:01:00.000Z" } })),
    takeOffline: vi.fn(async ({ expectedRevision }) => record({ revision: expectedRevision + 1, status: "approved", approvedCandidateRevision: 4, publication: { ...{ status: "live", url: "https://harbor-dental.strelva.site", candidateRevision: 4, publishedAt: "2026-09-20T15:01:00.000Z", changedAt: "2026-09-20T15:01:00.000Z" }, status: "offline" } })),
    ...overrides,
  };
}

async function render(api: WebsiteExperienceTransport, props: Partial<Parameters<typeof WebsiteExperience>[0]> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(WebsiteExperience, { workspaceId, transport: api, ...props })));
  return { container, root };
}

function changeField(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

afterEach(() => { document.body.innerHTML = ""; });

describe("WebsiteExperience", () => {
  it("shows the live address and offers taking the site offline", async () => {
    const live = record({ status: "published", approvedCandidateRevision: 4, launch: { status: "published", candidateRevision: 4, failure: null, receipt: { status: "published", receiptId: "receipt-4", provider: "strelva_hosted", providerUrl: "https://harbor-dental.strelva.site", evidence: "Preview version 4 is live.", artifactHash: "a".repeat(64), candidateRevision: 4, publishedAt: "2026-09-20T15:01:00.000Z" } }, publication: { status: "live", url: "https://harbor-dental.strelva.site", candidateRevision: 4, publishedAt: "2026-09-20T15:01:00.000Z", changedAt: "2026-09-20T15:01:00.000Z" } });
    const api = transport({ read: vi.fn(async () => live) });
    const { container, root } = await render(api, { workId });
    expect(container.textContent).toContain("Visitors see preview version 4. New previews stay private until you publish them.");
    const link = [...container.querySelectorAll<HTMLAnchorElement>("a")].find((item) => item.textContent?.includes("harbor-dental.strelva.site"));
    expect(link?.getAttribute("href")).toBe("https://harbor-dental.strelva.site");
    const offline = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Take website offline"));
    await act(async () => offline?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(api.takeOffline).toHaveBeenCalledWith({ workspaceId, workId, expectedRevision: 4 });
    expect(container.textContent).toContain("Offline");
    expect(container.textContent).toContain("Publish website");
    act(() => root.unmount()); container.remove();
  });

  it("explains an unfinished or failed publish and offers the exact recovery", async () => {
    const pending = record({ status: "launch_pending", approvedCandidateRevision: 4, launch: { status: "pending", candidateRevision: 4, receipt: null, failure: null } });
    const first = await render(transport({ read: vi.fn(async () => pending) }), { workId });
    expect(first.container.textContent).toContain("Publishing did not finish");
    expect(first.container.textContent).toContain("Finish publishing");
    act(() => first.root.unmount()); first.container.remove();

    const failed = record({ status: "failed", approvedCandidateRevision: 4, lastError: { stage: "launch", message: "Website publishing is not configured in this environment. Your approved preview is saved and can be downloaded.", at: "2026-09-20T15:02:00.000Z" }, launch: { status: "failed", candidateRevision: 4, receipt: null, failure: "not configured" } });
    const second = await render(transport({ read: vi.fn(async () => failed) }), { workId });
    expect(second.container.textContent).toContain("Website publishing is not configured in this environment.");
    expect(second.container.textContent).toContain("Try publishing again");
    act(() => second.root.unmount()); second.container.remove();
  });

  it("starts with a complete honest brief form", async () => {
    const { container, root } = await render(transport(), { initialRequest: "A neighborhood practice with online appointment requests." });
    expect(container.textContent).toContain("Create a useful website for your business");
    expect(container.textContent).toContain("Business name");
    expect(container.textContent).toContain("What does the business do?");
    expect(container.textContent).toContain("Generate a private preview");
    expect(container.textContent).not.toContain("Published");
    expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toContain("A neighborhood practice");
    act(() => root.unmount()); container.remove();
  });

  it("reopens the saved artifact with its canonical preview URL and exact next action", async () => {
    const { container, root } = await render(transport(), { workId });
    expect(container.textContent).toContain("Harbor Dental");
    expect(container.textContent).toContain("Preview version 4");
    expect(container.textContent).toContain("Approve this preview");
    expect(container.textContent).not.toContain("Publish website");
    expect(container.querySelector<HTMLIFrameElement>("iframe")?.getAttribute("src")).toBe("/preview/websites/4");
    expect(container.querySelector<HTMLAnchorElement>("a[download]")?.getAttribute("href")).toBe("/export/websites/4");
    act(() => root.unmount()); container.remove();
  });

  it("keeps the edited brief when regeneration conflicts", async () => {
    const api = transport({ revise: vi.fn(async () => { throw new Error("This website changed while you were editing. Reload the latest version before trying again."); }) });
    const { container, root } = await render(api, { workId });
    const description = [...container.querySelectorAll<HTMLTextAreaElement>("textarea")].find((field) => field.value.includes("family dental"));
    expect(description).toBeTruthy();
    changeField(description!, "Add evening appointments and explain insurance clearly.");
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Generate a new preview"));
    expect(button).toBeTruthy();
    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Reload the latest version before trying again.");
    expect([...container.querySelectorAll<HTMLTextAreaElement>("textarea")].some((field) => field.value.includes("Add evening appointments"))).toBe(true);
    act(() => root.unmount()); container.remove();
  });

  it("approves and publishes exactly the rendered candidate", async () => {
    const api = transport();
    const { container, root } = await render(api, { workId });
    const approve = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Approve this preview"));
    await act(async () => approve?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(api.approve).toHaveBeenCalledWith({ workspaceId, workId, expectedRevision: 4, candidateRevision: 4, candidateContentHash: "a".repeat(64) });
    expect(container.textContent).toContain("Approved revision");
    const publish = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Publish website"));
    await act(async () => publish?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(api.publish).toHaveBeenCalledWith({ workspaceId, workId, expectedRevision: 5, candidateRevision: 4, candidateContentHash: "a".repeat(64) });
    expect(container.textContent).toContain("Your website is live at https://harbor-dental.strelva.site.");
    act(() => root.unmount()); container.remove();
  });

  it("retains the saved brief and offers recovery after artifact failure", async () => {
    const api = transport({
      read: vi.fn(async () => record({ status: "failed", candidate: null, lastError: { stage: "artifact", message: "The website preview could not be generated.", at: "2026-09-20T15:02:00.000Z" } })),
    });
    const { container, root } = await render(api, { workId });
    expect(container.textContent).toContain("Needs attention");
    expect(container.textContent).toContain("Try generating again");
    const retry = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Try generating again"));
    await act(async () => retry?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(api.revise).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, workId, expectedRevision: 4, brief }));
    act(() => root.unmount()); container.remove();
  });

  it("ignores a late create response after the workspace view is replaced", async () => {
    let resolveCreate: ((next: WebsiteRecord) => void) | undefined;
    const create = vi.fn(() => new Promise<WebsiteRecord>((resolve) => { resolveCreate = resolve; }));
    const onSaved = vi.fn();
    const api = transport({ create });
    const { container, root } = await render(api, { onSaved });
    const inputs = container.querySelectorAll<HTMLInputElement>("input");
    changeField(inputs[0]!, "Harbor Dental");
    changeField(container.querySelector<HTMLTextAreaElement>("textarea")!, brief.description);
    const submit = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Generate a private preview"));
    await act(async () => submit?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    act(() => root.unmount());
    resolveCreate?.(record({ revision: 1, candidate: artifact(1) }));
    await act(async () => { await Promise.resolve(); });
    expect(onSaved).not.toHaveBeenCalled();
    container.remove();
  });

  it("renders permission state without offering write actions", async () => {
    const { container, root } = await render(transport(), { workId, readOnly: true });
    expect(container.textContent).toContain("this access level cannot change it");
    expect([...container.querySelectorAll("button")].some((item) => /Generate|Approve|Publish|Offline|offline|Retry/.test(item.textContent || ""))).toBe(false);
    expect(container.querySelector("iframe")).toBeTruthy();
    act(() => root.unmount()); container.remove();
  });

  it("uses the product client paths and strict mutation actions", async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ url: String(input), body });
      return new Response(JSON.stringify(record()), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const signal = new AbortController().signal;
    await serverWebsiteTransport.read({ workspaceId, workId }, signal);
    await serverWebsiteTransport.create({ workspaceId, requestId: "website-request-001", brief });
    await serverWebsiteTransport.revise({ workspaceId, workId, expectedRevision: 4, brief });
    await serverWebsiteTransport.approve({ workspaceId, workId, expectedRevision: 4, candidateRevision: 4, candidateContentHash: "a".repeat(64) });
    await serverWebsiteTransport.publish({ workspaceId, workId, expectedRevision: 5, candidateRevision: 4, candidateContentHash: "a".repeat(64) });
    await serverWebsiteTransport.takeOffline({ workspaceId, workId, expectedRevision: 6 });
    expect(requests.map((request) => request.url)).toEqual([
      `/api/websites/${workId}?workspaceId=${workspaceId}`,
      "/api/websites",
      `/api/websites/${workId}`,
      `/api/websites/${workId}`,
      `/api/websites/${workId}`,
      `/api/websites/${workId}`,
    ]);
    expect(requests[1]?.body).toMatchObject({ action: "create", workspaceId, requestId: "website-request-001", brief });
    expect(requests[2]?.body).toMatchObject({ action: "revise", expectedRevision: 4, brief });
    expect(requests[2]?.body).not.toHaveProperty("workspaceId");
    expect(requests[2]?.body).not.toHaveProperty("workId");
    expect(requests[4]?.body).toMatchObject({ action: "publish", expectedRevision: 5, candidateRevision: 4 });
    expect(requests[5]?.body).toEqual({ action: "takeOffline", expectedRevision: 6 });
    fetchMock.mockRestore();
  });
});
