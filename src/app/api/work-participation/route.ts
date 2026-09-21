import { workAuthorityRoute } from "@/platform/work-context/http";
import { inspectWorkParticipation, changeWorkParticipation, readContributionTarget } from "@/platform/work-participation";
export const dynamic = "force-dynamic";
const route = workAuthorityRoute((actor, workId, url) => url.searchParams.get("view") === "target" ? readContributionTarget(actor, workId) : inspectWorkParticipation(actor, workId), changeWorkParticipation);
export const GET = route.GET;
export const POST = route.POST;
