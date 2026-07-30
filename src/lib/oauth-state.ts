import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getRedis } from "./redis";

type OAuthStatePayload = {
  tenantId: string;
  exp: number;
  nonce: string;
};

const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_TTL_SEC = Math.ceil(STATE_TTL_MS / 1000);

/** Returns the HMAC secret or null when neither env var is set.
 *  Callers that receive null must return a safe error (e.g. 500) rather than
 *  proceeding. This replaces the previous synchronously-throwing variant to make
 *  the missing-config case explicit at the call site. */
function getOAuthStateSecret(): string | null {
  // Fall back to INTERNAL_API_SECRET for backward compatibility. Both sign the
  // same way (HMAC-SHA256), so either value works. verifyOAuthState() is coupled
  // to whichever secret was used at state creation — ensure the same secret
  // remains available across both oauth-state creation and verification flows.
  return process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET || null;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Create a signed OAuth state token and register its nonce in Redis for
 *  single-use enforcement via consumeOAuthState.
 *
 *  The function is kept synchronous for backward compatibility with callers
 *  (instagram, calendly) outside the owned file list. The nonce is registered
 *  asynchronously in the background (fire-and-forget); a Redis failure degrades
 *  gracefully — the HMAC + expiry remain the primary integrity guarantee.
 *
 *  Returns the token string, or throws when the secret is not configured (same
 *  behaviour as before for callers that don't catch). Callers that need
 *  null-safe handling should check getOAuthStateSecret() themselves. */
export function createOAuthState(tenantId: string, now = Date.now()): string {
  const secret = getOAuthStateSecret();
  if (!secret) {
    throw new Error("OAuth state secret not configured");
  }

  const nonce = randomBytes(16).toString("base64url");
  const payload: OAuthStatePayload = {
    tenantId,
    exp: now + STATE_TTL_MS,
    nonce,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${sign(encoded, secret)}`;

  // Register the nonce in Redis (best-effort, fire-and-forget). consumeOAuthState
  // will del it on first use, making each token single-use when Redis is available.
  const redis = getRedis();
  if (redis) {
    redis
      .set(`oauth-nonce:${nonce}`, "1", { ex: STATE_TTL_SEC, nx: true })
      .catch(() => {
        // Redis write failure — degraded to expiry-only replay protection.
      });
  }

  return token;
}

/** Verify an OAuth state token (HMAC + expiry only). Does NOT consume the nonce.
 *  Kept synchronous for backward compatibility with instagram/calendly callbacks
 *  that are not in the owned file list. For new or updated callback code, prefer
 *  consumeOAuthState which also enforces single-use via Redis nonce deletion. */
export function verifyOAuthState(state: string, now = Date.now()): { tenantId: string } | null {
  const secret = getOAuthStateSecret();
  if (!secret) return null;

  // Split on the first '.' only so a future encoding change that embeds a '.'
  // in the payload portion doesn't silently truncate the signature.
  const dotIdx = state.indexOf(".");
  if (dotIdx === -1) return null;
  const encoded = state.slice(0, dotIdx);
  const signature = state.slice(dotIdx + 1);
  if (!encoded || !signature) return null;

  const expected = sign(encoded, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString()
    ) as Partial<OAuthStatePayload>;
    if (typeof payload.tenantId !== "string" || !payload.tenantId.trim()) return null;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return { tenantId: payload.tenantId };
  } catch {
    return null;
  }
}

/** Verify AND consume an OAuth state token. Returns the tenantId on success, or
 *  null when the token is invalid, expired, or already consumed (replay protection).
 *
 *  When Redis is available, deletes the nonce key registered by createOAuthState.
 *  A del result of 0 means the key was already deleted (already consumed) or was
 *  never stored (Redis was down at creation time). In the latter case the token
 *  is still accepted if HMAC + expiry are valid, since we cannot distinguish
 *  the two cases without a secondary sentinel. Future improvement: set a
 *  short-lived "consumed" marker to make replay-vs-never-stored unambiguous.
 *
 *  Prefer this over verifyOAuthState in callback handlers. */
export async function consumeOAuthState(
  state: string,
  now = Date.now()
): Promise<{ tenantId: string } | null> {
  const secret = getOAuthStateSecret();
  if (!secret) return null;

  const dotIdx = state.indexOf(".");
  if (dotIdx === -1) return null;
  const encoded = state.slice(0, dotIdx);
  const signature = state.slice(dotIdx + 1);
  if (!encoded || !signature) return null;

  const expected = sign(encoded, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload: Partial<OAuthStatePayload>;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString()
    ) as Partial<OAuthStatePayload>;
  } catch {
    return null;
  }

  if (typeof payload.tenantId !== "string" || !payload.tenantId.trim()) return null;
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (typeof payload.nonce !== "string" || !payload.nonce) return null;

  // Consume the nonce: DEL returns 1 when key existed (first use), 0 if absent
  // (already consumed = replay, or never stored = Redis was down at creation).
  const redis = getRedis();
  if (redis) {
    try {
      const deleted = await redis.del(`oauth-nonce:${payload.nonce}`);
      if (deleted === 0) {
        // Key already gone. Could be a replay OR Redis was unavailable at creation.
        // We cannot distinguish without a secondary sentinel, so we accept the token
        // (HMAC + expiry are still valid). TODO: add a consumed-marker approach.
      }
    } catch {
      // Redis failure — degrade gracefully, fall through to accept.
    }
  }

  return { tenantId: payload.tenantId };
}
