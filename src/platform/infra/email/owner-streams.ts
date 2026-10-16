/**
 * Owner email streams (switch-on, October 16, 2026).
 *
 * Client email stays globally off (EMAIL_SENDING_ENABLED unset). Jacob chose
 * to turn on exactly two kinds of owner mail: the owner claim (an agency's
 * claim link, or an operator's owner invitation) and Needs you (a decision
 * waits on the owner). Each kind is a named stream that opens the client gate
 * for itself only, and every stream send carries three guarantees, checked in
 * the transport so no caller can skip them:
 *
 *   1. Confirmed recipient. The address must be confirmed for that business in
 *      data (public.owner_email_confirmed, 20261028120000): an operator's
 *      recorded confirmation, or the business's own signed-in owner. An address
 *      that is merely on file (a site's contact email, a converted tenant's
 *      owner_email) is never enough.
 *   2. No backfill. STRELVA_OWNER_EMAIL_SINCE is the switch time. Anything that
 *      happened before it (a decision opened, a claim issued) is never mailed,
 *      so the first enable cannot blast what already waits. Unset or malformed:
 *      no stream mail at all.
 *   3. A log line for every attempt, accepted or held, with the stream, the
 *      business and a hash of the recipient (never the address itself).
 *
 * The per-tenant `reb:client-email:{tenant}` override still applies: "off"
 * silences a business's stream mail like any other client mail (send.ts).
 *
 * `STRELVA_OWNER_EMAIL_STREAMS` is a comma list. Known streams:
 *   owner_claim          claim links and owner invitations
 *   needs_you            the urgent notice and the 07:00 morning email
 *   needs_you_reminders  the day 3 and day 7 reminders (kept off at switch-on)
 * Anything else in the list is ignored, so a typo turns nothing on.
 */
import { createHash } from "node:crypto";
import { getSupabase } from "@/platform/infra/db/client";

export const OWNER_EMAIL_STREAMS = ["owner_claim", "needs_you", "needs_you_reminders"] as const;
export type OwnerEmailStream = (typeof OWNER_EMAIL_STREAMS)[number];

/** What a stream send declares about itself. */
export interface OwnerStreamSend {
  stream: OwnerEmailStream;
  /** The business the recipient owns. Confirmation is per business. */
  workspaceId: string;
  /** When the thing being mailed happened (decision opened, claim issued). For a
   * digest, the earliest of its items. */
  eventAt: string;
}

type Env = Partial<Record<string, string | undefined>>;

export function ownerEmailStreamOn(stream: OwnerEmailStream, env: Env = process.env): boolean {
  const listed = (env.STRELVA_OWNER_EMAIL_STREAMS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  return listed.includes(stream);
}

/** The switch time in ms, or null when unset or unreadable (then nothing is sent). */
export function ownerEmailSince(env: Env = process.env): number | null {
  const raw = env.STRELVA_OWNER_EMAIL_SINCE?.trim();
  // An explicit ISO instant with a zone, so a bare date never means "local midnight somewhere".
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? at : null;
}

type ConfirmationDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
let confirmationDb: ConfirmationDb | null = null;
/** Tests may supply their own client. */
export function setOwnerEmailConfirmationDb(db: ConfirmationDb | null): void {
  confirmationDb = db;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only when the data says this address is confirmed for this business. Fails closed. */
export async function ownerEmailConfirmed(workspaceId: string, email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  if (!UUID.test(workspaceId) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return false;
  try {
    const client = confirmationDb ?? (getSupabase() as unknown as ConfirmationDb | null);
    if (!client) return false;
    const { data, error } = await client.rpc("owner_email_confirmed", { p_workspace_id: workspaceId, p_email: address });
    if (error) return false;
    return (Array.isArray(data) ? data[0] : data) === true;
  } catch {
    return false;
  }
}

/** A short, stable recipient fingerprint for logs. Never the address. */
export function recipientFingerprint(to: string | string[]): string {
  const list = (Array.isArray(to) ? to : [to]).map(value => value.trim().toLowerCase()).sort().join(",");
  return createHash("sha256").update(list).digest("hex").slice(0, 12);
}

export type OwnerStreamHold =
  | "owner_stream_recipient_count"
  | "owner_stream_scope_mismatch"
  | "owner_email_since_unset"
  | "owner_email_before_switch"
  | "owner_email_unconfirmed";

/**
 * Why this stream send must not go out, or null when it may. The stream switch
 * itself is part of the audience gate (send.ts); these rules hold whichever
 * gate let the send through.
 */
export async function ownerStreamHold(
  send: OwnerStreamSend,
  input: { to: string | string[]; workspaceId?: string },
  env: Env = process.env,
): Promise<OwnerStreamHold | null> {
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  if (recipients.length !== 1) return "owner_stream_recipient_count";
  if (input.workspaceId && input.workspaceId !== send.workspaceId) return "owner_stream_scope_mismatch";
  const since = ownerEmailSince(env);
  if (since === null) return "owner_email_since_unset";
  const eventAt = Date.parse(send.eventAt);
  if (!Number.isFinite(eventAt) || eventAt < since) return "owner_email_before_switch";
  if (!(await ownerEmailConfirmed(send.workspaceId, recipients[0]!))) return "owner_email_unconfirmed";
  return null;
}

/** One line per stream attempt. The address and subject never appear. */
export function logOwnerStream(send: OwnerStreamSend, to: string | string[], outcome: { status: "accepted"; providerMessageId: string } | { status: "suppressed" | "failed"; reason: string }): void {
  const line = `[email] owner-stream ${send.stream} ${outcome.status} workspace=${send.workspaceId} recipient=${recipientFingerprint(to)} ${outcome.status === "accepted" ? `message=${outcome.providerMessageId}` : `reason=${outcome.reason}`}`;
  if (outcome.status === "accepted") console.info(line);
  else console.warn(line);
}
