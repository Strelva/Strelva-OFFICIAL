import { workAuthorityRoute } from "@/platform/work-context/http";
import { readWorkContext, changeWorkContext } from "@/platform/work-context";
export const dynamic = "force-dynamic";
const route = workAuthorityRoute(readWorkContext, changeWorkContext);
export const GET = route.GET;
export const POST = route.POST;
