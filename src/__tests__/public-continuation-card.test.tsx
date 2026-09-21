// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicContinuationCard } from "@/experience/workspace/PublicContinuationCard";
import type { WebsiteExperienceTransport } from "@/experience/websites/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const brief = {
  version: 1 as const,
  id: "11111111-1111-4111-8111-111111111111",
  businessName: "Harbor Dental",
  request: "Make the website explain how families can request an appointment.",
  result: "Visitors understand the next step and know what to expect.",
  resultTitle: "A clearer appointment path",
  scope: "A focused homepage revision reviewed before publication.",
  review: true,
  fileNames: ["current-services.pdf"],
};

const destinations = [{ id: "22222222-2222-4222-8222-222222222222", name: "My work", kind: "personal" as const }];

function transport(): WebsiteExperienceTransport {
  return {
    read: vi.fn(),
    create: vi.fn(async () => ({
      workId: "33333333-3333-4333-8333-333333333333",
      workspaceId: destinations[0]!.id,
      website: {} as never,
      createdAt: "2026-09-20T12:00:00.000Z",
      updatedAt: "2026-09-20T12:00:00.000Z",
    })),
    revise: vi.fn(),
    approve: vi.fn(),
    prepareLaunch: vi.fn(),
  };
}

async function render(websiteTransport: WebsiteExperienceTransport, onWebsiteSaved?: (location: string) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(PublicContinuationCard, {
    brief,
    destinations,
    actorEmail: "owner@example.com",
    websiteTransport,
    onWebsiteSaved,
  })));
  return { container, root };
}

afterEach(() => { document.body.innerHTML = ""; });

describe("public continuation website entry", () => {
  it("carries the retained brief into a durable website record and returns to the website view", async () => {
    const api = transport();
    let destination = "";
    const { container, root } = await render(api, value => { destination = value; });
    const button = [...container.querySelectorAll("button")].find(candidate => candidate.textContent?.includes("Start website draft"));
    expect(button).toBeTruthy();

    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: destinations[0]!.id,
      requestId: `public-website-${brief.id}`,
      brief: {
        businessName: brief.businessName,
        description: brief.request,
        primaryGoal: brief.result,
        primaryCallToAction: "Contact us",
      },
    }));
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      brief: expect.not.objectContaining({ notes: expect.anything() }),
    }));
    expect(destination).toBe(`/workspace?workspaceId=${destinations[0]!.id}&view=websites&work=33333333-3333-4333-8333-333333333333`);
    expect(container.textContent).toContain("website draft");
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the retained brief and allows an explicit retry after website creation fails", async () => {
    const api = transport();
    const create = vi.mocked(api.create);
    create.mockRejectedValueOnce(new Error("This workspace cannot create websites."));
    const { container, root } = await render(api, () => undefined);
    const button = () => [...container.querySelectorAll("button")].find(candidate => candidate.textContent?.includes("Start website draft"));

    await act(async () => button()?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("This workspace cannot create websites.");
    expect(container.textContent).toContain(brief.request);
    expect(button()).toBeTruthy();

    await act(async () => button()?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0].requestId).toBe(create.mock.calls[1]?.[0].requestId);
    await act(async () => root.unmount());
    container.remove();
  });
});
