import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENCY_EFFECTS,
  deriveAgencyOnboarding,
  listMemberAgencies,
  readAgencyOnboarding,
  type AgencyOnboardingDeps,
  type AgencyOnboardingFacts,
} from "@/platform/workspaces/agency-onboarding";
import { WorkspaceAccessError, WorkspaceStoreError, type Workspace } from "@/platform/workspaces/types";

// Agency setup checklist (#258). Derived from facts; the read checks agency
// membership before anything else. The SQL side (creation grants nothing,
// every effect unverified, the read refuses non-members) is proven in
// tests/agency-signup-schema.sql. Fictional data only.

const USER = "5a000000-0000-4000-8000-000000000001";
const AGENCY = "5a000000-0000-4000-8000-000000000010";
const OTHER_AGENCY = "5a000000-0000-4000-8000-000000000020";
const CUSTOMER = "5a000000-0000-4000-8000-000000000030";
const actor = { userId: USER, verifiedEmail: "Owner@Northside.example" };

const unverified = AGENCY_EFFECTS.map((effect) => ({ effect, verified: false, recordedAt: null }));
const facts = (over: Partial<AgencyOnboardingFacts> = {}): AgencyOnboardingFacts => ({
  agency: { id: AGENCY, name: "Northside Web Care", role: "owner" }, members: 1, pendingInvitations: 0, clients: 0, effects: unverified, ...over,
});

