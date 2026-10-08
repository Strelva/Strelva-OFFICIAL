import { NextResponse } from "next/server";
import { z } from "zod";
import { brandRpc, logoDigest, validateBrand } from "@/platform/agency-brand/server";
export async function GET(_request: Request, { params }: { params: Promise<{ workspaceId: string; digest: string }> }) {
  const { workspaceId, digest } = await params;
  if (!z.string().uuid().safeParse(workspaceId).success || !/^[a-f0-9]{64}$/.test(digest)) return new NextResponse(null, { status: 404 });
  try {
    const row = await brandRpc("resolve_owner_brand", { p_workspace_id: workspaceId }) as { agencyId: string; brand: unknown } | null;
    if (!row || row.agencyId !== workspaceId || !row.brand) return new NextResponse(null, { status: 404 });
    const logo = validateBrand(row.brand).logo;
    if (!logo || logoDigest(logo) !== digest) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(logo.data, "base64")), { headers: { "Content-Type": logo.type, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return new NextResponse(null, { status: 503 }); }
}
