/**
 * Agency onboarding (agency 1.0 #258, audit A AG-08, company ADR 0012).
 *
 * Signup is open and an agency is created through the ordinary
 * `create_owned_workspace` path (`POST /api/workspace` `create_agency`), the
 * same one Strelva's own agency uses. Creating it grants nothing outside the
 * agency's own workspace: one owner membership, no seat, no client, and every
 * effect unverified (20261009152000_agency_verifications.sql).
 *
 * The checklist is derived, never stored: profile from the workspace, team
 * from memberships and pending invitations, verification from
 * `read_agency_verification`, first client from the agency's active provider
 * seats. Nothing here writes, and nothing here records or proposes
 * verification criteria (open decision #233).
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { listWorkspaceInvitations } from "./invitations";
import { listWorkspaces } from "./repository";
import { WorkspaceAccessError, WorkspaceStoreError, type Workspace, type WorkspaceActor, type WorkspaceRole } from "./types";

export const AGENCY_EFFECTS = ["publish", "google", "email", "payments"] as const;
export type AgencyEffect = (typeof AGENCY_EFFECTS)[number];

const uuid = z.string().uuid();
const verificationSchema = z.object({
  agencyWorkspaceId: uuid,
  effects: z.array(z.object({
    effect: z.enum(AGENCY_EFFECTS),
    status: z.enum(["verified", "unverified"]),
    recorded: z.boolean(),
    recordedAt: z.string().nullable(),
  }).passthrough()),
}).passthrough();
const seatsSchema = z.array(z.object({ customerWorkspaceId: uuid }).passthrough());

export interface AgencyEffectState {
  effect: AgencyEffect;
  verified: boolean;
  recordedAt: string | null;
}

export interface AgencyOnboardingFacts {
  agency: { id: string; name: string; role: WorkspaceRole };
  members: number;
  /** Pending, unexpired invitations. Null when the actor cannot read them (only owners can). */
  pendingInvitations: number | null;
  clients: number;
  effects: AgencyEffectState[];
}

export type AgencyOnboardingStepId = "profile" | "team" | "verification" | "first_client";

export interface AgencyOnboardingStep {
  id: AgencyOnboardingStepId;
  done: boolean;
  /** Whether this actor can act on the step now. "first_client" stays false until adding clients ships (#259). */
  available: boolean;
}

export interface AgencyOnboarding extends AgencyOnboardingFacts {
  steps: AgencyOnboardingStep[];
  /** The first step not yet done that this actor can do something about, or null. */
  next: AgencyOnboardingStepId | null;
  verifiedEffects: number;
}

export interface AgencySummary { id: string; name: string; role: WorkspaceRole }

/**
 * The checklist from facts. Verification is "done" only when every effect is
 * verified; the agency cannot do it here, so it is never the next step.
 */
export function deriveAgencyOnboarding(facts: AgencyOnboardingFacts): AgencyOnboarding {
  const owner = facts.agency.role === "owner";
  const verifiedEffects = facts.effects.filter((effect) => effect.verified).length;
  const steps: AgencyOnboardingStep[] = [
    { id: "profile", done: facts.agency.name.trim().length > 0, available: true },
    { id: "team", done: facts.members > 1 || (facts.pendingInvitations ?? 0) > 0, available: owner },
    { id: "verification", done: facts.effects.length === AGENCY_EFFECTS.length && verifiedEffects === AGENCY_EFFECTS.length, available: false },
    { id: "first_client", done: facts.clients > 0, available: false },
  ];
  const next = steps.find((step) => !step.done && step.available)?.id
    ?? steps.find((step) => !step.done && step.id === "first_client")?.id
    ?? null;
  return { ...facts, steps, next, verifiedEffects };
}

export interface AgencyOnboardingDeps {
  listWorkspaces(actor: WorkspaceActor): Promise<Workspace[]>;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  countMembers(workspaceId: string): Promise<number>;
  countPendingInvitations(actor: WorkspaceActor, workspaceId: string): Promise<number>;
}

function client() {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Workspace storage is not configured");
  return db;
}

