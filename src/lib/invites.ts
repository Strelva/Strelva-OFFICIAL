import { getRedis } from "./redis";

const INVITE_PREFIX = "reb:invites:";
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface PendingInvite {
  tenant: string;
  invitedAt: string;
  invitedBy?: string;
}

export async function createInvite(
  email: string,
  tenant: string,
  invitedBy?: string
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const key = `${INVITE_PREFIX}${email.toLowerCase()}`;
  const invite: PendingInvite = {
    tenant,
    invitedAt: new Date().toISOString(),
    invitedBy,
  };

  await redis.set(key, invite, { ex: INVITE_TTL_SECONDS });
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
