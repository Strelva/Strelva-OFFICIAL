import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { notFound, redirect } from "next/navigation";
import { XaHeadline, XaTextLink } from "@/components/ui/strelva/Xa";
import { MoneyLoadFailure } from "@/experience/workspace/money/MoneyLoadFailure";
import styles from "@/experience/workspace/money/money.module.css";
import { BusinessBillingView } from "@/experience/workspace/billing/BusinessBillingView";
import {
  businessBillingEnabled,
  readAgencyBilling,
  readBusinessBilling,
} from "@/platform/business-billing";
import { AgencyInvoiceAcceptance } from "@/experience/workspace/billing/AgencyInvoiceControls";
import { AgencyBillingView } from "@/experience/workspace/billing/AgencyBillingView";
import {
  BusinessAiBudgetSummary,
  StartWorkspacePlan,
  WorkspacePlanUnavailable,
} from "@/experience/workspace/billing/StartWorkspacePlan";
import { selfServeBillingConfig } from "@/platform/business-billing/workspace-checkout";
import { WorkspacePayerTransition } from "@/experience/workspace/WorkspacePayerTransition";
import { listWorkspaces } from "@/platform/workspaces";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { readBusinessAgencies } from "@/platform/agency-directory";
import { commandAgencyInvoice } from "@/platform/agency-billing";
import {
  readCheckoutAvailability,
  type CheckoutAvailability,
} from "@/platform/connect/checkout-availability";
import { AgencyCheckoutStatus } from "@/experience/workspace/billing/AgencyCheckoutStatus";
import { AgencyPayerRequests } from "@/experience/workspace/billing/AgencyPayerRequests";
import { aiControlsReleaseEnabled } from "@/platform/infra/ai-controls-release";
import {
  businessAiCapUsd,
  readBusinessAiBudget,
  type AiControlsState,
  type BusinessAiBudget,
} from "@/platform/infra/business-ai-budget";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { resolveOwnerBrand } from "@/platform/agency-brand/server";

export const dynamic = "force-dynamic";

