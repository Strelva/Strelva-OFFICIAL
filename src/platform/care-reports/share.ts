import { createHash, randomBytes } from "node:crypto";

/**
 * Share-link tokens. Only the hash is stored, so a link cannot be read back:
 * the agency sees it once when it is made.
 */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function mintCareReportToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

/** The hash a stored link is looked up by, or null when the text cannot be a token. */
export function careReportTokenHash(token: string): string | null {
  return TOKEN.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

export function careReportShareUrl(origin: string, token: string): string {
  return `${origin}/care-reports/${token}`;
}

export function careReportWorkspaceUrl(origin: string, reportId: string, businessWorkspaceId: string, release?: number): string {
  const query = new URLSearchParams({ workspaceId: businessWorkspaceId });
  if (release) query.set("release", String(release));
  return `${origin}/workspace/care-reports/${reportId}?${query.toString()}`;
}

/** NEXT_PUBLIC_APP_URL, else the request origin, so a copied link is always absolute. */
export function requestOrigin(headers: Pick<Headers, "get">): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (configured) return configured;
  const host = headers.get("x-forwarded-host") || headers.get("host") || "";
  const proto = headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}
