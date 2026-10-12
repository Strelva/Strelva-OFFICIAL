/**
 * Signed "Try it" links for a Possibility (systems-experience spec behavior 19).
 *
 * An owner who never signs in opens the candidate from the morning email. The
 * token binds {workspace, possibility, candidate revision} and expires with
 * the Needs you link (14 days). A new candidate revision kills old links: the
 * preview read refuses any revision but the current one. Same signing as the
 * approve links (src/lib/approve-link.ts): base64url(JSON) + "." +
 * HMAC-SHA256, verified with a timing-safe compare, from the same secret
 * source, so nothing new is provisioned.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const POSSIBILITY_PREVIEW_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface PossibilityPreviewClaims {
  workspaceId: string;
  possibilityId: string;
  candidateRevision: number;
}

const payloadSchema = z.object({
  kind: z.literal("possibility_preview"),
  workspaceId: z.string().uuid(),
  possibilityId: z.string().uuid(),
  candidateRevision: z.number().int().positive(),
  exp: z.number().int().positive(),
}).strict();

function secret(): string {
  const value = process.env.APPROVE_LINK_SECRET || process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET;
  if (!value) throw new Error("Preview-link secret not configured");
  return value;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(`possibility-preview.${value}`).digest("base64url");
}

export function signPossibilityPreviewToken(claims: PossibilityPreviewClaims, now = Date.now()): string {
  const payload = payloadSchema.parse({ kind: "possibility_preview", ...claims, exp: now + POSSIBILITY_PREVIEW_TTL_MS });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** Claims, or null when tampered, expired, malformed or signed for something else. */
export function verifyPossibilityPreviewToken(token: string, now = Date.now()): PossibilityPreviewClaims | null {
  if (typeof token !== "string" || token.length > 1000) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(encoded));
  } catch {
    return null;
  }
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let parsed;
  try {
    parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  } catch {
    return null;
  }
  if (!parsed.success || parsed.data.exp <= now) return null;
  return { workspaceId: parsed.data.workspaceId, possibilityId: parsed.data.possibilityId, candidateRevision: parsed.data.candidateRevision };
}

/** Same-origin path for the email and the Needs you item. */
export function possibilityPreviewPath(claims: PossibilityPreviewClaims, now = Date.now()): string {
  return `/try/${signPossibilityPreviewToken(claims, now)}`;
}