/** Read-only billing home. No price, payment or Stripe mutation lives here. */
export default async function BusinessBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; invoiceId?: string }>;
}) {
  if (!workspaceReleaseEnabled() || !businessBillingEnabled()) notFound();
  const actor = await workspaceHttpActor();
  if (!actor) redirect("/sign-in?next=%2Fworkspace");
  const query = await searchParams;
  const workspaceId = query.workspaceId ?? "";
  const workspaces = await listWorkspaces(actor);
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (workspace?.kind === "agency") {
    const id = encodeURIComponent(workspaceId);
    const brand = await resolveOwnerBrand(workspaceId).catch(() => null);
    const agencyShell = (children: React.ReactNode) => (
      <StrelvaShell
        title=""
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        ownerBrand={brand ?? undefined}
        agencyNavigation={{}}
        detailsPlace="plan"
      >
        {children}
      </StrelvaShell>
    );
    let agency;
    try {
      agency = await readAgencyBilling(actor, workspaceId);
    } catch {
      return agencyShell(
        <div className={styles.screen}>
          <MoneyLoadFailure
            title="Agency billing did not load."
            quiet="Only an agency owner or admin can read its billing."
            retryHref={`/workspace/billing?workspaceId=${id}`}
          />
        </div>,
      );
    }
    const checkoutAvailability = await readCheckoutAvailability(workspaceId);
    return agencyShell(
      <div className={styles.screen}>
        <div className={styles.split}>
          <div className={styles.column}>
            {agency ? (
              <AgencyBillingView
                billing={agency}
                checkoutAvailability={checkoutAvailability}
              />
            ) : (
              <section
                className={styles.section}
                aria-labelledby="agency-billing-heading"
              >
                <XaHeadline
                  id="agency-billing-heading"
                  quiet="No client has your agency as payer yet."
                >
                  Agency billing
                </XaHeadline>
                <AgencyCheckoutStatus
                  availability={checkoutAvailability}
                  paymentsHref={`/workspace/payments?workspaceId=${id}`}
                />
              </section>
            )}
            <nav aria-label="More about agency money" className={styles.links}>
              <XaTextLink href={`/workspace/payment-links?workspaceId=${id}`}>
                Payment links
              </XaTextLink>
              {process.env.STRELVA_CONNECT === "1" ? (
                <>
                  <span aria-hidden="true">·</span>
                  <XaTextLink href={`/workspace/payments?workspaceId=${id}`}>
                    Agency payments
                  </XaTextLink>
                </>
              ) : null}
              {process.env.STRELVA_PROVIDER_CHANGE === "1" ? (
                <>
                  <span aria-hidden="true">·</span>
                  <XaTextLink
                    href={`/workspace/provider-change?workspaceId=${id}`}
                  >
                    Agency handoffs
                  </XaTextLink>
                </>
              ) : null}
              {process.env.STRELVA_REVENUE_SPLITS === "1" ? (
                <>
                  <span aria-hidden="true">·</span>
                  <XaTextLink
                    href={`/workspace/creator-maintenance?workspaceId=${id}`}
                  >
                    Creator maintenance
                  </XaTextLink>
                </>
              ) : null}
            </nav>
          </div>
          <aside
            className={styles.side}
            aria-label="Owners asking your agency to pay"
          >
            <AgencyPayerRequests agencyWorkspaceId={workspaceId} />
          </aside>
        </div>
      </div>,
    );
  }
  let billing;
  try {
    billing = await readBusinessBilling(actor, workspaceId);
  } catch {
    return (
      <StrelvaShell
        title=""
        workspaceId={workspaceId}
        active="settings"
        detailsPlace="plan"
        systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}
      >
        <div className={styles.screen}>
          <MoneyLoadFailure
            title="Billing could not be loaded."
            quiet="Your sites and inquiries keep running. Confirm your access and try again."
            retryHref={`/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}`}
          />
        </div>
      </StrelvaShell>
    );
  }
  // The service-role budget read needs an authorized customer member first.
  const customerMember =
    workspace?.kind === "customer" && workspace.access === "member";
  const canManage = customerMember && workspace.role === "owner";
  let budget: (BusinessAiBudget & { controls?: AiControlsState }) | null = null;
  let capUsd: number | null = null;
  if (customerMember) {
    try {
      budget = await readBusinessAiBudget(workspaceId);
      if (budget) capUsd = businessAiCapUsd(budget);
    } catch {
      budget = null;
      capUsd = null;
    }
  }
  const budgetEnforced = process.env.STRELVA_BUSINESS_AI_BUDGET === "1";
  // Business budget v2 is also read for the list-price ceiling alone; its controls show only with their own release.
  const controlsOn = aiControlsReleaseEnabled();
  const needsPlan =
    (!billing || billing.state === "none") &&
    canManage &&
    budget !== null &&
    !budget.subscribed;
  const showStartPlan = needsPlan && selfServeBillingConfig().enabled;
  let agencyChoices: { id: string; name: string }[] = [];
  let agencyChoicesError = "";
  if (workspace?.role === "owner") {
    try {
      const servingAgencies = await readBusinessAgencies(actor, workspaceId);
      agencyChoices = servingAgencies
        .filter(
          (item) =>
            item.seat ||
            item.ofRecord ||
            item.scopes.some((scope) => scope.status === "active"),
        )
        .map((item) => ({ id: item.agencyWorkspaceId, name: item.name }));
    } catch {
      agencyChoicesError =
        "Serving agencies could not be loaded. Reload before proposing an agency payer.";
    }
  }
  let invoiceCheckoutAvailability: CheckoutAvailability = {
    status: "coming_soon",
  };
  if (query.invoiceId && process.env.STRELVA_CONNECT === "1") {
    try {
      // Authorize the exact invoice before reading its agency's merchant state.
      const invoice = await commandAgencyInvoice(actor, {
        action: "read",
        intentId: query.invoiceId,
      });
      invoiceCheckoutAvailability =
        invoice.business_workspace_id === workspaceId
          ? await readCheckoutAvailability(invoice.agency_workspace_id)
          : { status: "unavailable" };
    } catch {
      invoiceCheckoutAvailability = { status: "unavailable" };
    }
  }
  const id = encodeURIComponent(workspaceId);
  const splits = process.env.STRELVA_REVENUE_SPLITS === "1",
    connect = process.env.STRELVA_CONNECT === "1",
    handoff = process.env.STRELVA_PROVIDER_CHANGE === "1";
  return (
    <StrelvaShell
      title=""
      workspaceId={workspaceId}
      businessContext={workspace?.name}
      active="settings"
      detailsPlace="plan"
      systemsReleased={process.env.STRELVA_SYSTEMS_RELEASE === "1"}
    >
      <div className={styles.screen}>
        <div className={query.invoiceId ? styles.split : styles.column}>
          <div className={styles.column}>
            <BusinessBillingView
              workspaceId={workspaceId}
              canManage={canManage}
              billing={billing}
              businessName={workspace?.name}
              backHref={`/workspace/business-details?workspaceId=${id}`}
            />
            {showStartPlan ? (
              <StartWorkspacePlan
                workspaceId={workspaceId}
                budget={budget}
                capUsd={capUsd}
                budgetEnforced={budgetEnforced}
                controls={controlsOn ? (budget?.controls ?? null) : null}
              />
            ) : customerMember ? (
              <BusinessAiBudgetSummary
                budget={budget}
                capUsd={capUsd}
                enforced={budgetEnforced}
                controls={controlsOn ? (budget?.controls ?? null) : null}
              />
            ) : null}
            {needsPlan && !showStartPlan ? (
              <WorkspacePlanUnavailable workspaceId={workspaceId} />
            ) : null}
            <WorkspacePayerTransition
              key={workspaceId}
              workspaceId={workspaceId}
              canPropose={workspace?.role === "owner"}
              agencyChoices={agencyChoices}
              agencyChoicesError={agencyChoicesError}
              providerChangeEnabled={handoff}
            />
            {splits || connect || handoff ? (
              <nav
                aria-label="Payment and agency settings"
                className={styles.links}
              >
                {connect ? (
                  <XaTextLink href={`/workspace/payments?workspaceId=${id}`}>
                    Deposits and payments
                  </XaTextLink>
                ) : null}
                {splits ? (
                  <>
                    {connect ? <span aria-hidden="true">·</span> : null}
                    <XaTextLink
                      href={`/workspace/money-terms?workspaceId=${id}`}
                    >
                      Recorded money terms
                    </XaTextLink>
                    <span aria-hidden="true">·</span>
                    <XaTextLink
                      href={`/workspace/creator-maintenance?workspaceId=${id}`}
                    >
                      Creator maintenance
                    </XaTextLink>
                  </>
                ) : null}
                {handoff ? (
                  <>
                    {connect || splits ? (
                      <span aria-hidden="true">·</span>
                    ) : null}
                    <XaTextLink
                      href={`/workspace/provider-change?workspaceId=${id}`}
                    >
                      Agency handoff
                    </XaTextLink>
                  </>
                ) : null}
              </nav>
            ) : null}
          </div>
          {query.invoiceId ? (
            <aside
              className={styles.side}
              aria-label="A price from your agency"
            >
              <AgencyInvoiceAcceptance
                invoiceId={query.invoiceId}
                checkoutAvailability={invoiceCheckoutAvailability}
              />
            </aside>
          ) : null}
        </div>
      </div>
    </StrelvaShell>
  );
}
