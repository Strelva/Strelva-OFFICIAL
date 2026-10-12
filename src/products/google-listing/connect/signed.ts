import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Short-lived signed payloads for the L4 Google flows (state and the
 * chosen-listing list). Same secret as native Google OAuth; each purpose
 * signs under its own prefix so one can never stand in for another. */
export type SignedPurpose = "google-discover-state-v1" | "google-discover-choices-v1" | "google-read-grant-state-v1";
function secret() { const value = process.env.OAUTH_STATE_SECRET; if (!value) throw new Error("Google sign-in signing is unavailable."); return value; }
export const hashValue = (value: string) => createHash("sha256").update(value).digest("hex");
export const newNonce = () => randomBytes(32).toString("base64url");

export function signPayload(purpose: SignedPurpose, payload: Record<string, unknown>, ttlMs: number, now = Date.now()): string {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: now + ttlMs })).toString("base64url");
  return `${data}.${createHmac("sha256", secret()).update(`${purpose}:${data}`).digest("base64url")}`;
}
export function verifyPayload<T extends z.ZodTypeAny>(purpose: SignedPurpose, token: string, schema: T, now = Date.now()): z.infer<T> | null {
  try {
    if (!token || token.length > 16384) return null;
    const [data, signature, extra] = token.split(".");
    if (!data || !signature || extra) return null;
    const expected = Buffer.from(createHmac("sha256", secret()).update(`${purpose}:${data}`).digest("base64url")), actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const raw = JSON.parse(Buffer.from(data, "base64url").toString()) as { exp?: unknown };
    if (typeof raw.exp !== "number" || raw.exp <= now || raw.exp > now + 3_600_000) return null;
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/** The workspace a signed state names, for routing a person back after a
 * failed or cancelled sign-in. Not verified: never use it for authority. */
export function stateWorkspaceHint(state: string | null): string | null {
  try {
    const data = (state ?? "").split(".")[0];
    const parsed = JSON.parse(Buffer.from(data ?? "", "base64url").toString()) as { workspaceId?: unknown };
    return typeof parsed.workspaceId === "string" && z.string().uuid().safeParse(parsed.workspaceId).success ? parsed.workspaceId : null;
  } catch { return null; }
}
