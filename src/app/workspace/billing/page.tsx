import { notFound, redirect } from "next/navigation";
import { BusinessBillingView } from "@/experience/workspace/BusinessBillingView";
import { businessBillingEnabled, readBusinessBilling } from "@/platform/business-billing";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { workspaceHttpActor } from "@/platform/workspaces/http";

export const dynamic = "force-dynamic";

/** Read-only billing home. No price, payment or Stripe mutation lives here. */
export default async function BusinessBillingPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  if (!workspaceReleaseEnabled() || !businessBillingEnabled()) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in?next=%2Fworkspace");
  const workspaceId = (await searchParams).workspaceId ?? "";
  let billing;
  try { billing = await readBusinessBilling(actor, workspaceId); }
  catch { return <BusinessBillingView workspaceId={workspaceId} billing={null} unavailable />; }
  return <BusinessBillingView workspaceId={workspaceId} billing={billing} />;
}
