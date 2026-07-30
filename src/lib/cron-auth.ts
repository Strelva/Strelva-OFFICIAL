import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export type CronAuthResult =
  | { allowed: true; status: 200; message: "OK" }
  | {
      allowed: false;
      status: 401 | 500;
      message: "Unauthorized" | "CRON_SECRET not configured";
    };

/** Pure policy shared by the proxy and route handlers. Missing configuration fails closed. */
export function validateCronRequest(
  expectedSecret: string | undefined,
  authorization: string | null
): CronAuthResult {
  if (!expectedSecret) {
    return { allowed: false, status: 500, message: "CRON_SECRET not configured" };
  }

  const expected = `Bearer ${expectedSecret}`;
  const provided = authorization ?? "";
  // Timing-safe compare prevents secret-length leakage via timing attacks.
  // Both buffers must be the same byte length for timingSafeEqual to work, so
  // we compare lengths first (that check leaks only whether the lengths match,
  // not the secret value itself).
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (
    expectedBuf.length === providedBuf.length &&
    timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return { allowed: true, status: 200, message: "OK" };
  }

  return { allowed: false, status: 401, message: "Unauthorized" };
}

/** Defense in depth for cron handlers if proxy matching or routing changes. */
export function requireCronRequest(request: Request): NextResponse | null {
  const result = validateCronRequest(
    process.env.CRON_SECRET,
    request.headers.get("authorization")
  );
  if (result.allowed) return null;

  if (result.status === 500) {
    console.error("[cron] CRON_SECRET env var not set - blocking cron handler");
  }
  return NextResponse.json({ error: result.message }, { status: result.status });
}
