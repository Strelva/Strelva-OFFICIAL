import { beforeEach, describe, expect, it, vi } from "vitest";

const preview = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/experience/workspace/preview/enabled", () => ({ strelvaUiPreviewEnabled: () => preview.enabled }));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => { throw new Error(`REDIRECT:${destination}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
import WorkspacePlacePreviewAlias from "@/app/preview/strelva/workspace/[place]/page";

const open = (place: string, search: Record<string, string> = {}) =>
  WorkspacePlacePreviewAlias({ params: Promise.resolve({ place }), searchParams: Promise.resolve(search) });

describe("preview links to workspace places", () => {
  beforeEach(() => { preview.enabled = true; });

  it.each([
    ["inquiries", "/preview/strelva/places?place=inquiries"],
    ["reviews", "/preview/strelva/places?place=reviews"],
    ["results", "/preview/strelva/places?place=results"],
    ["business-details", "/preview/strelva/places?place=business-details"],
    ["bookings", "/preview/strelva/bookings"],
    ["recaps", "/preview/strelva/recaps"],
    ["site", "/preview/strelva/workspace-site"],
  ])("sends %s to its fixture page", async (place, destination) => {
    await expect(open(place, { workspaceId: "a0000000-0000-4000-8000-000000000001" })).rejects.toThrow(`REDIRECT:${destination}`);
  });

  it("keeps the tab and period, and drops everything else", async () => {
    await expect(open("site", { workspaceId: "w", systemId: "s", tab: "photos" })).rejects.toThrow("REDIRECT:/preview/strelva/workspace-site?tab=photos");
    await expect(open("recaps", { period: "month", other: "x" })).rejects.toThrow("REDIRECT:/preview/strelva/recaps?period=month");
  });

  it("is a 404 for an unknown place and while the preview gate is closed", async () => {
    await expect(open("billing")).rejects.toThrow("NOT_FOUND");
    preview.enabled = false;
    await expect(open("inquiries")).rejects.toThrow("NOT_FOUND");
  });
});
