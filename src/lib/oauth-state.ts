import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type OAuthStatePayload = {
  tenantId: string;
  exp: number;
  nonce: string;
};

const STATE_TTL_MS = 10 * 60 * 1000;

function getOAuthStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("OAuth state secret not configured");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getOAuthStateSecret()).update(value).digest("base64url");
}

export function createOAuthState(tenantId: string, now = Date.now()): string {
  const payload: OAuthStatePayload = {
    tenantId,
    exp: now + STATE_TTL_MS,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyOAuthState(state: string, now = Date.now()): { tenantId: string } | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as Partial<OAuthStatePayload>;
    if (typeof payload.tenantId !== "string" || !payload.tenantId.trim()) return null;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return { tenantId: payload.tenantId };
  } catch {
    return null;
  }
}
