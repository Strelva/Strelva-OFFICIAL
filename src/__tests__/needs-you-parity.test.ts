import { describe, expect, it } from "vitest";
import type { UnifiedEvent } from "@/lib/types";
import { replayTenantParity, seedPolicyFromTenant } from "@/platform/needs-you/parity";
import { classifyTenantEvent, observedTenantRoute, tenantEventRevision } from "@/platform/needs-you/tenant-classify";

// A fictional tenant's recent history, one event per approval type the
// tenant model has today (spec section 6). No real client data.
let n = 0;
function ev(over: Partial<UnifiedEvent> & Pick<UnifiedEvent, "type" | "status">): UnifiedEvent {
  n += 1;
  return { id: `evt-${n}`, tenantId: "fixture-firm", source: "ai", title: `Event ${n}`, body: "", createdAt: "2026-10-01T12:00:00Z", ...over };
}

const history: UnifiedEvent[] = [
  // Owner asked in chat; Strelva drafted marketing copy; the owner reviews it.
  ev({ type: "content_update", status: "pending", metadata: { kind: "agent_preview", governanceReason: "marketing_copy" } }),
  // Strelva-started copy draft held for the operator.
  ev({ type: "content_update", status: "pending", metadata: { kind: "agent_preview", governanceReason: "unclassified", reviewAudience: "operator" } }),
  // Strelva-started high-risk fact: today the operator sees it; the spec sends it to the owner.
  ev({ type: "content_update", status: "approved", metadata: { kind: "agent_preview", governanceReason: "high_risk_facts", reviewAudience: "operator" } }),
  // Governance published a factual update with no review.
  ev({ type: "content_update", status: "auto_approved", metadata: { section: "hours" } }),
  // Review replies: auto mode 5 stars, auto mode 1 star, approve mode 4 stars.
  ev({ type: "review", status: "approved", metadata: { kind: "review_reply_draft", rating: 5, autoPostAt: "2026-10-01T20:00:00Z" } }),
  ev({ type: "review", status: "pending", metadata: { kind: "review_reply_draft", rating: 1, autoPostAt: "2026-10-01T20:00:00Z" } }),
  ev({ type: "review", status: "pending", metadata: { kind: "review_reply_draft", rating: 4 } }),
  // Google drafts the owner asked for in chat, and one Strelva proposed.
  ev({ type: "content_update", status: "pending", metadata: { kind: "gbp_post_draft", reviewAudience: "owner" } }),
  ev({ type: "content_update", status: "pending", metadata: { kind: "gbp_photo_draft", reviewAudience: "operator" } }),
  ev({ type: "newsletter_draft", status: "pending", metadata: { kind: "newsletter_approval" } }),
  ev({ type: "content_update", status: "pending", metadata: { kind: "manual_structural_change" } }),
  ev({ type: "content_update", status: "pending", metadata: { kind: "offboarding_handoff_request" } }),
  // A read-back failure from before the fix: no review audience, so the owner saw it.
  ev({ type: "change_verify_failed", status: "pending", metadata: { kind: "review_reply_verify_failed" } }),
  // Not changes at all.
  ev({ type: "review", status: "pending", source: "google", metadata: {} }),
  ev({ type: "booking", status: "auto_approved" }),
  ev({ type: "change_verified", status: "auto_approved" }),
  ev({ type: "suggestion", status: "pending", title: "Add a FAQ" }),
];

const settings = { tenantId: "fixture-firm", contentAutonomy: "approve" as const, replyMode: "approve" as const, autoApproveThreshold: 0 };

