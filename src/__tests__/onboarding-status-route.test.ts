import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockGetTenantFromHeaders = vi.hoisted(() => vi.fn());
const mockRequireTenantAccess = vi.hoisted(() => vi.fn());
const mockGetActivity = vi.hoisted(() => vi.fn());
const mockGetWeeklyBrief = vi.hoisted(() => vi.fn());
const mockGetConnections = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: mockGetTenantFromHeaders }));
vi.mock("@/lib/auth", () => ({ requireTenantAccess: mockRequireTenantAccess }));
vi.mock("@/lib/storage", () => ({ getActivity: mockGetActivity }));
vi.mock("@/lib/weekly-brief", () => ({ getWeeklyBrief: mockGetWeeklyBrief }));
vi.mock("@/lib/connections", () => ({ getConnections: mockGetConnections }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFromHeaders.mockResolvedValue("acme");
  mockRequireTenantAccess.mockResolvedValue(null);
  mockGetActivity.mockResolvedValue([]);
  mockGetWeeklyBrief.mockResolvedValue(null);
  mockGetConnections.mockResolvedValue([]);
});

describe("GET /api/dashboard/onboarding-status", () => {
  it("returns the access denial when the tenant gate fails", async () => {
    mockRequireTenantAccess.mockResolvedValue(NextResponse.json({ error: "no" }, { status: 403 }));
    const { GET } = await import("@/app/api/dashboard/onboarding-status/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("reports all steps incomplete for a brand-new tenant", async () => {
    const { GET } = await import("@/app/api/dashboard/onboarding-status/route");
    const body = await (await GET()).json();
    expect(body.complete).toBe(false);
    expect(body.steps.every((s: { done: boolean }) => !s.done)).toBe(true);
  });

  it("marks each step done from real signals", async () => {
    mockGetConnections.mockResolvedValue([{ id: "google" }]);
    mockGetActivity.mockResolvedValue([{ text: "AI updated hours" }]);
    mockGetWeeklyBrief.mockResolvedValue({ summary: "..." });
    const { GET } = await import("@/app/api/dashboard/onboarding-status/route");
    const body = await (await GET()).json();
    expect(body.complete).toBe(true);
    const byKey = Object.fromEntries(body.steps.map((s: { key: string; done: boolean }) => [s.key, s.done]));
    expect(byKey).toEqual({ connect: true, ai_edit: true, report: true });
  });
});
