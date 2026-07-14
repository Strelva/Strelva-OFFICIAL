import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AiVisibilityResult } from "@/lib/ai-visibility/score";

const mocks = vi.hoisted(() => ({
  rateLimited: vi.fn(),
  score: vi.fn(),
  saveResult: vi.fn(),
  getResult: vi.fn(),
  getLeadToken: vi.fn(),
  saveLead: vi.fn(),
  createToken: vi.fn(() => "token_123"),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedWindowedAsync: mocks.rateLimited,
  rateLimitKey: vi.fn(() => "test:127.0.0.1"),
}));
vi.mock("@/lib/ai-visibility/score", () => ({ scoreAiVisibility: mocks.score }));
vi.mock("@/lib/ai-visibility/results", () => ({
  saveAiVisibilityResult: mocks.saveResult,
  getAiVisibilityResult: mocks.getResult,
}));
vi.mock("@/lib/access-request-delivery", () => ({
  createDeliveryStatusToken: mocks.createToken,
  getExistingLeadToken: mocks.getLeadToken,
  saveDeliveryLead: mocks.saveLead,
}));

import { POST as runAudit } from "@/app/api/ai-visibility/route";
import { POST as joinMonitoring } from "@/app/api/ai-visibility/[id]/monitor/route";

const result: AiVisibilityResult = {
  business: "Acme Plumbing",
  url: "https://acme.example",
  score: 42,
  grade: "F",
  verdict: "Acme Plumbing has weak AI readiness.",
  signals: [],
  citation: { probed: false, mentioned: false, recommended: false, note: "Not probed." },
  topFix: "Add LocalBusiness structured data.",
};

const stored = {
  id: "scan_abc123",
  result,
  input: { category: "plumber", location: "Buffalo, NY" },
  source: "newsletter",
  createdAt: "2026-07-14T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimited.mockResolvedValue(false);
  mocks.score.mockResolvedValue(result);
  mocks.saveResult.mockResolvedValue(stored);
  mocks.getResult.mockResolvedValue(stored);
  mocks.getLeadToken.mockResolvedValue(null);
  mocks.saveLead.mockResolvedValue(true);
  mocks.createToken.mockReturnValue("token_123");
});

describe("AI Visibility public routes", () => {
  it("returns a durable share URL and records acquisition source", async () => {
    const response = await runAudit(new NextRequest("https://app.strelva.com/api/ai-visibility", {
      method: "POST",
      body: JSON.stringify({
        business: "Acme Plumbing",
        url: "acme.example",
        category: "plumber",
        city: "Buffalo, NY",
        source: "newsletter",
      }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      scanId: "scan_abc123",
      shareUrl: "https://app.strelva.com/ai-visibility/scan_abc123",
    });
    expect(mocks.saveResult).toHaveBeenCalledWith(
      result,
      { category: "plumber", location: "Buffalo, NY" },
      "newsletter",
    );
  });

  it("promotes monitoring interest into the delivery-lead lifecycle", async () => {
    const response = await joinMonitoring(
      new Request("https://app.strelva.com/api/ai-visibility/scan_abc123/monitor", {
        method: "POST",
        body: JSON.stringify({ email: "OWNER@ACME.EXAMPLE" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "scan_abc123" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.saveLead).toHaveBeenCalledWith(expect.objectContaining({
      businessName: "Acme Plumbing",
      email: "owner@acme.example",
      referredBy: "ai-visibility:scan_abc123",
      deliveryStatus: "received",
    }));
  });

  it("does not overwrite an existing prospect with the lighter pilot signal", async () => {
    mocks.getLeadToken.mockResolvedValue("existing-token");
    const response = await joinMonitoring(
      new Request("https://app.strelva.com/api/ai-visibility/scan_abc123/monitor", {
        method: "POST",
        body: JSON.stringify({ email: "owner@acme.example" }),
      }),
      { params: Promise.resolve({ id: "scan_abc123" }) },
    );
    expect(await response.json()).toEqual({ success: true, existing: true });
    expect(mocks.saveLead).not.toHaveBeenCalled();
  });
});
