import { redirect } from "next/navigation";
import { AccessReviewPage } from "@/experience/workspace/AccessReview";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
export const dynamic = "force-dynamic";
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  if (!workspaceReleaseEnabled()) redirect("/workspace");
  const workspaceId = (await searchParams).workspaceId;
  if (typeof workspaceId !== "string") redirect("/workspace?view=access");
  return <AccessReviewPage workspaceId={workspaceId} />;
}
