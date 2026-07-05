import { getPortfolioActions } from "./portfolio-actions";
import { PortfolioActionsClient } from "./PortfolioActionsClient";

export const dynamic = "force-dynamic";

/**
 * The operator's single "clear the whole portfolio" screen: every pending
 * approval/draft across all clients, grouped by client, with approve-all and
 * approve-per-client — all routed through the governed `resolveEventAction`
 * spine. Super-admin is enforced by the /admin layout (and re-checked inside the
 * server action that performs the writes).
 */
export default async function PortfolioActionsPage() {
  const snapshot = await getPortfolioActions();
  return <PortfolioActionsClient snapshot={snapshot} />;
}
