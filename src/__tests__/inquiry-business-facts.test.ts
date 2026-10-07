import { afterEach, describe, expect, it, vi } from "vitest";
import { extractOnboardingFacts } from "@/products/inquiries/onboarding";
import { inquiryScanFactSuggestions, stageInquiryScanFacts, inquiryRecordOnboarding } from "@/products/inquiries/business-facts";
import { inquiryFactAdapter } from "@/platform/needs-you/sources/inquiry-fact";
import type { OwnerDecision } from "@/platform/needs-you/contracts";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), release: vi.fn() }));
vi.mock("@/platform/infra/inquiry-records", () => ({ inquiryRecordsRpc: mocks.rpc }));
vi.mock("@/products/inquiries/release", () => ({ inquiryReleaseEnabledForWorkspace: mocks.release }));
const workspace = "f6300000-0000-4000-8000-000000000010";
const actor = { userId: "f6300000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const facts = extractOnboardingFacts('<script type="application/ld+json">{"@type":"Restaurant","name":"Fixture","openingHours":"Mo-Fr 09:00-17:00"}</script>', "https://fixture.example.test");
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("scan facts are owner decisions", () => {
  it("proposes typed facts with evidence and refuses to infer a timezone, staff identity or authority", () => {
    expect(inquiryScanFactSuggestions(facts).map(item => item.key)).toEqual(["links", "display_name"]);
    expect(inquiryScanFactSuggestions(facts).every(item => item.provenance)).toBe(true);
  });
  it("renders current shared facts, marks unknowns and never uses old scan receipts as current truth", () => {
    const projected = inquiryRecordOnboarding({ workspaceId: workspace, people: [], services: [], facts: { display_name: { value: "Owner's current name", verified: true } } });
    expect(projected.statements.find(statement => statement.id === "business")).toMatchObject({ value: "Owner's current name", confirmed: true, provenance: "Business details" });
    expect(projected.statements.find(statement => statement.id === "hours")).toMatchObject({ value: null, confirmed: false, editable: false });
  });
  it("flags off and unreleased businesses write nothing", async () => {
    vi.stubEnv("STRELVA_INQUIRY_BUSINESS_FACTS", ""); await stageInquiryScanFacts(workspace, actor.userId, facts);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_BUSINESS_FACTS", "1"); mocks.release.mockResolvedValue(false);
    await stageInquiryScanFacts(workspace, actor.userId, facts); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("stages exact evidence through one RPC, not a verified business patch", async () => {
    vi.stubEnv("STRELVA_INQUIRY_BUSINESS_FACTS", "1"); mocks.release.mockResolvedValue(true);
    await stageInquiryScanFacts(workspace, actor.userId, facts);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith("stage_inquiry_business_fact", expect.objectContaining({ p_workspace_id: workspace, p_user_id: actor.userId, p_key: "display_name", p_value: "Fixture" }));
  });
  it("stays owner-only and links without sign-in; stale or failed resolvers cannot claim it saved", async () => {
    const fact = { id: actor.userId, workspaceId: workspace, key: "display_name", value: "Fixture", provenance: "website", revisionHash: "a".repeat(64) };
    const decide = vi.fn(); const adapter = inquiryFactAdapter({ list: vi.fn(async () => [fact]), revision: vi.fn(async () => fact.revisionHash), decide });
    const ctx = { workspaceId: workspace, actor };
    const proposal = (await adapter.propose(ctx)).items[0]!;
    expect(proposal).toMatchObject({ kind: "fact.inferred", route: "owner_decides", adminMayDecide: false }); expect(adapter.needsMemberActor).toBe(false);
    expect(await adapter.currentRevision({ workspaceId: workspace }, fact.id)).toBe(fact.revisionHash);
    const item = { ...proposal, id: "decision", workspaceId: workspace } as OwnerDecision;
    expect(await adapter.resolve(ctx, item, "not_yet", { kind: "owner_link", recipient: actor.verifiedEmail, actor: null })).toMatchObject({ outcome: "done" }); expect(decide).not.toHaveBeenCalled();
    decide.mockRejectedValue(new Error("stale"));
    expect(await adapter.resolve(ctx, item, "approve", { kind: "owner_link", recipient: actor.verifiedEmail, actor: null })).toMatchObject({ outcome: "failed" });
  });
});
