import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetEvent = vi.fn();
const mockResolveEvent = vi.fn();
const mockUpdateSuggestion = vi.fn();
const mockExecuteAgentPrompt = vi.fn();
const mockGetDraftContent = vi.fn();
const mockGetContent = vi.fn();
const mockSetContent = vi.fn();
const mockAppendVersion = vi.fn();
const mockClearDraft = vi.fn();
const mockRecordSectionUpdate = vi.fn();
const mockRevalidateClientSite = vi.fn();

vi.mock("../lib/events", () => ({
  getEvent: (...args: unknown[]) => mockGetEvent(...args),
  resolveEvent: (...args: unknown[]) => mockResolveEvent(...args),
}));

vi.mock("../lib/suggestions", () => ({
  updateSuggestion: (...args: unknown[]) => mockUpdateSuggestion(...args),
}));

vi.mock("../lib/agent-executor", () => ({
  executeAgentPrompt: (...args: unknown[]) => mockExecuteAgentPrompt(...args),
}));

vi.mock("../lib/storage", () => ({
  getDraftContent: (...args: unknown[]) => mockGetDraftContent(...args),
  getContent: (...args: unknown[]) => mockGetContent(...args),
  setContent: (...args: unknown[]) => mockSetContent(...args),
  appendVersion: (...args: unknown[]) => mockAppendVersion(...args),
  clearDraft: (...args: unknown[]) => mockClearDraft(...args),
  recordSectionUpdate: (...args: unknown[]) => mockRecordSectionUpdate(...args),
  // Staleness guard added by the H4 audit fix; empty = no manual edit after the
  // queued change, so apply proceeds.
  getSectionTimestamps: () => Promise.resolve({}),
}));

vi.mock("../lib/revalidate-client", () => ({
  revalidateClientSite: (...args: unknown[]) => mockRevalidateClientSite(...args),
}));

vi.mock("../lib/ai-auto-approve", () => ({
  recordApproval: vi.fn(() => Promise.resolve(0)),
  recordRejection: vi.fn(() => Promise.resolve()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { resolveEventAction } from "../lib/event-actions";

describe("resolveEventAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRevalidateClientSite.mockResolvedValue(undefined);
  });

  it("does not execute suggestion side effects for already resolved events", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_1",
      tenantId: "tenant-a",
      type: "suggestion",
      status: "approved",
      metadata: {
        suggestionId: "sug_1",
        actionPrompt: "Update the hero",
      },
    });
    mockResolveEvent.mockResolvedValue({ changed: false });

    const result = await resolveEventAction("tenant-a", "evt_1", "approved");

    expect(result).toEqual({ changed: false, reason: "already_resolved" });
    expect(mockUpdateSuggestion).not.toHaveBeenCalled();
    expect(mockExecuteAgentPrompt).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant event resolution", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_1",
      tenantId: "tenant-b",
      type: "suggestion",
      status: "pending",
    });

    const result = await resolveEventAction("tenant-a", "evt_1", "dismissed");

    expect(result).toEqual({ changed: false, reason: "wrong_tenant" });
    expect(mockResolveEvent).not.toHaveBeenCalled();
  });

  it("executes an approved pending suggestion once", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_1",
      tenantId: "tenant-a",
      type: "suggestion",
      status: "pending",
      metadata: {
        suggestionId: "sug_1",
        actionPrompt: "Update Saturday class",
      },
    });
    mockResolveEvent.mockResolvedValue({ changed: true });

    const result = await resolveEventAction("tenant-a", "evt_1", "approved");

    expect(result).toEqual({ changed: true });
    expect(mockUpdateSuggestion).toHaveBeenCalledWith("tenant-a", "sug_1", "accepted");
    expect(mockExecuteAgentPrompt).toHaveBeenCalledWith("tenant-a", "Update Saturday class");
  });

  it("approves queued agent preview content from durable event metadata when draft cache is missing", async () => {
    mockGetEvent.mockResolvedValue({
      id: "evt_1",
      tenantId: "tenant-a",
      type: "content_update",
      status: "pending",
      metadata: {
        kind: "agent_preview",
        section: "contact",
        proposedData: {
          email: "new@example.com",
          locationTitle: "Studio",
          locationDescription: "Street parking nearby.",
          instagramUrl: "",
          facebookUrl: "",
        },
      },
    });
    mockResolveEvent.mockResolvedValue({ changed: true });
    mockGetDraftContent.mockResolvedValue(null);
    mockGetContent.mockResolvedValue({ email: "old@example.com" });

    const result = await resolveEventAction("tenant-a", "evt_1", "approved");

    expect(result).toEqual({ changed: true });
    expect(mockSetContent).toHaveBeenCalledWith(
      "contact",
      {
        email: "new@example.com",
        locationTitle: "Studio",
        locationDescription: "Street parking nearby.",
        instagramUrl: "",
        facebookUrl: "",
      },
      "tenant-a"
    );
    expect(mockClearDraft).toHaveBeenCalledWith("contact", "tenant-a");
  });
});
