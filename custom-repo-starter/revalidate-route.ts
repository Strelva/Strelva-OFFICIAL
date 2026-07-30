import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import * as crypto from "crypto";

const MAX_SIGNATURE_AGE_MS = 300_000;

// Exported so the platform's conformance fixture can prove real interop: a body
// the control plane signs (via `signRevalidationBody`) must verify here, in the
// client repo's revalidation endpoint. The receiving half of the wire contract.
export function verifySignature(body: string, secret: string, timestamp: string, signature: string): boolean {
  const ts = Number(timestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > MAX_SIGNATURE_AGE_MS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const provided = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

/** Allow only safe path/tag values: printable ASCII, no newlines or null bytes.
 *  A path must start with '/' and contain only non-whitespace safe chars.
 *  A tag is any non-empty string with only safe chars (printable, no whitespace). */
function isSafePath(s: string): boolean {
  return s.startsWith("/") && /^[\x20-\x7E]+$/.test(s) && !s.includes("\0");
}

function isSafeTag(s: string): boolean {
  return s.length > 0 && /^[\x21-\x7E]+$/.test(s) && !s.includes("\0");
}

function sanitizePaths(paths: string[]): string[] {
  return paths.filter(isSafePath);
}

function sanitizeTags(tags: string[]): string[] {
  return tags.filter(isSafeTag);
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATION_SECRET || process.env.REVALIDATE_SECRET;
  const tenantId = process.env.TENANT_ID;
  if (!secret || !tenantId) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const bodyText = await request.text();
  const signature = request.headers.get("x-reb-signature");
  const timestamp = request.headers.get("x-reb-timestamp");
  if (!signature || !timestamp || !verifySignature(bodyText, secret, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(bodyText) as {
    tenant?: unknown;
    paths?: unknown;
    tags?: unknown;
    all?: unknown;
  };

  if (payload.tenant !== tenantId) {
    return NextResponse.json({ success: true, ignored: true });
  }

  const rawPaths = payload.all === true ? ["/"] : stringList(payload.paths) ?? [];
  const rawTags = stringList(payload.tags) ?? [];
  const paths = sanitizePaths(rawPaths);
  const tags = sanitizeTags(rawTags);

  for (const path of paths) revalidatePath(path);
  for (const tag of tags) revalidateTag(tag, "default");

  return NextResponse.json({ success: true, paths, tags });
}