describe("parity replay", () => {
  it("replays a tenant's history with no blocking mismatch", () => {
    const report = replayTenantParity(settings, history);
    const byId = new Map(report.rows.map(row => [row.eventId, row]));
    expect(report.blocked).toBe(false);
    expect(report.counts.blocking).toBe(0);
    // Owner-asked copy stays with the owner, as today.
    expect(byId.get("evt-1")).toMatchObject({ kind: "copy.marketing", observed: "owner_decides", evaluated: "owner_decides", verdict: "match" });
    expect(byId.get("evt-2")).toMatchObject({ observed: "strelva_reviews", evaluated: "strelva_reviews", verdict: "match" });
    // Stricter, by design: inferred facts and critical reviews go to the owner.
    expect(byId.get("evt-3")).toMatchObject({ kind: "fact.inferred", observed: "strelva_reviews", evaluated: "owner_decides", verdict: "stricter" });
    expect(byId.get("evt-4")).toMatchObject({ observed: "handle", evaluated: "strelva_reviews", verdict: "stricter" });
    expect(byId.get("evt-5")).toMatchObject({ kind: "review.reply", observed: "handle_after_notice", evaluated: "handle_after_notice", verdict: "match" });
    expect(byId.get("evt-6")).toMatchObject({ kind: "review.reply_critical", observed: "handle_after_notice", evaluated: "owner_decides", verdict: "stricter" });
    expect(byId.get("evt-7")).toMatchObject({ observed: "owner_decides", evaluated: "owner_decides", verdict: "match" });
    expect(byId.get("evt-8")).toMatchObject({ kind: "google.post", observed: "owner_decides", evaluated: "owner_decides", verdict: "match" });
    expect(byId.get("evt-9")).toMatchObject({ kind: "google.photo", observed: "strelva_reviews", evaluated: "strelva_reviews", verdict: "match" });
    expect(byId.get("evt-10")).toMatchObject({ kind: "customer.broadcast", verdict: "match" });
    expect(byId.get("evt-11")).toMatchObject({ kind: "structure", verdict: "match" });
    expect(byId.get("evt-12")).toMatchObject({ kind: "exit", evaluated: "owner_decides", verdict: "match" });
    expect(byId.get("evt-13")).toMatchObject({ kind: "verify.failed", observed: "strelva_reviews", evaluated: "strelva_reviews" });
    expect(byId.get("evt-17")).toMatchObject({ kind: "suggestion", evaluated: "never", verdict: "match" });
    expect(report.counts.verifyFailedLeaked).toBe(1);
    expect(report.counts.skipped).toBe(3);
  });

  it("blocks when the evaluator would be looser than today without a spec rule", () => {
    // Earned trust at replay time can promote a change that today went to the operator.
    const report = replayTenantParity({ ...settings, autoApproveThreshold: 3, approvalStreak: 9 }, [history[1]]);
    expect(report.rows[0]).toMatchObject({ observed: "strelva_reviews", evaluated: "handle", rule: "earned_trust", verdict: "blocking" });
    expect(report.blocked).toBe(true);
  });

  it("ignores events from another tenant and duplicates from the Postgres mirror", () => {
    const report = replayTenantParity(settings, [history[0], { ...history[0] }, { ...history[1], tenantId: "someone-else" }]);
    expect(report.rows).toHaveLength(1);
    expect(report.counts.skipped).toBe(2);
  });

  it("never migrates today's looser content autonomy silently", () => {
    const seeded = seedPolicyFromTenant({ ...settings, contentAutonomy: "auto", replyMode: "auto" });
    expect(seeded.policies).toEqual([]);
    expect(seeded.notMigrated).toEqual([expect.objectContaining({ setting: "reb:content-autonomy" })]);
    expect(seedPolicyFromTenant(settings).policies).toEqual([{ layer: "owner", systemId: null, kind: "review.reply", route: "owner_decides" }]);
  });
});

describe("tenant event classification", () => {
  it("never treats an incoming review, booking or read-back as a change", () => {
    expect(classifyTenantEvent(history[13])).toBeNull();
    expect(classifyTenantEvent(history[14])).toBeNull();
    expect(classifyTenantEvent(history[15])).toBeNull();
  });

  it("observes today's route from what the event records", () => {
    expect(observedTenantRoute(history[3]).route).toBe("handle");
    expect(observedTenantRoute(history[12])).toEqual({ route: "strelva_reviews", verifyFailedLeaked: true });
    expect(observedTenantRoute({ ...history[12], metadata: { reviewAudience: "operator" } }).verifyFailedLeaked).toBe(false);
  });

  it("binds a revision to what the owner approves, not to execution bookkeeping", () => {
    const base = history[6];
    const edited = { ...base, metadata: { ...base.metadata, draftedReply: "Thanks so much!" } };
    const locked = { ...base, metadata: { ...base.metadata, execution: { state: "processing" as const, action: "approved" as const, actor: "x", attemptId: "a", startedAt: "t" } } };
    expect(tenantEventRevision(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(tenantEventRevision(edited)).not.toBe(tenantEventRevision(base));
    expect(tenantEventRevision(locked)).toBe(tenantEventRevision(base));
  });
});
