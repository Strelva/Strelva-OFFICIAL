import { customersReleaseEnabled } from "@/platform/customers/release";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { sha256 } from "@/platform/business-record/tenant-import";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { readWorkspaceBody, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { HomeFinderAdapterError } from "@/products/home-finder/types";
import { homeFinderInquirySchema, homeFinderSearchSchema } from "@/products/home-finder/runtime-contracts";
import { readHomeFinderReceipt, searchHomeFinder, submitHomeFinder } from "@/products/home-finder/runtime-server";
import { requireHomeFinderEntry } from "@/products/home-finder/entry";
export const dynamic = "force-dynamic";
const enabled = () => customersReleaseEnabled() && workspaceReleaseEnabled();
const fail = (error: unknown) => error instanceof HomeFinderAdapterError ? workspaceJson({ error: error.message, code: error.code }, error.status) : workspaceHttpFailure(error);
type Context = { params: Promise<{ bindingId: string }> };
async function limited(request: Request) { return isRateLimitedWindowedAsync(`home-finder-public:${sha256(request.headers.get("x-forwarded-for") ?? "unknown")}`, 60, 60_000); }
export async function GET(request: Request, context: Context) {
  if (!enabled()) return workspaceJson({ error: "Home Finder is unavailable." }, 503);
  try {
    if (await limited(request)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const { bindingId } = await context.params, params = new URL(request.url).searchParams;
    if (params.has("receipt")) return workspaceJson(await readHomeFinderReceipt(bindingId, params.get("submissionId") ?? "", params.get("receipt") ?? ""));
    const entry = request.headers.get("x-home-finder-entry") ?? "";
    if (params.get("renew") === "1") return workspaceJson({ token: await requireHomeFinderEntry(entry, bindingId, true) });
    await requireHomeFinderEntry(entry, bindingId);
    const raw: Record<string, unknown> = {};
    for (const key of ["q", "city"]) if (params.has(key)) raw[key] = params.get(key);
    for (const key of ["minPrice", "maxPrice", "minBeds", "minBaths", "limit"]) if (params.has(key)) raw[key] = Number(params.get(key));
    return workspaceJson(await searchHomeFinder(bindingId, homeFinderSearchSchema.parse(raw)));
  } catch (error) { return fail(error); }
}
export async function POST(request: Request, context: Context) {
  if (!enabled()) return workspaceJson({ error: "Home Finder is unavailable." }, 503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    if (await limited(request)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    await requireHomeFinderEntry(request.headers.get("x-home-finder-entry") ?? "", (await context.params).bindingId);
    const input = homeFinderInquirySchema.parse(await readWorkspaceBody(request, 12000));
    const result = await submitHomeFinder((await context.params).bindingId, input);
    return workspaceJson(result, result.status === "pending" ? 202 : result.status === "unavailable" ? 503 : 200);
  } catch (error) { return fail(error); }
}
