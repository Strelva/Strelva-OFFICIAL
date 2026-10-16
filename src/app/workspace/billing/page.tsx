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
import { readPlanWaitlist } from "@/platform/business-billing/plan-waitlist";
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
import {
  AgencyPayerRequestLines,
  AgencyPayerRequests,
} from "@/experience/workspace/billing/AgencyPayerRequests";
import { AgencyBillingPebble } from "@/experience/workspace/billing/AgencyBillingPebble";
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

/** Plan and usage. No price figure, payment or Stripe mutation lives here (October 16 money decision). */
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
            title="Your agency's billing couldn't be read just now."
            quiet="Only an owner or admin of the agency can open it."
            retryHref={`/workspace/billing?workspaceId=${id}`}
          />
        </div>,
      );
    }
    const checkoutAvailability = await readCheckoutAvailability(workspaceId);
    return agencyShell(
      <AgencyPayerRequests
        agencyWorkspaceId={workspaceId}
        agencyName={workspace.name}
      >
        <div className={styles.screen}>
          <div className={styles.split} data-phone="main-first">
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
                    quiet="When an owner asks, it waits here for your answer."
                  >
                    No client has asked {workspace.name} to cover Strelva yet.
                  </XaHeadline>
                  <AgencyCheckoutStatus
                    availability={checkoutAvailability}
                    paymentsHref={`/workspace/payments?workspaceId=${id}`}
                  />
                  <ul
                    className={styles.clientList}
                    aria-label="Owners asking your agency to pay"
                  >
                    <AgencyPayerRequestLines listed={[]} />
                  </ul>
                </section>
              )}
              <nav
                aria-label="More about agency money"
                className={styles.links}
              >
                <XaTextLink href={`/workspace/payment-links?workspaceId=${id}`}>
                  Payment links
                </XaTextLink>
                {process.env.STRELVA_CONNECT === "1" ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <XaTextLink href={`/workspace/payments?workspaceId=${id}`}>
                      Payments from your clients
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
                      Apps you made for others
                    </XaTextLink>
                  </>
                ) : null}
              </nav>
            </div>
            {agency ? (
              <aside
                className={styles.side}
                aria-label="What Pebble is waiting on"
              >
                <AgencyBillingPebble billing={agency} />
              </aside>
            ) : null}
          </div>
        </div>
      </AgencyPayerRequests>,
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
            title="Plan and usage couldn't be read just now."
            quiet="Your website and inquiries keep running. Try again in a moment."
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
  // Plans aren't open (October 16): the honest waitlist replaces the plan section.
  const waitlist = needsPlan && !showStartPlan;
  const joined = waitlist
    ? await readPlanWaitlist(workspaceId).catch(() => null)
    : null;
  let agencyChoices: { id: string; name: string }[] = [];
  let agencyChoicesError = "";
  const agencyNames: Record<string, string> = {};
  if (billing?.payerParty?.kind === "agency" && billing.payerParty.name)
    agencyNames[billing.payerParty.workspaceId] = billing.payerParty.name;
  if (workspace?.role === "owner") {
    try {
      const servingAgencies = await readBusinessAgencies(actor, workspaceId);
      for (const item of servingAgencies)
        agencyNames[item.agencyWorkspaceId] = item.name;
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
        "Your agencies couldn't be read just now. Reload before asking one to pay.";
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
            {waitlist ? (
              <WorkspacePlanUnavailable
                workspaceId={workspaceId}
                businessName={workspace?.name ?? "This business"}
                joinedEmail={joined?.email ?? null}
                noIncludedWork={capUsd === 0}
                agencyHref={`/workspace?view=help&workspaceId=${id}`}
                canJoin={canManage}
                primary={!query.invoiceId}
              />
            ) : (
              <BusinessBillingView
                workspaceId={workspaceId}
                canManage={canManage}
                billing={billing}
                businessName={workspace?.name}
                backHref={`/workspace/business-details?workspaceId=${id}`}
              />
            )}
            {showStartPlan ? (
              <StartWorkspacePlan
                primary={!query.invoiceId}
                workspaceId={workspaceId}
                budget={budget}
                capUsd={capUsd}
                budgetEnforced={budgetEnforced}
                controls={controlsOn ? (budget?.controls ?? null) : null}
              />
            ) : customerMember && !(waitlist && capUsd === 0) ? (
              <BusinessAiBudgetSummary
                budget={budget}
                capUsd={capUsd}
                enforced={budgetEnforced}
                controls={controlsOn ? (budget?.controls ?? null) : null}
              />
            ) : null}
            <WorkspacePayerTransition
              key={workspaceId}
              workspaceId={workspaceId}
              canPropose={workspace?.role === "owner"}
              agencyChoices={agencyChoices}
              agencyChoicesError={agencyChoicesError}
              providerChangeEnabled={handoff}
              billedTo={billing?.payerParty ?? null}
            />
            {splits || connect || handoff ? (
              <nav
                aria-label="More about money"
                className={styles.links}
              >
                {connect ? (
                  <XaTextLink href={`/workspace/payments?workspaceId=${id}`}>
                    Payments from your customers
                  </XaTextLink>
                ) : null}
                {splits ? (
                  <>
                    {connect ? <span aria-hidden="true">·</span> : null}
                    <XaTextLink
                      href={`/workspace/money-terms?workspaceId=${id}`}
                    >
                      Prices you&rsquo;ve agreed to
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
                agencyNames={agencyNames}
                planCents={billing?.monthlyCents ?? null}
              />
            </aside>
          ) : null}
        </div>
      </div>
    </StrelvaShell>
  );
}
