import { getPortfolioActions } from "./portfolio-actions";
import { scanPortfolioOpportunities } from "./portfolio-opportunities";
import { PortfolioActionsClient } from "./PortfolioActionsClient";
import { PortfolioOpportunitiesClient } from "./PortfolioOpportunitiesClient";

export const dynamic = "force-dynamic";

/**
 * The operator's single "clear the whole portfolio" screen, two layers:
 *
 *  1. PROACTIVE — every client with latent, not-yet-drafted work (unreplied
 *     reviews, stale sites, slipping health). "Draft these" routes each through the
 *     governed draft path so drafts land PENDING, never auto-published.
 *  2. PENDING — every draft/approval already waiting, grouped by client, with
 *     approve-all — all through the governed `resolveEventAction` spine.
 *
 * Reads remain usable during a backend blip, but their snapshots carry explicit
 * incomplete source/tenant identity so the clients cannot claim the portfolio is
 * clear until the relevant coverage is verified. Super-admin is enforced by the
 * /admin layout (and re-checked inside each server action that performs a write).
 */
export default async function PortfolioActionsPage() {
  const [opportunities, snapshot] = await Promise.all([
    scanPortfolioOpportunities(),
    getPortfolioActions(),
  ]);
  return (
    <div className="space-y-8">
      <PortfolioOpportunitiesClient snapshot={opportunities} />
      <PortfolioActionsClient snapshot={snapshot} />
    </div>
  );
}
