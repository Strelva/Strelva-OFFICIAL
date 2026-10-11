/** Email links suppress referrers. Native same-origin forms can consequently
 * send Origin: null; Fetch Metadata must prove same-origin in that case. */
export function isSameOriginBookingForm(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return site !== "cross-site" && (origin === new URL(request.url).origin || (origin === "null" && site === "same-origin"));
}