const defaultDeps: AgencyOnboardingDeps = {
  listWorkspaces,
  rpc: (name, args) => (client() as unknown as { rpc: AgencyOnboardingDeps["rpc"] }).rpc(name, args),
  async countMembers(workspaceId) {
    const { count, error } = await client().from("workspace_memberships")
      .select("user_id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
    if (error || count === null) throw new WorkspaceStoreError("Agency team is unavailable");
    return count;
  },
  async countPendingInvitations(actor, workspaceId) {
    return (await listWorkspaceInvitations(actor, workspaceId)).filter((invitation) => invitation.status === "pending").length;
  },
};

function cleanActor(actor: WorkspaceActor): WorkspaceActor {
  const verifiedEmail = actor.verifiedEmail?.trim().toLowerCase();
  if (!uuid.safeParse(actor.userId).success || !verifiedEmail || !z.string().email().safeParse(verifiedEmail).success) {
    throw new WorkspaceAccessError("A verified signed-in identity is required");
  }
  return { userId: actor.userId, verifiedEmail };
}

function memberAgencies(workspaces: Workspace[]): AgencySummary[] {
  return workspaces.filter((workspace) => workspace.kind === "agency" && workspace.access === "member" && workspace.role)
    .map((workspace) => ({ id: workspace.id, name: workspace.name, role: workspace.role! }));
}

/** Agencies the actor belongs to, oldest first as listed. Delegated reads are not agencies the actor runs. */
export async function listMemberAgencies(actor: WorkspaceActor, deps: AgencyOnboardingDeps = defaultDeps): Promise<AgencySummary[]> {
  return memberAgencies(await deps.listWorkspaces(cleanActor(actor)));
}

function rpcFailure(error: { message?: string; code?: string }, fallback: string): never {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  if (detail.includes("access_denied") || detail.includes("verified_identity_required")) throw new WorkspaceAccessError();
  throw new WorkspaceStoreError(fallback);
}

/** The checklist for one agency the actor is a member of. Anyone else gets WorkspaceAccessError. */
export async function readAgencyOnboarding(
  inputActor: WorkspaceActor,
  agencyWorkspaceId: string,
  deps: AgencyOnboardingDeps = defaultDeps,
): Promise<AgencyOnboarding> {
  const actor = cleanActor(inputActor);
  if (!uuid.safeParse(agencyWorkspaceId).success) throw new WorkspaceAccessError();
  const agency = memberAgencies(await deps.listWorkspaces(actor)).find((item) => item.id === agencyWorkspaceId);
  if (!agency) throw new WorkspaceAccessError();
  const args = { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_agency_workspace_id: agency.id };

  const [verification, seats, members, pendingInvitations] = await Promise.all([
    deps.rpc("read_agency_verification", args),
    deps.rpc("read_agency_provider_seats", args),
    deps.countMembers(agency.id),
    agency.role === "owner" ? deps.countPendingInvitations(actor, agency.id) : Promise.resolve(null),
  ]);
  if (verification.error) rpcFailure(verification.error, "Agency verification is unavailable");
  if (seats.error) rpcFailure(seats.error, "Agency clients are unavailable");
  const state = verificationSchema.safeParse(verification.data);
  if (!state.success || state.data.agencyWorkspaceId !== agency.id) throw new WorkspaceStoreError("Agency verification is unavailable");
  const clients = seatsSchema.safeParse(seats.data ?? []);
  if (!clients.success) throw new WorkspaceStoreError("Agency clients are unavailable");

  const byEffect = new Map(state.data.effects.map((effect) => [effect.effect, effect]));
  return deriveAgencyOnboarding({
    agency,
    members,
    pendingInvitations,
    clients: new Set(clients.data.map((seat) => seat.customerWorkspaceId)).size,
    // Every effect is always listed; one the database did not return reads as unverified.
    effects: AGENCY_EFFECTS.map((effect) => {
      const row = byEffect.get(effect);
      return { effect, verified: row?.status === "verified", recordedAt: row?.recorded ? row.recordedAt : null };
    }),
  });
}