function ws(id: string, kind: Workspace["kind"], over: Partial<Workspace> = {}): Workspace {
  return { id, kind, name: kind === "agency" ? "Northside Web Care" : "Business", createdBy: USER, createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z", access: "member", role: "owner", ...over };
}

const state = (effects: Array<{ effect: string; status: string; recorded?: boolean; recordedAt?: string | null }>) => ({
  agencyWorkspaceId: AGENCY,
  effects: effects.map((item) => ({ recorded: false, recordedAt: null, reason: null, verifierIsAgencyMember: null, ...item })),
});

let deps: AgencyOnboardingDeps & { [K in keyof AgencyOnboardingDeps]: ReturnType<typeof vi.fn> };
beforeEach(() => {
  deps = {
    listWorkspaces: vi.fn(async () => [ws(AGENCY, "agency"), ws(CUSTOMER, "customer")]),
    rpc: vi.fn(async (name: string) => {
      if (name === "read_agency_verification") return { data: state(AGENCY_EFFECTS.map((effect) => ({ effect, status: "unverified" }))), error: null };
      if (name === "read_agency_provider_seats") return { data: [], error: null };
      return { data: null, error: { message: `unexpected ${name}` } };
    }),
    countMembers: vi.fn(async () => 1),
    countPendingInvitations: vi.fn(async () => 0),
  } as typeof deps;
});

describe("deriveAgencyOnboarding", () => {
  it("starts a new agency with its profile done, team next, every effect unverified and the first client after", () => {
    const result = deriveAgencyOnboarding(facts());
    expect(result.steps).toEqual([
      { id: "profile", done: true, available: true },
      { id: "team", done: false, available: true },
      { id: "verification", done: false, available: false },
      { id: "first_client", done: false, available: false },
    ]);
    expect(result.next).toBe("team");
    expect(result.verifiedEffects).toBe(0);
  });

  it("counts a pending invitation as the team step done and points at the first client next", () => {
    const result = deriveAgencyOnboarding(facts({ pendingInvitations: 1 }));
    expect(result.steps.find((step) => step.id === "team")?.done).toBe(true);
    // Verification is Strelva's to record, so it is never the agency's next step.
    expect(result.next).toBe("first_client");
  });

  it("does not offer the team step to a member who cannot invite", () => {
    const result = deriveAgencyOnboarding(facts({ agency: { id: AGENCY, name: "Northside", role: "member" }, members: 2, pendingInvitations: null }));
    expect(result.steps.find((step) => step.id === "team")).toEqual({ id: "team", done: true, available: false });
    const alone = deriveAgencyOnboarding(facts({ agency: { id: AGENCY, name: "Northside", role: "admin" }, pendingInvitations: null }));
    expect(alone.steps.find((step) => step.id === "team")?.available).toBe(false);
    expect(alone.next).toBe("first_client");
  });

  it("marks verification done only when all four effects are verified", () => {
    const some = deriveAgencyOnboarding(facts({ effects: unverified.map((effect) => ({ ...effect, verified: effect.effect === "publish" })) }));
    expect(some.verifiedEffects).toBe(1);
    expect(some.steps.find((step) => step.id === "verification")?.done).toBe(false);
    const all = deriveAgencyOnboarding(facts({ effects: unverified.map((effect) => ({ ...effect, verified: true })) }));
    expect(all.steps.find((step) => step.id === "verification")?.done).toBe(true);
  });

  it("has no next step once everything the agency can do is done", () => {
    const result = deriveAgencyOnboarding(facts({ members: 3, clients: 2 }));
    expect(result.next).toBeNull();
  });
});

describe("readAgencyOnboarding", () => {
  it("reads the checklist for the actor's own agency through the actor-checked functions", async () => {
    deps.countPendingInvitations.mockResolvedValue(2);
    deps.rpc.mockImplementation(async (name: string) => name === "read_agency_verification"
      ? { data: state([{ effect: "publish", status: "verified", recorded: true, recordedAt: "2026-10-07T12:00:00.000Z" }, { effect: "google", status: "unverified", recorded: true, recordedAt: "2026-10-07T12:00:00.000Z" }]), error: null }
      : { data: [{ customerWorkspaceId: CUSTOMER, name: "Business", seatId: "x" }, { customerWorkspaceId: CUSTOMER }], error: null });

    const result = await readAgencyOnboarding(actor, AGENCY, deps);

    const args = { p_user_id: USER, p_verified_email: "owner@northside.example", p_agency_workspace_id: AGENCY };
    expect(deps.rpc).toHaveBeenCalledWith("read_agency_verification", args);
    expect(deps.rpc).toHaveBeenCalledWith("read_agency_provider_seats", args);
    expect(deps.countMembers).toHaveBeenCalledWith(AGENCY);
    expect(result.agency).toEqual({ id: AGENCY, name: "Northside Web Care", role: "owner" });
    expect(result.pendingInvitations).toBe(2);
    expect(result.clients).toBe(1);
    // Every effect is listed, in order; one the database left out reads as unverified.
    expect(result.effects).toEqual([
      { effect: "publish", verified: true, recordedAt: "2026-10-07T12:00:00.000Z" },
      { effect: "google", verified: false, recordedAt: "2026-10-07T12:00:00.000Z" },
      { effect: "email", verified: false, recordedAt: null },
      { effect: "payments", verified: false, recordedAt: null },
    ]);
  });

  it("does not ask for invitations a non-owner cannot read", async () => {
    deps.listWorkspaces.mockResolvedValue([ws(AGENCY, "agency", { role: "member" })]);
    const result = await readAgencyOnboarding(actor, AGENCY, deps);
    expect(deps.countPendingInvitations).not.toHaveBeenCalled();
    expect(result.pendingInvitations).toBeNull();
  });

  it.each([
    ["another agency", OTHER_AGENCY],
    ["a customer business the actor owns", CUSTOMER],
    ["a malformed id", "not-a-uuid"],
  ])("refuses %s before reading anything", async (_label, id) => {
    await expect(readAgencyOnboarding(actor, id, deps)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(deps.rpc).not.toHaveBeenCalled();
    expect(deps.countMembers).not.toHaveBeenCalled();
  });

  it("refuses an agency shared with the actor only to read", async () => {
    deps.listWorkspaces.mockResolvedValue([ws(AGENCY, "agency", { access: "delegated_read", role: undefined })]);
    await expect(readAgencyOnboarding(actor, AGENCY, deps)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("refuses an unverified identity", async () => {
    await expect(readAgencyOnboarding({ userId: USER, verifiedEmail: "" }, AGENCY, deps)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(deps.listWorkspaces).not.toHaveBeenCalled();
  });

  it("maps a database refusal to access and anything malformed to a store failure", async () => {
    deps.rpc.mockResolvedValueOnce({ data: null, error: { message: "agency_verification_access_denied" } });
    await expect(readAgencyOnboarding(actor, AGENCY, deps)).rejects.toBeInstanceOf(WorkspaceAccessError);
    deps.rpc.mockResolvedValueOnce({ data: { agencyWorkspaceId: OTHER_AGENCY, effects: [] }, error: null });
    await expect(readAgencyOnboarding(actor, AGENCY, deps)).rejects.toBeInstanceOf(WorkspaceStoreError);
    deps.rpc.mockResolvedValueOnce({ data: state([{ effect: "publish_domain", status: "verified" }]), error: null });
    await expect(readAgencyOnboarding(actor, AGENCY, deps)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});

describe("listMemberAgencies", () => {
  it("lists only agencies the actor is a member of", async () => {
    deps.listWorkspaces.mockResolvedValue([
      ws(AGENCY, "agency"), ws(OTHER_AGENCY, "agency", { access: "delegated_read", role: undefined }), ws(CUSTOMER, "customer"),
    ]);
    expect(await listMemberAgencies(actor, deps)).toEqual([{ id: AGENCY, name: "Northside Web Care", role: "owner" }]);
  });
});

describe("createAgencyWorkspace failures", () => {
  it("names the per-account cap and refuses an unverified identity", async () => {
    vi.resetModules();
    const rpc = vi.fn();
    vi.doMock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc }) }));
    const { createAgencyWorkspace } = await import("@/platform/workspaces/repository");
    const types = await import("@/platform/workspaces/types");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "workspace_limit_reached" } });
    await expect(createAgencyWorkspace(actor, "Sixth")).rejects.toThrow(types.WORKSPACE_LIMIT_MESSAGE);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "verified_identity_required" } });
    await expect(createAgencyWorkspace(actor, "Northside")).rejects.toBeInstanceOf(types.WorkspaceAccessError);
    expect(rpc).toHaveBeenCalledWith("create_owned_workspace", { p_user_id: USER, p_verified_email: "owner@northside.example", p_kind: "agency", p_name: "Northside" });
    vi.doUnmock("@/platform/infra/db/client");
  });
});
