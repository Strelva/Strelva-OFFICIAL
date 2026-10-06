import { getSupabase } from "@/lib/db/client";
import { readWorkspaceExportBuild, type V3Rpc } from "@/platform/workspace-exports/v3";

export const dynamic = "force-dynamic";

/** Downloads a finished export by its emailed link. The token is the only
 *  credential (the owner may never sign in); it expires after 7 days. */
export async function GET(request: Request) {
  if (process.env.STRELVA_EXPORT_SCHEMA_3 !== "1") return new Response("Not available.", { status: 503 });
  const url = new URL(request.url);
  const buildId = url.searchParams.get("build") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(buildId) || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    return new Response("This export link is not valid or has expired.", { status: 404 });
  }
  const client = getSupabase() as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> } | null;
  if (!client) return new Response("Export is unavailable.", { status: 503 });
  const rpc: V3Rpc = (name, args) => client.rpc(name, args);
  try {
    const body = await readWorkspaceExportBuild(buildId, token, rpc);
    return new Response(body, { status: 200, headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="business-export-${buildId.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    } });
  } catch {
    return new Response("This export link is not valid or has expired.", { status: 404 });
  }
}
