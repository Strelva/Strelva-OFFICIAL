import { getRedis } from "./redis";
import type { ClientRole } from "./auth";
import { createInvite as createInvitePg } from "./db/repositories";

const INVITE_PREFIX = "reb:invites:";
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface PendingInvite {
  tenant: string;
  role?: ClientRole;
  invitedAt: string;
  invitedBy?: string;
}

export class InviteStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InviteStorageError";
  }
}

export async function createInvite(
  email: string,
  tenant: string,
  invitedBy?: string,
  role: ClientRole = "owner"
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    throw new InviteStorageError("Redis is not configured for invite storage");
  }

  const key = `${INVITE_PREFIX}${email.toLowerCase()}`;
  const invite: PendingInvite = {
    tenant,
    role,
    invitedAt: new Date().toISOString(),
    invitedBy,
  };

  const result: unknown = await redis.set(key, invite, { ex: INVITE_TTL_SECONDS });
  if (result === null || result === undefined || result === false) {
    throw new InviteStorageError(`Redis did not confirm invite storage for ${email}`);
  }

  // Also write the invite to Postgres. This is LOAD-BEARING on the Supabase auth
  // path: the handle_new_user trigger + claimPendingInviteForCurrentUser grant
  // access by reading the Postgres `invites` table. A failure must reach the
  // operator rather than producing an invite that cannot grant client access.
  await createInvitePg({
    email: email.toLowerCase(),
    tenant_id: tenant,
    role,
    // invited_by is a users(id) uuid FK; the Redis invitedBy is an email/string,
    // so leave it null rather than break the FK. expires_at defaults to +30d.
  });

  return true;
}

export async function getInvite(email: string): Promise<PendingInvite | null> {
  const redis = getRedis();
  if (!redis) return null;

  const key = `${INVITE_PREFIX}${email.toLowerCase()}`;
  return redis.get<PendingInvite>(key);
}

export async function consumeInvite(email: string): Promise<PendingInvite | null> {
  const redis = getRedis();
  if (!redis) return null;

  const key = `${INVITE_PREFIX}${email.toLowerCase()}`;
  const invite = await redis.get<PendingInvite>(key);
  if (invite) {
    await redis.del(key);
  }
  return invite;
}
