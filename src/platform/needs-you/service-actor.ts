/**
 * Strelva (system): the narrow service actor for work that runs when nobody
 * is signed in (product model rule 6). SQL in
 * supabase/migrations/20261009100000_strelva_service_actor.sql, made
 * agency-neutral by 20261009153000_platform_service_actor.sql.
 *
 * A session is per business and per purpose, lasts 30 minutes, and is logged
 * in `strelva_service_actions` as "Strelva (system)". It carries the member
 * identity the existing RPCs recheck (the business's verified owner, else
 * a verified direct admin, else a verified staff member on the provider's
 * seat), because those RPCs are the only read path. What it may do is
 * narrower than that identity:
 *
 * - `needs_you_sync`: read pending asks and open Needs you items. Never
 *   decide: the Needs you service never hands a session to a resolver, and
 *   deciding still needs the owner's signed link or session.
 * - `make_real_resume`: continue an activation the owner already approved.
 *   The owner stays approver of record; the approval is rechecked before
 *   every step.
 * - `make_real_link`: run ONE Make real plan the owner approved by signed
 *   email link when the owner has no account (owner-entry decision 6). Bound
 *   in SQL to that open decision and the owner recipient; it logs one `run`,
 *   and only after the link approved the decision
 *   (20261009131000_make_real_owner_link.sql).
 *
 * Only for a business whose provider of record is an agency verified for
 * the purpose's effect (needs_you_sync: email; Make real: publish), the same
 * rule for every agency, Strelva's included. The session names that
 * provider. Anything else gets no session.
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

export const STRELVA_SYSTEM_LABEL = "Strelva (system)" as const;
export type ServicePurpose = "needs_you_sync" | "make_real_resume" | "make_real_link";

export interface ServiceSession {
  kind: "strelva_system";
  label: typeof STRELVA_SYSTEM_LABEL;
  sessionId: string;
  workspaceId: string;
  purpose: ServicePurpose;
  /** Whose membership the existing RPCs recheck. Never a decider. */
  onBehalf: { role: "owner" | "admin" };
  actor: WorkspaceActor;
  /** The verified agency of record the platform acted for. */
  providerWorkspaceId?: string;
}

const sessionSchema = z.object({
  sessionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  purpose: z.enum(["needs_you_sync", "make_real_resume", "make_real_link"]),
  label: z.literal(STRELVA_SYSTEM_LABEL),
  role: z.enum(["owner", "admin"]),
  userId: z.string().uuid(),
  verifiedEmail: z.string().email(),
  providerWorkspaceId: z.string().uuid().optional(),
}).nullable();

export function parseServiceSession(data: unknown): ServiceSession | null {
  const parsed = sessionSchema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError("Strelva's service session could not be read. The response was malformed.");
  if (!parsed.data) return null;
  const row = parsed.data;
  return {
    kind: "strelva_system", label: STRELVA_SYSTEM_LABEL, sessionId: row.sessionId, workspaceId: row.workspaceId, purpose: row.purpose,
    onBehalf: { role: row.role }, actor: { userId: row.userId, verifiedEmail: row.verifiedEmail.toLowerCase() },
    ...(row.providerWorkspaceId ? { providerWorkspaceId: row.providerWorkspaceId } : {}),
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

/** Start a logged session for one business, or null when no verified provider serves it or nobody verified can be read as. */
export async function startServiceSession(workspaceId: string, purpose: Exclude<ServicePurpose, "make_real_link">): Promise<ServiceSession | null> {
  const { data, error } = await db().rpc("strelva_service_reader", { p_workspace_id: z.string().uuid().parse(workspaceId), p_purpose: purpose });
  if (error) throw new WorkspaceStoreError("Strelva's service session could not start.");
  const session = parseServiceSession(data);
  if (session && (session.workspaceId !== workspaceId || session.purpose !== purpose)) throw new WorkspaceStoreError("Strelva's service session was for another business.");
  return session;
}

const LINK_REFUSALS = ["owner_decision_recipient_not_owner", "strelva_service_owner_has_account", "strelva_service_access_denied"] as const;
/** The database refused a link session, for a reason the link page can name. */
export class ServiceSessionRefusedError extends WorkspaceStoreError {
  constructor(readonly code: (typeof LINK_REFUSALS)[number]) {
    super("Strelva's service session was refused.");
  }
}

/**
 * A `make_real_link` session for one open Make real decision, when the signed
 * link's recipient is the owner on record and has no account. Null when
 * Strelva doesn't run the business or it has no verified owner or admin to
 * read as. Refused (thrown) for anything else.
 */
export async function startMakeRealLinkSession(workspaceId: string, decisionId: string, recipient: string): Promise<ServiceSession | null> {
  const { data, error } = await db().rpc("strelva_make_real_link_session", {
    p_workspace_id: z.string().uuid().parse(workspaceId), p_decision_id: z.string().uuid().parse(decisionId), p_recipient: recipient,
  });
  if (error) {
    const code = LINK_REFUSALS.find((name) => error.message?.includes(name));
    if (code) throw new ServiceSessionRefusedError(code);
    throw new WorkspaceStoreError("Strelva's service session could not start.");
  }
  const session = parseServiceSession(data);
  if (session && (session.workspaceId !== workspaceId || session.purpose !== "make_real_link")) throw new WorkspaceStoreError("Strelva's service session was for another business.");
  return session;
}

/** Log one Make real step taken under a `make_real_resume` session, or the one run of a `make_real_link` session. */
export type ServiceAction = "resume" | "run" | "reconcile" | "rollback";
export async function recordServiceAction(session: ServiceSession, action: ServiceAction, subject: string, detail?: string): Promise<void> {
  const allowed = session.purpose === "make_real_resume" || (session.purpose === "make_real_link" && action === "run");
  if (!allowed) throw new WorkspaceStoreError("That session can't run Make real.");
  const { error } = await db().rpc("record_strelva_service_action", {
    p_workspace_id: session.workspaceId, p_session_id: session.sessionId, p_action: action, p_subject: subject.slice(0, 300), p_detail: detail ? detail.slice(0, 500) : null,
  });
  if (error) throw new WorkspaceStoreError("Strelva's action could not be logged, so it did not run.");
}
