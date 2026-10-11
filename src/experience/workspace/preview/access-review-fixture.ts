import type { AccessReview } from "@/platform/access-review/contracts";
export const REVIEW_WORKSPACE = "27500000-0000-4000-8000-000000000041";
export const REVIEW_ACTOR = "27500000-0000-4000-8000-000000000001";
export function accessReviewFixture(state = "ready"): AccessReview {
  const role = state === "member" ? "member" : "owner";
  return { workspaceId: REVIEW_WORKSPACE, actorUserId: REVIEW_ACTOR, organization: state === "organization", inaccessibleUnits: state === "organization" ? 1 : 0, units: [{ workspaceId: REVIEW_WORKSPACE, name: "Northstar Consulting", role, entries: state === "empty" ? [] : [
    { id: REVIEW_ACTOR, kind: "member", label: "owner@northstar.example.test", status: "owner", lastUsedAt: null, canRevoke: false },
    { id: "27500000-0000-4000-8000-000000000002", kind: "member", label: "A person with a very long name · contributor@northstar-consulting.example.test", status: "member", lastUsedAt: null, canRevoke: role === "owner" },
    { id: "27500000-0000-4000-8000-000000000061", kind: "delegation", label: "Buffalo Digital Agency", status: "active", lastUsedAt: null, canRevoke: role === "owner" },
    { id: "27500000-0000-4000-8000-000000000071", kind: "provider", label: "Buffalo Digital Agency", status: "active", lastUsedAt: null, canRevoke: false },
    { id: "27500000-0000-4000-8000-000000000081", kind: "agent_token", label: "Research assistant · contributor@northstar.example.test", status: "live", lastUsedAt: "2026-10-08T12:30:00Z", canRevoke: role === "owner" },
  ] }] };
}
