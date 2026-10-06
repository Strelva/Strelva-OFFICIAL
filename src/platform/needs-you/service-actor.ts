/**
 * Strelva (system): the narrow service actor for work that runs when nobody
 * is signed in (product model rule 6). SQL in
 * supabase/migrations/20261009100000_strelva_service_actor.sql.
 *
 * A session is per business and per purpose, lasts 30 minutes, and is logged
 * in `strelva_service_actions` as "Strelva (system)". It carries the member
 * identity the existing RPCs recheck (the business's verified owner, else
 * its verified admin, which on a converted business is the Strelva
 * operator), because those RPCs are the only read path. What it may do is
 * narrower than that identity:
 *
 * - `needs_you_sync`: read pending asks and open Needs you items. Never
 *   decide: the Needs you service never hands a session to a resolver, and
 *   deciding still needs the owner's signed link or session.
 * - `make_real_resume`: continue an activation the owner already approved.
 *   The owner stays approver of record; the approval is rechecked before
 *   every step.
 *
 * Only for a business Strelva runs (converted, or provided by Strelva's
 * agency). Anything else gets no session.
 */
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

export const STRELVA_SYSTEM_LABEL = "Strelva (system)" as const;
export type ServicePurpose = "needs_you_sync" | "make_real_resume";

export interface ServiceSession {
  kind: "strelva_system";
  label: typeof STRELVA_SYSTEM_LABEL;
  sessionId: string;
  workspaceId: string;
  purpose: ServicePurpose;
  /** Whose membership the existing RPCs recheck. Never a decider. */
  onBehalf: { role: "owner" | "admin" };
  actor: WorkspaceActor;
}

const sessionSchema = z.object({
  sessionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  purpose: z.enum(["needs_you_sync", "make_real_resume"]),
  label: z.literal(STRELVA_SYSTEM_LABEL),
  role: z.enum(["owner", "admin"]),
  userId: z.string().uuid(),
  verifiedEmail: z.string().email(),
}).nullable();

export function parseServiceSession(data: unknown): ServiceSession | null {
  const parsed = sessionSchema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("Strelva's service session could not be read. The response was malformed.");
  if (!parsed.data) return null;
  const row = parsed.data;
  return {
    kind: "strelva_system", label: STRELVA_SYSTEM_LABEL, sessionId: row.sessionId, workspaceId: row.workspaceId, purpose: row.purpose,
    onBehalf: { role: row.role }, actor: { userId: row.userId, verifiedEmail: row.verifiedEmail.toLowerCase() },
  };
}

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
let override: Rpc | null = null;
/** Tests replace the database. */
export function setServiceActorDb(client: Rpc | null): void { override = client; }
function db(): Rpc {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Strelva's service actor is unavailable.");
  return client as unknown as Rpc;
}

/** Start a logged session for one business, or null when Strelva doesn't run it or it has no verified owner or admin. */
export async function startServiceSession(workspaceId: string, purpose: ServicePurpose): Promise<ServiceSession | null> {
  const { data, error } = await db().rpc("strelva_service_reader", { p_workspace_id: z.string().uuid().parse(workspaceId), p_purpose: purpose });
  if (error) throw new WorkspaceStoreError("Strelva's service session could not start.");
  const session = parseServiceSession(data);
  if (session && (session.workspaceId !== workspaceId || session.purpose !== purpose)) throw new WorkspaceStoreError("Strelva's service session was for another business.");
  return session;
}

/** Log one Make real step taken under a `make_real_resume` session. */
export type ServiceAction = "resume" | "run" | "reconcile" | "rollback";
export async function recordServiceAction(session: ServiceSession, action: ServiceAction, subject: string, detail?: string): Promise<void> {
  if (session.purpose !== "make_real_resume") throw new WorkspaceStoreError("That session can't run Make real.");
  const { error } = await db().rpc("record_strelva_service_action", {
    p_workspace_id: session.workspaceId, p_session_id: session.sessionId, p_action: action, p_subject: subject.slice(0, 300), p_detail: detail ? detail.slice(0, 500) : null,
  });
  if (error) throw new WorkspaceStoreError("Strelva's action could not be logged, so it did not run.");
}
