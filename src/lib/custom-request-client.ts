/**
 * Outbound custom-change request to a client's custom repo.
 *
 * The agent (and, in future, any other surface) hands off "build me a cart /
 * rewards / checkout" features to the client's deployed repo via this POST. The
 * target URL is derived from tenant config (productionUrl + manifest endpoint),
 * so it is an SSRF sink — the URL-safety check is baked INTO the call here so a
 * caller can't forget the guard (the audit flagged this sink in #59). Auth is a
 * shared bearer secret (SCAFFOLD_CUSTOM_REQUEST_SECRET, legacy REB_* fallback);
 * the receiving repo verifies it.
 */

import { isSafeFetchUrl } from "./safe-fetch";

export interface CustomChangeRequestInput {
  url: string;
  secret: string;
  feature: string;
  summary: string;
  requestedBy?: string;
}

export type CustomChangeRequestResult =
  | { ok: true; status: number }
  | { ok: false; reason: "unsafe_url" }
  | { ok: false; reason: "http_error"; status: number }
  | { ok: false; reason: "network_error"; error: string };

export async function postCustomChangeRequest(
  input: CustomChangeRequestInput
): Promise<CustomChangeRequestResult> {
  // https-only, no private/loopback/link-local/metadata targets, no data:.
  if (!isSafeFetchUrl(input.url)) {
    return { ok: false, reason: "unsafe_url" };
  }
  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.secret}`,
      },
      body: JSON.stringify({
        feature: input.feature,
        summary: input.summary,
        requestedBy: input.requestedBy ?? "Strelva AI agent",
      }),
    });
    if (!response.ok) {
      return { ok: false, reason: "http_error", status: response.status };
    }
    return { ok: true, status: response.status };
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
