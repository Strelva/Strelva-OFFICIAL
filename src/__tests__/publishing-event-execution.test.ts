import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), claim: vi.fn(), finish: vi.fn(), resolve: vi.fn(), mark: vi.fn(), authorize: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/events", () => ({ getEvent: m.read, getEventRaw: m.read, claimEventAction: m.claim, finishEventAction: m.finish, resolveEvent: m.resolve, markExecutionExternalAccepted: m.mark }));
vi.mock("@/lib/workspace-ports", () => ({ workspacePorts: () => ({ inquiries: async () => ({ isInquiryMessageReviewEvent: () => false }), publishingContent: async () => ({ authorizePublishingEvent: m.authorize, executePublishingEvent: m.execute }) }) }));
vi.mock("@/lib/agent-executor", () => ({ executeAgentPrompt: vi.fn() }));
vi.mock("@/lib/suggestions", () => ({ updateSuggestion: vi.fn() }));
vi.mock("@/lib/storage", () => ({}));
vi.mock("@/lib/governed-work/shadow", () => ({ shadowStartExecutionAttempt: vi.fn(), shadowFinishExecutionAttempt: vi.fn(), shadowChangeRequestWorkflow: vi.fn() }));
import { resolveEventAction } from "@/lib/event-actions";

const event = { id: "publishing-draft", tenantId: "fixture", type: "content_update", status: "pending", metadata: { kind: "workspace_google_listing_draft" } };
beforeEach(() => { vi.clearAllMocks(); m.read.mockResolvedValue(event); m.claim.mockResolvedValue({ acquired: true, attemptId: "attempt-one" }); m.resolve.mockResolvedValue({ changed: true }); m.authorize.mockResolvedValue({ allowed: true }); });
describe("publishing approval result integrity", () => {
  it("keeps accepted but unverified Google changes distinct from confirmed changes", async () => {
    m.execute.mockResolvedValue({ accepted: true, verified: false });
    expect(await resolveEventAction("fixture", event.id, "approved", "owner")).toEqual({ changed: true, reason: "accepted_unverified" });
    expect(m.mark).toHaveBeenCalledWith(event.id); expect(m.resolve).toHaveBeenCalledTimes(1);
  });
  it("refusal retains the approval and never marks provider acceptance", async () => {
    m.execute.mockResolvedValue({ accepted: false, reason: "api_access_pending" });
    expect(await resolveEventAction("fixture", event.id, "approved", "owner")).toEqual({ changed: false, reason: "api_access_pending" });
    expect(m.resolve).not.toHaveBeenCalled(); expect(m.mark).not.toHaveBeenCalled();
  });
  it("accepted recovery rechecks authority and never repeats the write", async () => {
    m.read.mockResolvedValue({ ...event, metadata: { ...event.metadata, execution: { state: "external_accepted" } } });
    m.authorize.mockResolvedValueOnce({ allowed: false, reason: "publishing_owner_changed" });
    expect(await resolveEventAction("fixture", event.id, "approved", "owner")).toEqual({ changed: false, reason: "publishing_owner_changed" });
    expect(m.resolve).not.toHaveBeenCalled();
    expect(await resolveEventAction("fixture", event.id, "approved", "owner")).toEqual({ changed: true, reason: "accepted_unverified" });
    expect(m.execute).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled();
  });
});
