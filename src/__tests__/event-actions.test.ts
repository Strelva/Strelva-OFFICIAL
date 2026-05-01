import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetEvent = vi.fn();
const mockResolveEvent = vi.fn();
const mockUpdateSuggestion = vi.fn();
const mockExecuteAgentPrompt = vi.fn();

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

import { resolveEventAction } from "../lib/event-actions";

describe("resolveEventAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
