/**
 * Where to send the owner after Connect Google, when another step (the claim
 * review) sent them here. Only a same-origin relative path is honored:
 * starts with one "/", no scheme, host, backslash or control character, not
 * an API route, at most 512 characters. Anything else is ignored.
 */
export const GOOGLE_RETURN_COOKIE = "strelva_google_return";
export function safeReturnTo(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw, "https://return.invalid");
    if (url.origin !== "https://return.invalid" || url.pathname.startsWith("/api/") || url.pathname.startsWith("//")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
/** returnTo with the connect outcome added, so the calling step can show it. */
export function withGoogleOutcome(returnTo: string, outcome: Record<string, string>): string {
  const url = new URL(returnTo, "https://return.invalid");
  for (const [key, value] of Object.entries(outcome)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}
